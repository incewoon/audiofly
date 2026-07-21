## 목표
SYLT 음성인식만 개선. 다른 코드(엔진 로딩, ffmpeg, SW 등)는 건드리지 않는다.

## 문제 진단
현재 `src/lib/whisper/transcribe.ts`:
- 모델: `ggml-base-q5_1.bin` (~57MB) — 정확도가 낮음.
- 언어: `lang: "auto"` — 자동 감지에 매 세그먼트 추가 연산이 들어가 크게 느려지고, 짧은 음악 구간에서 오검출로 정확도도 떨어짐.
- 모델 다운로드가 "자동추출" 버튼을 눌러야 시작됨 → 최초 사용 시 온라인 필수인데 사용자는 이 시점을 인지하기 어려움. 오프라인에서 캐시 없으면 실패.

## 개선안

### 1. 모델 업그레이드 (정확도)
- 현재 base(57MB) → **small-q5_1(~190MB)** 로 교체. 한국어/영어 모두 정확도가 눈에 띄게 향상되고 파일당 처리 시간도 base 대비 극단적으로 늘지 않는다.
- 다운로드 소스: Hugging Face `ggerganov/whisper.cpp` 의 `ggml-small-q5_1.bin` (공개, CORS 허용).
- `engine-assets.ts`의 `WHISPER_MODEL_URL`을 이 외부 URL로 교체하고 pointer JSON 참조는 제거.
- 이 URL은 `ENGINE_CACHE_URLS`에서 뺀다. **SW prewarm 대상에서 제외** → 앱 최초 접속 시 자동 다운로드되지 않는다(사용자가 원하는 "수동 1회 다운로드" 요구).

### 2. 언어 토글 (속도 + 정확도)
- `LyricsDialog` SYLT 모드 상단에 "한국어 / English" 토글 (ToggleGroup 2개 버튼) 배치.
- 마지막 선택값은 `localStorage.audiofly.whisper.lang`에 저장, 재열람 시 복원.
- `transcribeMp3(file, { lang: "ko" | "en", ... })` 로 전달, `FileTranscriber.transcribe`의 `lang`을 고정값으로 넘김 (auto 제거).

### 3. 모델 수동 다운로드 UI
`LyricsDialog` SYLT 화면에 새 영역 추가 (음성인식 버튼 위):
- 상태 배지: **"모듈: 다운로드됨"** / **"모듈: 미설치"** — 마운트 시 `caches.match(WHISPER_MODEL_URL)` 로 판정.
- 미설치 상태:
  - **"음성인식 모듈 다운로드(약 190MB)"** 버튼 노출.
  - 클릭 시 온라인에서 fetch → 진행률 progress bar → Cache Storage(`audiofly-media-engines-v2`)에 저장 → 상태를 "다운로드됨"으로 갱신.
  - 자동추출 버튼은 이 동안 disabled.
- 설치됨 상태:
  - "재다운로드" 소형 버튼(캐시 삭제 후 재다운로드) + 삭제 버튼 옵션.
  - **"음성인식으로 자동추출"** 버튼 활성화.
- 오프라인일 때: 캐시가 있으면 정상 동작 / 없으면 "먼저 온라인에서 모듈을 다운로드하세요" 안내(현재 문구를 다듬음).

### 4. `transcribe.ts` 최소 변경
- `loadModelBlob`: 이미 Cache Storage 사용 중. 로직 재사용하되 `WHISPER_MODEL_URL`이 외부 origin이므로 fetch에서 `credentials: "same-origin"` 제거, `mode: "cors"` 유지. 캐시 키는 그대로 URL Request.
- 신규 export: `isWhisperModelCached()`, `downloadWhisperModel(onProgress)`, `deleteWhisperModel()` — LyricsDialog가 호출.
- `transcribeMp3` 시그니처에 `lang: "ko" | "en"` 추가(옵셔널 → 기본 `"ko"`). 내부 `lang: "auto"` 제거.
- 성능: `token_timestamps` 유지, `suppress_non_speech: true`로 변경(음악 배경 무음 잡음 감소).

### 5. 건드리지 않는 것
- `sw-register.ts`, `generate-sw.mjs`, `vite.config.ts`, `convert.ts`, ffmpeg 관련 전부.
- `ENGINE_CACHE_NAME`은 유지 (기존 base 모델 캐시 항목은 사용자가 재다운로드 시 자연스럽게 대체됨. 기존 캐시는 자동 삭제하지 않음 — 안전).
- 기존 `public/whisper-models/ggml-base-q5_1.bin.asset.json`은 파일만 남겨두고 참조 제거(리스크 최소화). 원하면 후속 정리.

## 변경 파일
```text
src/lib/engine-assets.ts        WHISPER_MODEL_URL 교체, ENGINE_CACHE_URLS에서 제외
src/lib/whisper/transcribe.ts   lang 파라미터 + 모델 캐시 상태/다운로드/삭제 export
src/components/LyricsDialog.tsx 언어 토글 + 모듈 상태/다운로드 UI
```

## 검증
1. 온라인에서 태그편집 → SYLT → 언어 "한국어" 선택 → "모듈 다운로드" 클릭 → 진행률 100% → "다운로드됨" 표시.
2. 네트워크 오프라인 전환 → 자동추출 실행 → 정상 동작(캐시 hit).
3. 3분 곡 처리 시간이 현재보다 유의미하게 짧아지는지 확인(auto 제거 효과).
4. 캐시 삭제 후 오프라인 상태에서 자동추출 → "먼저 온라인에서 모듈을…" 안내.
