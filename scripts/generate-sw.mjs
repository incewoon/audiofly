// scripts/generate-sw.mjs
import { generateSW } from "workbox-build";
import { existsSync } from "node:fs";
import path from "node:path";

// 1. 환경에 따른 최종 출력 폴더 후보군 (배포 서버는 dist/client, 로컬은 .output/public)
const TARGET_DIRS = ["dist/client", ".output/public"];
let PUBLIC_DIR = "";

// 2. 두 폴더 중 하나가 생성될 때까지 최대 15초간 대기 (타이밍 이슈 해결)
const startTime = Date.now();
const timeout = 15000;

console.log("[generate-sw] 최종 빌드 폴더를 탐색 중...");

while (Date.now() - startTime < timeout) {
  for (const dir of TARGET_DIRS) {
    if (existsSync(path.resolve(process.cwd(), dir))) {
      PUBLIC_DIR = dir;
      break;
    }
  }
  if (PUBLIC_DIR) break;

  // 0.5초 쉼 (CPU 과부하 방지)
  const stop = Date.now() + 500;
  while (Date.now() < stop) {}
}

if (!PUBLIC_DIR) {
  console.error(`[generate-sw] 에러: 빌드 폴더(${TARGET_DIRS.join(" 또는 ")})를 찾을 수 없습니다. 빌드가 실패했거나 진행 중입니다.`);
  process.exit(1);
}

console.log(`[generate-sw] 대기 완료! 대상 폴더 확정: "${PUBLIC_DIR}"`);

// 3. 서비스 워커 빌드 프로세스 진행
const { count, size, warnings } = await generateSW({
  swDest: `${PUBLIC_DIR}/sw.js`,
  globDirectory: PUBLIC_DIR,
  globPatterns: [
    "**/*.{js,mjs,cjs,css,html,svg,png,ico,webmanifest,json,wasm}",
  ],
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
