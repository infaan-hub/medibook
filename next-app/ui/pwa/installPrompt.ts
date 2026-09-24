/**
 * PWA install prompt (§69 — A2HS).
 * Captures the browser's beforeinstallprompt event and exposes helpers
 * so the InstallButton component can offer an "Install" action.
 */

import type { BeforeInstallPromptEvent } from "../types/pwa";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
});

/** True when the browser has fired beforeinstallprompt (Chromium, Edge). */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Show the native install dialog. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  deferredPrompt = null;
  return outcome === "accepted";
}

/** True when the app is running in standalone / installed mode. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
