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
      filename: "service-worker.js",
      manifest: false,

      workbox: {
        navigateFallback: "/",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/__l5e\//],
        // Include wasm + worker chunks so ffmpeg/whisper work offline once precached.
        globPatterns: [
          "**/*.{js,mjs,css,html,svg,png,ico,webmanifest,json,wasm,worker.js}",
        ],
        // ffmpeg-core.wasm is ~30MB; raise the precache limit accordingly.
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
        runtimeCaching: [
          {
            // Externalized ffmpeg core (wasm + js) via Lovable big-asset proxy
            urlPattern: /\/__l5e\/assets-v1\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "ffmpeg-core",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Whisper.cpp GGML model from Hugging Face — cache after first
            // download so SYLT auto-extract works fully offline.
            urlPattern: ({ url }) =>
              url.origin === "https://huggingface.co" && /\/ggml-.*\.bin/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "whisper-models",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Locally-served whisper model path used by the app's own Cache
            // Storage key — kept here for parity when navigated directly.
            urlPattern: /\/whisper-models\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "whisper-models",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

