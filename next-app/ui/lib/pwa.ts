/**
 * PWA registration (§18): registers public/service-worker.js, detects a
 * waiting worker, and exposes the "update ready" event consumed by the
 * UpdatePrompt component.
 */

/** Browsers only allow service workers on HTTPS or loopback hosts. */
export function isSecureContextForSw(): boolean {
  if (location.protocol === "https:") return true;
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

/**
 * Register the service worker NOW and return its registration (or null when
 * unsupported / insecure context / registration failed). Used by the push
 * subscription flow, which cannot wait for the `load` event — an unresolved
 * `navigator.serviceWorker.ready` would hang `subscribeToPush()` forever on
 * http:// LAN addresses, which is exactly how subscriptions silently never
 * got created.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  if (!isSecureContextForSw()) return null;
  try {
    return await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  } catch {
    return null;
  }
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (!isSecureContextForSw()) return;

  const register = () => {
    void navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((registration) => {
        // A worker waiting means a new version was downloaded but is not
        // controlling the page yet (skipWaiting happens on activate).
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new Event("medibook:update-ready"));
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event("medibook:update-ready"));
            }
          });
        });
      })
      .catch(() => {
        /* Service worker registration is best-effort. */
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}