/**
 * "Download app" — the A2HS install call to action (§22.1, §69).
 *
 * Placed where the install CTA belongs:
 *  - `header`   — replaces the notification bell in the patient shell header
 *                 while MediBook is not installed yet (see `AppShell`),
 *  - `floating` — top-left corner of the welcome screen so a first-time visitor
 *                 can install before signing up,
 *  - `inline`   — flows inside a screen's own header row (the onboarding
 *                 carousel, next to Skip),
 *  - `block`    — full-width variant for settings-style usage.
 *
 * Renders nothing once the app runs standalone (installed) or when the browser
 * offers no install path at all (e.g. desktop Firefox).
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
  const { available, isIOS, install } = useInstallAvailability();
  const { notify } = useToast();

  const handleClick = useCallback(() => {
    if (isIOS) {
      // WebKit never fires `beforeinstallprompt` — guide the user instead.
      notify("info", "Tap Share, then Add to Home Screen, to install MediBook.");
      return;
    }
    void install().then((accepted) => {
      if (accepted) notify("success", "Installing MediBook…");
    });
  }, [install, isIOS, notify]);

  if (!available) return null;

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
