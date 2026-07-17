// One-release cleanup worker for old AudioFly builds that registered
// /service-worker.js. The active app worker is now /sw.js.
function isAudioFlyWorkboxCache(name) {
  return /(^|-)precache-v\d+-|(^|-)runtime-|audiofly-|ffmpeg-core|whisper-models/.test(name);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.allSettled(names.filter(isAudioFlyWorkboxCache).map((name) => caches.delete(name)));
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);