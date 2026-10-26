/**
 * Service Worker for Ants Feast PWA
 * Provides offline caching, app installability, and instant loading.
 */

const CACHE_NAME = "ants-feast-v7";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./dist/bundle.js",
  "./manifest.webmanifest",
  "./manifest.json",
  "./assets/images/ant_sheet.png",
  "./assets/images/caterpillar.png",
  "./assets/images/food.png",
  "./assets/images/grass.png",
  "./assets/images/trayWithCompleteClothe.png",
  "./assets/images/icon-192.png",
  "./assets/images/icon-512.png",
  "./assets/images/icon-192-maskable.png",
  "./assets/images/icon-512-maskable.png",
  "./assets/audio/music.ogg",
  "./assets/audio/ant-fall.ogg",
  "./assets/audio/food-eaten.ogg",
  "./assets/audio/game-over.ogg",
  "./assets/audio/ui-tap.ogg",
  "./assets/audio/ui-toggle.ogg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  const isCodeAsset =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/bundle.js") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/");

  if (isCodeAsset) {
    // Network-First for HTML and JS bundles: always load fresh game code when online,
    // and fall back to the precached offline bundle when network is unavailable.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Stale-While-Revalidate for images, audio, and static assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => Promise.reject(new Error("Offline asset not found in cache")));
    })
  );
});
