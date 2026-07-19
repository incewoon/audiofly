# AudioFly – 근본 원인 두 가지 수정 계획 (보강본)

## 배경

- **원인 1**: Cloudflare Workers Static Assets는 `_headers`를 지원하지 않음. `@ffmpeg/ffmpeg`의 워커 청크 등 정적 자산에 COOP/COEP가 붙지 않아 `crossOriginIsolated`가 false → `ffmpeg.load()` 타임아웃.
- **원인 2**: `generate-sw.mjs`가 `navigateFallback: "/offline.html"`을 사용해 온라인 상태에서도 내비게이션이 즉시 offline.html로 대체됨.

`ConverterForm.tsx`의 변환/다운로드/진행률 흐름은 이미 사양대로 구현되어 있음 (progress state, Blob(`audio/mpeg`) + `URL.createObjectURL` + `<a download>`). 검증 4에서 문제가 확인될 때만 수정.

## 변경 사항

### 1) `scripts/patch-wrangler.mjs` (신규) — fail-loud

nitro가 wrangler.json을 JSONC(주석 포함)로 뱉는 케이스가 있으므로 `JSON.parse` 실패를 조용히 넘기지 않고 **빌드를 실패**시켜 상황을 즉시 표면화. 파일이 아예 없는 경우에만 스킵.

```js
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), ".output/server/wrangler.json");
if (!existsSync(target)) {
  console.log("[patch-wrangler] skip: .output/server/wrangler.json not found");
  process.exit(0);
}

const raw = await readFile(target, "utf8");
// JSONC 방어: 주석/트레일링 콤마 제거 후 파싱. 파싱 실패는 fail-loud.
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
  .replace(/,\s*([}\]])/g, "$1");

let cfg;
try {
  cfg = JSON.parse(stripped);
} catch (err) {
  console.error("[patch-wrangler] FAILED to parse wrangler.json:", err?.message ?? err);
  console.error("[patch-wrangler] raw content follows ─────");
  console.error(raw);
  process.exit(1);
}

if (typeof cfg !== "object" || cfg === null) {
  console.error("[patch-wrangler] FAILED: wrangler.json root is not an object");
  process.exit(1);
}

cfg.assets = { ...(cfg.assets ?? {}), run_worker_first: true };
await writeFile(target, JSON.stringify(cfg, null, 2));
console.log("[patch-wrangler] OK: assets.run_worker_first = true");
```

### 2) `package.json`

```json
"postbuild": "node scripts/generate-sw.mjs && node scripts/patch-wrangler.mjs"
```

### 3) `scripts/generate-sw.mjs`

- `navigateFallback`, `navigateFallbackDenylist` 제거.
- `runtimeCaching` 맨 앞에 내비게이션 `NetworkOnly` 규칙 추가. `handlerDidError`가 `undefined`를 반환하면 workbox가 그대로 통과시켜 흰 화면이 뜰 수 있으므로, `caches.match()` 실패 시 최소 offline `Response`로 방어.

```js
{
  urlPattern: ({ request, url }) =>
    request.mode === "navigate" &&
    !url.pathname.startsWith("/api") &&
    !url.pathname.startsWith("/_oauth"),
  handler: "NetworkOnly",
  options: {
    plugins: [
      {
        handlerDidError: async () => {
          const cached = await caches.match("/offline.html");
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset='utf-8'><title>Offline</title><p>오프라인 상태입니다.</p>",
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        },
      },
    ],
  },
},
```

기존 엔진 자산 CacheFirst 규칙은 유지.

### 4) `src/components/ConverterForm.tsx`

현재 흐름 재확인만. 사양과 일치하면 변경 없음.

### 5) 조건부: `src/server.ts`

정적 자산이 404/SPA fallback으로 응답되는 경우에만 `handler.fetch()` 결과가 404일 때 `env.ASSETS.fetch(request)`로 폴백 추가.

## 배포 후 검증 (사용자 실행 및 보고 요청)

### 사전 단계 (신규)

0-a. **빌드 로그 확인**: 배포 로그에서
- `[generate-sw] sw.js 생성 완료: N개 파일`
- `[patch-wrangler] OK: assets.run_worker_first = true`
두 줄이 모두 찍혔는지 확인. `[patch-wrangler] FAILED...` 또는 `skip: ... not found`가 뜨면 그 로그를 그대로 보고.

0-b. **이전 SW/캐시 클리어**: DevTools → Application →
- Service Workers → 기존 등록된 SW **Unregister**
- Storage → **Clear site data** (Cache storage 포함)
- 그런 다음 하드 리로드. (이 단계를 건너뛰면 이전 build의 stale precache가
  계속 offline.html을 서빙해 검증 결과를 신뢰할 수 없음.)

### 본 검증

1. Published URL 접속 → SW `/sw.js` activated 확인.
2. Network Offline → 새로고침 → `offline.html` 표시.
3. Network Online 복귀 → 새로고침 → **실제 메인 페이지(MP4 변환 폼)** 표시.
4. MP4 업로드 → 변환 → 진행률 → mp3 자동 다운로드.
5. Network 탭 응답 헤더:
   - `worker-*.js`, `/ffmpeg/ffmpeg-core.js`, `/assets/index-*.js`가 **200** + 올바른 `Content-Type`.
   - `Cross-Origin-Embedder-Policy: credentialless`
   - `Cross-Origin-Opener-Policy: same-origin`
   - Console: `crossOriginIsolated === true`
6. 정적 자산이 **404 / SPA fallback**으로 응답되면 그 URL·응답을 보고 → `src/server.ts`에 `env.ASSETS` 폴백 추가.

## 수정 파일 요약

- 신규: `scripts/patch-wrangler.mjs`
- 수정: `package.json`, `scripts/generate-sw.mjs`
- 조건부(검증 4·6 결과에 따라): `src/components/ConverterForm.tsx`, `src/server.ts`
