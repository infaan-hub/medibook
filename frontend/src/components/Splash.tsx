/**
 * Splash screen (§18): brand hero shown while the PWA bootstraps, plus the
 * update-available prompt driven by the service worker lifecycle.
 */

import { useEffect, useState } from "react";

export function SplashScreen({ hidden }: { hidden: boolean }) {
  return (
    <div className={`splash${hidden ? " splash--hidden" : ""}`} aria-hidden={hidden}>
      <div className="splash__logo">M</div>
      <span className="splash__name">MediBook</span>
    </div>
  );
}

/**
 * Listens for the new service worker taking over and offers a refresh.
 * Registration lives in lib/pwa.ts; this component only reads the flag.
 */
export function UpdatePrompt() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handler = () => setReady(true);
    window.addEventListener("medibook:update-ready", handler);
    return () => window.removeEventListener("medibook:update-ready", handler);
  }, []);

  if (!ready) return null;
  return (
    <div className="prompt" role="alert">
      <span>A new version of MediBook is available.</span>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        onClick={() => window.location.reload()}
      >
        Refresh
      </button>
    </div>
  );
}