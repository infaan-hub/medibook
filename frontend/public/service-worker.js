/*
 * MediBook service worker (§18 PWA, hand-written — no Workbox).
 * Strategy: app-shell precache + network-first for navigation requests with
 * offline.html fallback; stale-while-revalidate for same-origin static assets.
 */
const VERSION = "v1";
const SHELL_CACHE = `medibook-shell-${VERSION}`;
const RUNTIME_CACHE = `medibook-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/offline.css",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API calls go straight to network

  // Navigations: network-first, offline.html fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match("/offline.html"))
            .then((hit) => hit ?? caches.match("/index.html"))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});