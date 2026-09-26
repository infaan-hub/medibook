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
 * MediBook shortcut on the desktop (and in the Start menu) showing the
 * MediBook app icon, opening the web app in its own window; on Android it
 * installs the app to the home screen. Nothing extra to read or click: if the
 * browser reports installability a moment after the tap, the button waits for
 * that event and installs anyway. iOS has no install prompt, so it gets the
 * Share → Add to Home Screen hint (the only manual step WebKit allows).
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
  const { installed, isIOS, install } = useInstallAvailability();
  const { notify } = useToast();

  const handleClick = useCallback(() => {
    // WebKit never fires `beforeinstallprompt` — the only iOS path is manual.
    if (isIOS) {
      notify("info", "Tap Share, then Add to Home Screen, to install MediBook.");
      return;
    }
    // One tap → the browser installs MediBook and drops its shortcut
    // (desktop icon / home screen). Browsers with no install path do nothing.
    void install().then((accepted) => {
      if (accepted) notify("success", "Installing MediBook…");
    });
  }, [install, isIOS, notify]);

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
