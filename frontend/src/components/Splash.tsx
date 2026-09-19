/**
 * Splash screen: full-screen splash-screen.jpeg image, zoomed out slightly
 * so the whole image is visible. 5-second progress bar at bottom.
 * Responsive on phone, tablet, desktop, Android, iOS.
 */

import { useEffect, useState } from "react";

const SPLASH_DURATION = 5000;

export function SplashScreen({ hidden }: { hidden: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (hidden) return;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / SPLASH_DURATION) * 100, 100);
      setProgress(pct);
      if (pct < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden]);

  return (
    <div className={`splash${hidden ? " splash--hidden" : ""}`} aria-hidden={hidden}>
      <div className="splash__image-wrap">
        <img
          className="splash__image"
          src="/images/splash-screen.jpeg"
          alt="MediBook"
          draggable={false}
        />
      </div>
      <div className="splash__footer">
        <div className="splash__progress-track">
          <div className="splash__progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Listens for the new service worker taking over and offers a refresh.
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
