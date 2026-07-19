# ffmpeg classWorkerURL을 blob URL로 주입

## 배경

`@ffmpeg/ffmpeg/dist/esm/classes.js:104-110`은 `classWorkerURL`을 주지 않으면 `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`로 워커를 스폰합니다. Vite 번들에서 이 URL은 `/assets/worker-<hash>.js`(빌드) 또는 `/__l5e/...` 같은 실제 네트워크 경로로 해석되어, Cloudflare Static Assets가 COEP 헤더를 붙이지 않는 상태에서 페이지의 `Cross-Origin-Embedder-Policy: credentialless` 정책에 의해 워커 로드가 차단됩니다. 결과: `ff.load()`가 90초 타임아웃.

`coreURL`, `wasmURL`은 이미 `toBlobURL()`로 blob 스킴 URL로 변환해 넘기고 있어 CORP/COEP 대상에서 벗어나 있으므로 성공합니다. 워커도 동일한 우회를 적용합니다.

`@ffmpeg/ffmpeg/dist/esm/worker.js` 파일은 존재 확인 완료 → Vite `?url` import 가능.

`public/offline.html:71`의 다시 시도 버튼은 이미 `location.href = '/?_=' + Date.now()`로 되어 있어 별도 수정 불필요.

## 변경 파일

### `src/lib/convert.ts`

1) import 추가:
```ts
import workerURL from "@ffmpeg/ffmpeg/dist/esm/worker.js?url";
```
2) `getFFmpeg()` 안에서 `coreBlobURL`, `wasmBlobURL` 생성 다음에 워커도 blob 변환:
```ts
const classWorkerBlobURL = await toBlobURL(workerURL, "text/javascript");
console.log("[ffmpeg] loading worker from blob URL", classWorkerBlobURL);
```
3) `ff.load()` 호출에 `classWorkerURL`을 명시적으로 전달:
```ts
await withTimeout(
  ff.load({
    coreURL: coreBlobURL,
    wasmURL: wasmBlobURL,
    classWorkerURL: classWorkerBlobURL,
  }),
  LOAD_TIMEOUT_MS,
  "ffmpeg.load()",
);
```

그 외 로직(타임아웃, 에러 처리, `convertMp4ToMp3` 흐름)은 변경하지 않습니다.

## 이번 계획에서 손대지 않는 것

- `wrangler.json`, `run_worker_first`, nitro/cloudflare 배포 설정
- `scripts/patch-wrangler.mjs`, `scripts/generate-sw.mjs`
- 오프라인 페이지 (이미 요청한 형태로 되어 있음)
- 태그 편집기 / Whisper 관련 코드

## 배포 후 검증 (사용자 확인 요청)

1. 온라인 상태에서 앱 접속 → MP4 업로드 → 변환 버튼.
2. DevTools Console에서 `[ffmpeg] loading worker from blob URL blob:...` 로그가 뜨는지.
3. 90초 타임아웃(`ffmpeg.load() timed out`) 없이 진행률이 흐르고 mp3가 자동 다운로드되는지.
4. `[ffmpeg] load failed` 에러가 더 이상 안 뜨는지.
