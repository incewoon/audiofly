// vite.config.ts

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Enable cross-origin isolation so SharedArrayBuffer works (required by whisper.cpp WASM).
const coopCoepHeaders = () => ({
  name: "coop-coep-headers",
  configureServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      next();
    });
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      next();
    });
  },
});

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [
    coopCoepHeaders(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      filename: "sw.js",
      manifest: false,
      includeAssets: [
        "manifest.json",
        "offline.html",
        "icons/*.png",
        "ffmpeg/ffmpeg-core.js",
        "whisper/shout.wasm.js",
      ],

      workbox: {
        globDirectory: "dist/client",   // client 빌드 폴더로 명시
        navigateFallback: "/offline.html",
        //navigateFallbackDenylist: [/^\\/~oauth/, /^\\/api\\//],
        navigateFallbackDenylist: [/^\/_oauth/, /^\/api/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: [
          "**/*.{js,mjs,cjs,css,html,svg,png,ico,webmanifest,json,wasm}",
        ],
        globIgnores: [
          "server/**",
          "**/server/**",
          "_worker.js",
          "**/_worker.js",
        ],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === globalThis.location.origin &&
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
              url.origin === globalThis.location.origin &&
              /^\\/__l5e\\/assets-v1\\//.test(url.pathname) &&
              /(ffmpeg-core\\.wasm|ggml-base-q5_1\\.bin)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "audiofly-media-engines-v2",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});

