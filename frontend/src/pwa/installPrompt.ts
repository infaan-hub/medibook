/**
 * PWA install prompt (§69 — A2HS).
 *
 * Chrome/Edge fire `beforeinstallprompt` once per page load, and only once the
 * installability criteria are met (HTTPS, manifest with PNG 192px + 512px
 * icons, a service worker with a fetch handler) plus a short engagement
 * heuristic. The SPA is client-only, so the event is captured twice:
 *
 *   1. the inline script in `app/layout.tsx` (earliest possible — works even
 *      while the React bundle is still downloading), and
 *   2. the module-level listener below (fallback for the Vite/preview build,
 *      where the layout script does not exist).
 *
 * Both land on `window.__mbDeferredInstallPrompt`; `<InstallPrompt />`
 * subscribes via `subscribeInstallPrompt()` so a late event still reveals the
 * button, and `promptInstall()` shows the native dialog.
 */

import { useCallback, useEffect, useState } from "react";
import type { BeforeInstallPromptEvent } from "../types/pwa";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Remember the deferred prompt and let every mounted subscriber re-render. */
function receive(event: BeforeInstallPromptEvent): void {
  // Our own banner replaces the browser mini-infobar (§22.1 gesture-gated).
  event.preventDefault();
  deferredPrompt = event;
  notify();
}

/** Adopts the prompt the inline script in `app/layout.tsx` captured. */
function adoptEarlyPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  if (window.__mbDeferredInstallPrompt) {
    deferredPrompt = window.__mbDeferredInstallPrompt;
  }
  return deferredPrompt;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => receive(event));
  // The layout script may have captured (and re-broadcast) the event before
  // this module was evaluated — adopt it instead of losing it.
  window.addEventListener("medibook:install-available", () => {
    if (adoptEarlyPrompt()) notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.__mbDeferredInstallPrompt = undefined;
    notify();
  });
}

/**
 * Subscribe to prompt/installation changes so a late `beforeinstallprompt`
 * still reveals the install button. Returns an unsubscribe function.
 */
export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when a Chromium install prompt is available (Chrome, Edge, Android). */
export function canInstall(): boolean {
  return adoptEarlyPrompt() !== null;
}

/** Show the native install dialog. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const prompt = adoptEarlyPrompt();
  if (!prompt) return false;
  // A deferred prompt can only be used once (§22.1).
  deferredPrompt = null;
  window.__mbDeferredInstallPrompt = undefined;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  notify();
  return outcome === "accepted";
}

/** True when the app is running in standalone / installed mode. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") {
    return window.navigator.standalone === true;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * iOS / iPadOS: WebKit never fires `beforeinstallprompt`, so the only install
 * path is Share → Add to Home Screen (§22.1).
 */
export function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in window);
}

export interface InstallAvailability {
  /** Not installed yet AND this browser can install the app. */
  available: boolean;
  /**
   * Not installed yet AND the browser fires `beforeinstallprompt` — i.e. the
   * native install path exists (Chrome / Edge / Android). Excludes iOS (Share →
   * Add to Home Screen only).
   */
  installable: boolean;
  /**
   * Running as an installed app (standalone display mode — the installed PWA
   * that has a desktop/home-screen shortcut). The shell header swaps the
   * Download app button back to the notification bell in this state.
   */
  installed: boolean;
  /** iOS/iPadOS: install is Share → Add to Home Screen, not a prompt. */
  isIOS: boolean;
  /** Runs the native prompt (no-op on iOS). Resolves true when accepted. */
  install: () => Promise<boolean>;
}

/**
 * Live A2HS availability for the install CTA ("Download app").
 *
 * `installed` is probed synchronously on first render (the SPA is client-only)
 * so the header never flashes the wrong action, and the media-query listener
 * keeps it correct when the app is installed from the browser menu (which does
 * not always fire `appinstalled`).
 */
export function useInstallAvailability(): InstallAvailability {
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setCanPrompt(canInstall());
    setInstalled(isStandalone());
    setIsIOS(isIOSDevice());

    const unsubscribe = subscribeInstallPrompt(() => setCanPrompt(canInstall()));
    const onInstalled = () => {
      setCanPrompt(false);
      setInstalled(true);
    };
    // Older browsers (and jsdom) may not implement matchMedia — degrade to the
    // one-shot isStandalone() probe above.
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    const onDisplayMode = () => setInstalled(media ? media.matches : isStandalone());

    window.addEventListener("appinstalled", onInstalled);
    media?.addEventListener("change", onDisplayMode);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      media?.removeEventListener("change", onDisplayMode);
    };
  }, []);

  const install = useCallback(async () => {
    if (typeof window === "undefined") return false;
    const accepted = await promptInstall();
    // Accepted → the OS install is underway; retire the CTA immediately so the
    // header can swap back to the notification bell without waiting for the
    // (not always fired) `appinstalled` event.
    if (accepted) setInstalled(true);
    return accepted;
  }, []);

  return {
    available: !installed && (canPrompt || isIOS),
    installable: !installed && canPrompt,
    installed,
    isIOS,
    install,
  };
}

