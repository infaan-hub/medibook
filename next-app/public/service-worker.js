/*
 * MediBook service worker (§18 PWA, hand-written — no Workbox).
 * Strategy: app-shell precache + network-first for navigation requests with
 * offline.html fallback; stale-while-revalidate for same-origin static assets.
 */
const VERSION = "v3";
const SHELL_CACHE = `medibook-shell-${VERSION}`;
const RUNTIME_CACHE = `medibook-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "/",
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
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, offline.html fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() =>
          caches.match("/").then((hit) => hit || caches.match("/offline.html").then((offline) => offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })))
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
        .catch(() => cached || new Response("", { status: 408 }));
      return cached || network;
    })
  );
});

// Web Push — show notification when a push event arrives.
// Payload: {title, body, url, tag, appointment_id?, notification_id?}
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "MediBook";
  const options = {
    body: payload.body || "You have a new appointment update.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/notifications" },
    // Browser-level dedup (reminders share a tag per appointment).
    tag: payload.tag || undefined,
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — focus an open client on the target URL, else open it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            void client.focus();
            if ("navigate" in client && client.url) {
              try {
                void client.navigate(targetUrl);
                return;
              } catch {
                /* fall through to openWindow */
              }
            }
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
