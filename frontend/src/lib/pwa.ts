/**
 * PWA registration (§18): registers public/service-worker.js, detects a
 * waiting worker, and exposes the "update ready" event consumed by the
 * UpdatePrompt component.
 */

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  window.addEventListener("load", () => {
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
  });
}