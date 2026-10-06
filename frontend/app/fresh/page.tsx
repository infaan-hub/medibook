"use client";

/**
 * /fresh — one-shot "make this site first-time again" reset.
 *
 * Clears ONLY this origin's state: localStorage (session, VAPID binding,
 * onboarding/prompt flags), sessionStorage, Cache Storage, IndexedDB and any
 * non-HttpOnly cookies, unregisters the service worker — then sends the
 * browser to /, where the SPA, the v8 service worker and everything else
 * install clean. Browser-level state a page cannot reach (the notifications
 * permission) is reset separately in the browser profile.
 */
import { useEffect, useState } from "react";

export default function FreshResetPage() {
  const [status, setStatus] = useState("Clearing site data…");

  useEffect(() => {
    let done = false;
    (async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();

        for (const entry of document.cookie.split(";")) {
          const name = entry.split("=")[0]?.trim();
          if (name) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          }
        }

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((reg) => reg.unregister()));
        }

        if (typeof indexedDB !== "undefined" && "databases" in indexedDB) {
          const databases = await indexedDB.databases();
          await Promise.all(
            databases.map((db) =>
              db.name ? indexedDB.deleteDatabase(db.name) : Promise.resolve()
            )
          );
        }
      } catch {
        // Best effort — anything that fails simply persists.
      }
      if (done) return;
      setStatus("Cleared — loading the app fresh…");
      window.setTimeout(() => window.location.replace("/"), 350);
    })();
    return () => {
      done = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Site data reset</h1>
      <p style={{ margin: 0, opacity: 0.75 }}>{status}</p>
    </main>
  );
}
