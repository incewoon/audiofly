## 목표
현재 AudioFly의 핵심 기능을 다시 안정화합니다.

1. 설치형 PWA가 오프라인에서 앱 화면을 로드하도록 수정
2. 온라인 웹 접근 상태에서도 MP4 → MP3 변환이 정상 동작하도록 복구
3. MP3 태그 편집 저장과 SYLT 음성 자동추출이 멈추지 않도록 복구

## 확인된 주요 위험 지점

- Service Worker 설정이 `/service-worker.js`와 `/sw.js` 기준이 섞여 있고, 현재 PWA 지침과 맞지 않아 설치 앱에서 오프라인 fallback이 제대로 작동하지 않을 수 있습니다.
- `navigateFallbackDenylist`에 `/__l5e/`가 들어 있어 외부화된 ffmpeg WASM 경로의 캐시/재요청 전략이 애매합니다.
- `ffmpeg-core.js`는 public에 있지만 `ffmpeg-core.wasm`은 Lovable asset proxy 경로라, 런타임 캐싱과 명시적 pre-warm 없이는 오프라인 첫 실행/재실행에서 실패할 수 있습니다.
- `@transcribe/transcriber`는 모델만 있으면 되는 구조가 아니라 `@transcribe/shout`의 WASM JS 모듈까지 앱 번들/캐시에 안정적으로 포함되어야 합니다.
- SYLT 현재 구현은 모델 100% 이후 `FileTranscriber.init()` 또는 `transcribe()` 내부 resolve가 안 오는 경우 사용자가 멈춘 것처럼 보입니다.
- `browser-id3-writer`의 SYLT 프레임 지원은 제한적일 수 있어, 태그 저장 실패가 전체 저장 실패로 번질 가능성이 있습니다.

## 구현 계획

### 1) PWA 오프라인 로드 복구
- `vite.config.ts`의 PWA 설정을 현재 프로젝트에 맞게 정리합니다.
- Service Worker 파일명을 PWA 안전 지침에 맞춰 `/sw.js`로 표준화하고, 기존 `/service-worker.js` 사용자는 한 번 정리되도록 등록 래퍼에서 legacy unregister를 유지합니다.
- 앱 shell HTML 네비게이션은 오프라인 fallback이 `/`로 가도록 유지하되, HTML은 cache-first가 아닌 안전한 navigation fallback/Workbox 기본 흐름을 사용합니다.
- `globPatterns`를 다음 리소스까지 포함하도록 확장합니다.
  - `js`, `mjs`, `css`, `html`, `json`, `png`, `svg`, `ico`, `wasm`
  - Vite가 분리한 동적 import chunk
  - `@transcribe/shout` 번들 결과물
- `maximumFileSizeToCacheInBytes`를 ffmpeg/whisper 관련 큰 파일을 고려해 충분히 올립니다.
- `src/lib/sw-register.ts`와 `src/routes/__root.tsx`에서 SW 등록 위치를 하나로 정리합니다.
- `src/routes/index.tsx`의 중복 `registerAppSW()` 호출은 제거합니다.

### 2) ffmpeg MP4 변환 복구
- `src/lib/convert.ts`에서 ffmpeg core URL을 asset pointer JSON에서 읽는 방식 또는 단일 상수 방식으로 정리해 배포 경로 불일치를 줄입니다.
- `ff.load()` 전에 다음 파일을 명시적으로 `fetch()`로 점검/캐시 warm-up 합니다.
  - `/ffmpeg/ffmpeg-core.js`
  - `/__l5e/assets-v1/.../ffmpeg-core.wasm`
- `ff.load()` 실패 시 사용자에게 “오프라인 캐시 미완료/변환 엔진 파일 로드 실패”처럼 원인을 구분해 보여줄 수 있게 에러 메시지를 강화합니다.
- 변환 중 멈춤 방지를 위해 `ff.load()`와 `ff.exec()`에 timeout 및 재시도 가능 상태 초기화를 유지/보강합니다.
- `vite.config.ts` runtimeCaching에 `/ffmpeg/ffmpeg-core.js`와 `/__l5e/assets-v1/.../ffmpeg-core.wasm`을 명확히 CacheFirst로 추가합니다.

