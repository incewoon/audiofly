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
        "icons/*.png",
        "ffmpeg/ffmpeg-core.js",
        "whisper/shout.wasm.js",
      ],

      workbox: {
        navigateFallback: "/",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Include Vite chunks, public app assets, wasm-bearing modules, and dynamic imports.
        globPatterns: [
          "**/*.{js,mjs,cjs,css,html,svg,png,ico,webmanifest,json,wasm}",
        ],
        // Engine files are large: ffmpeg-core.wasm ~31MB, Whisper model ~57MB.
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            // Local engine JS files used by ffmpeg and whisper pthread workers.
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
            // Externalized ffmpeg core wasm and bundled Whisper GGML model.
            urlPattern: ({ url }) =>
              url.origin === globalThis.location.origin &&
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
          {
            // Kept only as a safety net for old cached builds that used the
            // Hugging Face model URL before AudioFly bundled it as a same-origin asset.
            urlPattern: ({ url }) =>
              url.origin === "https://huggingface.co" && /\/ggml-.*\.bin/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "audiofly-media-engines-v2",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});

