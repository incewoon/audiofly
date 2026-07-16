# 두 가지 버그 수정 계획

제안된 분석은 정확합니다. 실제 코드에서도 다음 두 문제가 확인됩니다.

- `src/lib/sw-register.ts`의 `registerAppSW()`는 정의만 있고 어디서도 호출되지 않음 → 서비스 워커 미등록 → 오프라인 미작동.
- `src/lib/whisper/transcribe.ts`에서 `cache.put("whisper-model:...", ...)` 사용 → Cache API는 `http(s)`/상대 URL만 허용하므로 `unsupported scheme` 에러 발생. 이후 재시도에서 네트워크 실패 시 `Failed to fetch`가 표면화.

두 파일만 최소 수정합니다. 다른 기능은 변경하지 않습니다.

## 수정 1: 서비스 워커 등록 호출 추가

파일: `src/routes/__root.tsx`

- `RootComponent` 안에서 `useEffect(() => { registerAppSW(); }, [])` 로 클라이언트 마운트 시 1회 호출.
- `registerAppSW()` 내부에 이미 dev/preview/iframe/`?sw=off` 가드가 있으므로 프리뷰 안전성은 유지됨.
- `vite.config.ts`의 `injectRegister: null`은 유지 (수동 등록만 사용).

검증 방법 (주석으로 남김):
1) 배포된 사이트에서 앱 완전 로드 → DevTools → Application → Service Workers 에서 `/service-worker.js` activated 확인.
2) Network를 Offline으로 전환 후 새로고침 → 앱 셸 정상 로드.
3) `?sw=off` 접속 시 등록 해제 동작 확인.

주의: Lovable 프리뷰/에디터에서는 SW 등록이 의도적으로 거부되므로 오프라인 검증은 published URL(`https://audiofly.lovable.app`)에서 수행.

## 수정 2: Whisper 모델 캐시 키를 유효한 URL로 변경

파일: `src/lib/whisper/transcribe.ts`

변경점:
- `MODEL_CACHE_KEY = "whisper-model:ggml-base-q5_1.bin"` 제거.
- 대신 동일 오리진 URL 기반 `Request` 사용:

```ts
const MODEL_CACHE_URL = "/whisper-models/ggml-base-q5_1.bin";
const cacheKey = new Request(MODEL_CACHE_URL);
```

- `caches.open("whisper-models-v1")` 유지.
- `cache.match(cacheKey)` / `cache.put(cacheKey, new Response(blob, { headers: { "content-type": "application/octet-stream", "content-length": String(blob.size) }}))` 로 교체.
- 캐시 히트 시 네트워크 접근 없음 → 오프라인에서도 즉시 사용.
- 캐시 미스 시에만 Hugging Face `MODEL_URL`에서 스트리밍 fetch 후 저장 (기존 로직 유지).

부가:
- `crossOriginIsolated` 체크, COOP/COEP 헤더(`src/server.ts`, `vite.config.ts`)는 그대로 둠.
- 모델은 실제로 `/whisper-models/...` 경로에 파일이 존재하지 않아도 됨 — Cache Storage는 임의의 same-origin URL을 키로 사용 가능하며 네트워크와는 무관.

## 변경 파일 요약

- `src/routes/__root.tsx` — `registerAppSW()` 호출 추가 (import + useEffect).
- `src/lib/whisper/transcribe.ts` — 캐시 키를 `Request("/whisper-models/ggml-base-q5_1.bin")`로 교체.

## 리스크

- SW가 처음으로 실제 등록되면서 배포 후 최초 방문자는 다음 재방문부터 오프라인 지원됨(정상 동작).
- 기존에 방문했던 사용자에게는 이번 배포가 최초 SW 설치가 되므로 stale 캐시 이슈 없음.
