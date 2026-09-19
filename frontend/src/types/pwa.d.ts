// PWA event types used by the A2HS install prompt (§22.1, §69).
//
// These events are not part of TypeScript's lib.dom, so the frontend declares
// them here. Implemented in PHASE 4 — React Foundation.

/**
 * Fired by Chromium-based browsers when the app is installable.
 * `prompt()` must be called from a user gesture.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    /** Safari has no install event — only Chromium browsers fire this (§22.1). */
    beforeinstallprompt: BeforeInstallPromptEvent;
    /** Fired after the user installs the app. */
    appinstalled: Event;
  }

  interface Navigator {
    /** iOS Safari only: true when running as an installed home-screen app. */
    standalone?: boolean;
  }
}