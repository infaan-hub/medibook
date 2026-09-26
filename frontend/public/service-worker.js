/*
 * MediBook service worker (§18 PWA, hand-written — no Workbox).
 * Strategy: app-shell precache + network-first for navigation requests with
 * offline.html fallback; stale-while-revalidate for same-origin static assets.
 *
 * /api/* and /media/* are NEVER intercepted: API responses must stay fresh,
 * database-backed images are served directly by the backend (with its own
 * cache headers), and aborted asset fetches must not surface as 408s.
 *
 * /_next/static/* is also never intercepted: those URLs are content-hashed and
 * immutable, so Vercel already serves them with far-future expiry. Caching them
 * broke real navigations — a stale chunk entry produced
 * `ChunkLoadError: Loading chunk 807 failed`, and a rejected `cache.put` on an
 * opaque/aborted body produced `ERR_CACHE_READ_FAILURE`.
 *
 * /manifest.json is network-first and never written to a cache: Chrome reads it
 * to decide installability, so it must always reflect the live file.
 */
const VERSION = "v6";
const SHELL_CACHE = `medibook-shell-${VERSION}`;
const RUNTIME_CACHE = `medibook-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "/",
  "/offline.html",
  "/offline.css",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

// `cache.put` rejects when the body stream errors (navigation aborted, server
// reset). That must never take down the fetch handler or the install step.
function put(cacheName, key, response) {
  return caches
    .open(cacheName)
    .then((cache) => cache.put(key, response))
    .catch(() => undefined);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // One missing asset must not abort the whole precache.
        Promise.all(SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined)))
      )
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
  // API calls and database-backed media bypass the SW entirely.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
  // Hashed, immutable build assets — let the CDN answer, never cache them.
  if (url.pathname.startsWith("/_next/static/")) return;

  // Manifest: network-first, never cached. Chrome re-reads it to decide
  // installability; serving a cached copy hides manifest updates from it.
  if (url.pathname === "/manifest.json") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(request)
          .then(
            (hit) =>
              hit ||
              new Response("{}", {
                status: 500,
                headers: { "Content-Type": "application/json" },
              })
          )
      )
    );
    return;
  }

  // Navigations: network-first, offline.html fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            put(SHELL_CACHE, "/", response.clone());
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
            put(RUNTIME_CACHE, request, response.clone());
          }
          return response;
        })
        .catch((err) => {
          // Aborted (page navigation / src swap) is not a timeout — never 408 it.
          if (err && err.name === "AbortError") return cached || Response.error();
          return cached || new Response("", { status: 408 });
        });
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
