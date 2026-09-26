/**
 * "Download app" — the A2HS install call to action (§22.1, §69).
 *
 * Placed where the install CTA belongs:
 *  - `header`   — replaces the notification bell in the patient/doctor/admin
 *                 shell header while MediBook is not installed yet (see
 *                 `AppShell`),
 *  - `floating` — top corner of the welcome screen so a first-time visitor
 *                 can install before signing up,
 *  - `inline`   — flows inside a screen's own header row (the onboarding
 *                 carousel, next to Skip),
 *  - `block`    — full-width variant for settings-style usage.
 *
 * One tap runs the browser's install flow — on desktop Windows that puts a
 * MediBook shortcut on the desktop (and in the Start menu) which opens the
 * web app in its own window; on Android it installs the app to the home
 * screen. iOS has no install prompt, so it gets the Share → Add to Home
 * Screen hint instead, and browsers with no install path get pointed at
 * Chrome/Edge.
 *
 * Once installed, the button retires itself (the shell header then shows the
 * notification bell again).
 */

import { useCallback } from "react";
import { Download } from "lucide-react";
import { useInstallAvailability } from "../pwa/installPrompt";
import { useToast } from "../state/app-context";

export type InstallAppButtonVariant = "header" | "floating" | "inline" | "block";

export function InstallAppButton({
  variant = "header",
}: {
  variant?: InstallAppButtonVariant;
}) {
  const { installed, installable, isIOS, install } = useInstallAvailability();
  const { notify } = useToast();

  const handleClick = useCallback(() => {
    // WebKit never fires `beforeinstallprompt` — guide the user instead.
    if (isIOS) {
      notify("info", "Tap Share, then Add to Home Screen, to install MediBook.");
      return;
    }
    // No native install path (e.g. desktop Firefox) → point at a browser that
    // can place the desktop shortcut.
    if (!installable) {
      notify(
        "info",
        "Open this site in Chrome or Edge and choose Install MediBook to add a desktop shortcut."
      );
      return;
    }
    // Native install: desktop → a MediBook shortcut on the desktop that opens
    // the web app; Android → the app on the home screen.
    void install().then((accepted) => {
      if (accepted) notify("success", "Installing MediBook…");
    });
  }, [install, installable, isIOS, notify]);

  if (installed) return null;

  return (
    <button
      type="button"
      className={`install-btn install-btn--${variant}`}
      onClick={handleClick}
      aria-label="Download app"
      title="Download app"
    >
      <Download size={18} aria-hidden="true" />
      <span className="install-btn__label">Download app</span>
    </button>
  );
}
