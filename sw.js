/**
 * Service Worker for Ants Feast PWA
 * Provides offline caching, app installability, and instant loading.
 */

const CACHE_NAME = "ants-feast-v1";

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

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate: return cache immediately, update in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
          })
          .catch(() => {
            // Offline or background network failure: cached response is already returned
          });
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
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return Promise.reject(new Error("Offline asset not found in cache"));
        });
    })
  );
});