### 3) MP3 태그 편집 저장 안정화
- `src/lib/id3.ts`에서 태그 프레임 적용을 방어적으로 처리합니다.
- 기본 태그(TIT2/TPE1/TPE2/TALB/TRCK/TCON/USLT/APIC)는 저장 실패 시 어느 프레임에서 실패했는지 콘솔에 남기고, 가능한 항목은 계속 저장되도록 합니다.
- SYLT 프레임이 라이브러리에서 완전히 지원되지 않는 경우에도 전체 MP3 저장이 실패하지 않도록 fallback 처리합니다.
- `TagEditorForm`의 파일 선택 → 태그 읽기 → 저장 경로에서 `status`가 실패 후 idle로 돌아오도록 보장합니다.

### 4) SYLT 음성 자동추출 멈춤 복구
- `src/lib/whisper/transcribe.ts`에서 다음 순서로 로직을 분리합니다.
  1. 모델 Cache Storage 조회
  2. 없으면 온라인 fetch 후 캐시 저장
  3. `@transcribe/transcriber` / `@transcribe/shout` 동적 import
  4. `FileTranscriber` 생성
  5. init timeout
  6. transcribe timeout
- 모델 캐시 키는 현재처럼 same-origin URL을 유지하여 `whisper-model:` scheme 오류가 다시 나지 않게 합니다.
- 오프라인 상태에서 모델이 없으면 즉시 “최초 1회 온라인 다운로드 필요” 에러를 표시하고, 무한 fetch 대기를 하지 않게 합니다.
- `FileTranscriber`가 내부에서 null PCM 또는 완료 callback 미호출로 멈추는 경우를 대비해 다음을 추가합니다.
  - `AudioContext.decodeAudioData` 실패를 명시적 에러로 변환
  - transcribe timeout 시 `cancel()`/`destroy()` 가능한 범위에서 정리
  - `threads`를 모바일 안정성을 위해 2 이하로 제한
  - `onComplete`, `onSegment`, `print`, `printErr`, `onAbort`, `onExit` 로그 연결
- `LyricsDialog`에서 모델 100% 이후 상태가 “인식 중”으로 넘어가는지 명확히 표시하고, 실패하면 토스트에 실제 원인을 보여줍니다.

### 5) 검증 방법 주석 추가
수정 파일 하단 또는 관련 함수 주석으로 다음 절차를 남깁니다.

```text
온라인 published URL에서 1회 실행:
1. 앱 접속 후 Service Worker 활성화 확인
2. MP4 변환 1회 실행해서 ffmpeg core 캐시 확인
3. 태그 편집에서 MP3 선택/저장 확인
4. SYLT 자동추출 1회 실행해서 Whisper 모델 캐시 확인
5. 네트워크를 Offline으로 바꾸고 앱 새로고침
6. 앱 화면 로드, MP4 변환, 태그 편집, SYLT 자동추출 재실행 확인
```

## 수정 대상 파일

- `vite.config.ts`
- `src/lib/sw-register.ts`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/lib/convert.ts`
- `src/lib/id3.ts`
- `src/lib/whisper/transcribe.ts`
- 필요 시 `src/components/LyricsDialog.tsx`, `src/components/TagEditorForm.tsx`의 상태/오류 표시만 최소 수정

## 범위 제외

- UI 디자인 개편은 하지 않습니다.
- 새 외부 음성인식 서비스/API는 붙이지 않습니다.
- 데이터베이스나 서버 업로드 기능은 추가하지 않습니다.
- 기존 파일명 프리셋/메타데이터 입력 UX는 건드리지 않습니다.