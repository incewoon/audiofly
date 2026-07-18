## 검증 결과 (외부 AI 지적 재확인)

실제 코드를 확인한 결과입니다:

| # | 지적 내용 | 검증 결과 |
|---|---|---|
| 1 | asset URL 하드코딩이 4곳에 중복 | **사실.** `convert.ts`, `whisper/transcribe.ts`, `sw-register.ts`(2회), `vite.config.ts`(정규식만)에 박혀 있음. 그러나 pointer(`*.asset.json`)의 값과 **현재는 일치**하므로 "지금 이미 어긋나 있다"는 진단은 확인 안 됨. 위험 구조는 맞음 — 재업로드 시 4곳을 놓치면 즉시 깨짐. |
| 2 | 오프라인에서 앱 shell 로드 실패 | **사실.** `nitro`(Cloudflare) SSR 라우트라 정적 `index.html`이 산출물에 없음. `navigateFallback: "/"`가 매칭할 precache 문서가 없어 오프라인에서 shell을 못 띄움. |
| 3 | COOP/COEP가 production에 미적용 | **부분적으로 틀림.** `vite.config.ts`의 `coopCoepHeaders()`는 dev/preview 전용이 맞지만, `src/server.ts`의 `withCrossOriginIsolation()`이 이미 모든 production 응답에 COOP/COEP를 붙임. `crossOriginIsolated`는 production에서도 true여야 함 — SYLT 실패의 원인은 이것이 아닐 가능성이 큼(다만 published에서 실제 헤더는 확인 필요). |
| 4-a | `assertReachable` + `toCachedBlobURL` 이중 fetch | **사실.** 30MB WASM을 두 번 받음. `force-cache`로 브라우저가 두 번째는 캐시 히트하지만 모바일에서 중복 낭비 및 hang 위험. |
| 4-b | 정규식 백슬래시 유실 | **틀림.** 실제 소스에는 백슬래시 정상. 노트 복사 아티팩트. |

## 목표

1. asset URL을 **단일 소스**(pointer JSON)에서만 읽도록 리팩터링해 재발 방지.
2. 오프라인에서 앱 shell이 실제로 로드되도록 정적 fallback 문서 제공.
3. Published site에서 COOP/COEP 헤더가 붙어 오는지 실측하고, 붙지 않으면 대체 수단 추가.
4. `convert.ts`의 이중 fetch를 한 번으로 통합.

## 구현 계획

### 1) 자산 URL 단일 소스화

- **신규**: `src/lib/engine-assets.ts` 생성. `public/ffmpeg/ffmpeg-core.wasm.asset.json`과 `public/whisper-models/ggml-base-q5_1.bin.asset.json`을 JSON import 해서 `CORE_WASM_URL`, `WHISPER_MODEL_URL`을 export.
  ```ts
  import ffmpegPtr from "../../public/ffmpeg/ffmpeg-core.wasm.asset.json";
  import whisperPtr from "../../public/whisper-models/ggml-base-q5_1.bin.asset.json";
  export const CORE_WASM_URL = ffmpegPtr.url;
  export const WHISPER_MODEL_URL = whisperPtr.url;
  export const CORE_JS_URL = "/ffmpeg/ffmpeg-core.js";
  export const SHOUT_WASM_JS_URL = "/whisper/shout.wasm.js";
  export const ENGINE_CACHE_NAME = "audiofly-media-engines-v2";
  export const ENGINE_CACHE_URLS = [CORE_JS_URL, SHOUT_WASM_JS_URL, CORE_WASM_URL, WHISPER_MODEL_URL];
  ```
- **수정**: `src/lib/convert.ts`, `src/lib/whisper/transcribe.ts`, `src/lib/sw-register.ts` — 하드코딩된 URL을 위 모듈에서 import.
- **수정**: `vite.config.ts`의 runtimeCaching 정규식은 pathname 패턴 매칭(파일명 기반)이라 그대로 두되, 주석에 "asset URL은 pointer JSON이 유일한 진실"임을 명시.

### 2) 오프라인 앱 shell fallback

- **신규**: `public/offline.html` — 완전 정적 HTML, 최소 스타일. 앱 이름/로고 + "오프라인에서는 앱을 새로 로드할 수 없습니다. 이미 열려있는 탭에서는 변환/편집/추출 기능이 정상 동작합니다."
- **수정**: `vite.config.ts` workbox — `navigateFallback: "/offline.html"`로 변경, `includeAssets`에 `"offline.html"` 추가.
- 이유: SSR `/` 라우트는 precache에 넣을 수 없으므로 별도 정적 shell로 폴백. 이미 열려 활성화된 SW 컨트롤 상태의 탭은 캐시된 앱 JS/WASM으로 계속 작동함.

### 3) COOP/COEP production 실측 & 안전망

- `src/server.ts`의 `withCrossOriginIsolation()`은 이미 붙어 있으므로 코드 변경 없음.
- **신규**: `public/_headers` — Cloudflare Pages 스타일 fallback을 넣어 두어, worker가 정적 파일을 직접 서빙하는 경로에서도 헤더가 유지되게 함:
  ```
  /*
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: credentialless
  ```
- 사용자에게 published URL 접속 후 DevTools에서 `crossOriginIsolated === true` 실측을 요청. false로 나오면 그때 nitro 훅 방식으로 별도 대응.

### 4) `convert.ts` 이중 fetch 통합

- `assertReachable()` 제거. `toCachedBlobURL()` 하나에서 fetch → status 검사 → blob 반환.
- `CORE_JS_URL`, `CORE_WASM_URL` 각각 한 번씩만 fetch.
- 실패 시 에러 메시지에 어느 파일이 실패했는지 그대로 포함.

## 수정 대상 파일

- 신규: `src/lib/engine-assets.ts`, `public/offline.html`, `public/_headers`
- 수정: `src/lib/convert.ts`, `src/lib/whisper/transcribe.ts`, `src/lib/sw-register.ts`, `vite.config.ts`

## 범위 제외

- UI, ID3 태그 로직, LyricsDialog/TagEditorForm은 손대지 않음.
- Whisper 모델 재업로드나 asset 파이프라인 변경 없음.
- nitro 커스텀 훅으로 COOP/COEP 재적용은 실측에서 문제 확인 후에만.

## 검증 절차 (사용자 실행)

1. Published URL 접속 → DevTools console: `crossOriginIsolated` 값 확인.
2. MP4 → MP3 변환 1회 성공 확인.
3. SYLT 자동추출 1회 성공(모델 다운로드 포함) 확인.
4. Application → Service Workers에 `/sw.js` active, Cache Storage에 engine 파일 존재 확인.
5. Network Offline → 새로고침 → `offline.html` 표시 확인.
6. 이미 열려있던 탭에서 변환/추출 재실행 → 캐시된 엔진으로 성공 확인.
