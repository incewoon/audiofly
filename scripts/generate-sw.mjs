// scripts/generate-sw.mjs
// nitro의 `.output/public`이 완성된 뒤에 실행되어야 함 (package.json의 postbuild 훅으로 연결).
// VitePWA 플러그인이 Vite 빌드 시점(dist/)과 nitro 최종 배포 폴더(.output/public/)의
// 불일치로 계속 잘못된 경로를 precache에 넣던 문제를 근본적으로 없애기 위해,
// 최종 폴더가 확정된 뒤 직접 workbox-build를 호출한다.
import { generateSW } from "workbox-build";
import { existsSync } from "node:fs";

const PUBLIC_DIR = ".output/public";

if (!existsSync(PUBLIC_DIR)) {
  console.error(`[generate-sw] ${PUBLIC_DIR} 가 없습니다. nitro 빌드가 먼저 끝나야 합니다.`);
  process.exit(1);
}

const { count, size, warnings } = await generateSW({
  swDest: `${PUBLIC_DIR}/sw.js`,
  globDirectory: PUBLIC_DIR,
  globPatterns: [
    "**/*.{js,mjs,cjs,css,html,svg,png,ico,webmanifest,json,wasm}",
  ],
  // sw.js 자기 자신과 workbox 런타임 청크는 스캔 시점에 아직 안 만들어졌거나
  // 자기참조가 되면 안 되므로 제외.
  globIgnores: ["sw.js", "workbox-*.js"],
  navigateFallback: "/offline.html",
  navigateFallbackDenylist: [/^\/_oauth/, /^\/api/],
  cleanupOutdatedCaches: true,
  skipWaiting: true,
  clientsClaim: true,
  maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
  runtimeCaching: [
    {
      urlPattern: ({ url }) =>
        url.origin === self.location?.origin ||
        (url.pathname === "/ffmpeg/ffmpeg-core.js" || url.pathname === "/whisper/shout.wasm.js"),
      handler: "CacheFirst",
      options: {
        cacheName: "audiofly-media-engines-v2",
        expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ url }) =>
        /^\/__l5e\/assets-v1\//.test(url.pathname) &&
        /(ffmpeg-core\.wasm|ggml-base-q5_1\.bin)$/.test(url.pathname),
      handler: "CacheFirst",
      options: {
        cacheName: "audiofly-media-engines-v2",
        expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
        rangeRequests: true,
      },
    },
  ],
});

console.log(`[generate-sw] sw.js 생성 완료: ${count}개 파일, ${(size / 1024 / 1024).toFixed(1)}MB precache`);
if (warnings.length) console.warn("[generate-sw] 경고:", warnings);
