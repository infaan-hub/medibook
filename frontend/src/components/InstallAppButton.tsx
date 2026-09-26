/**
 * "Download app" — the platform-aware install call to action (§22.1, §69).
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
 * Behaviour by platform (the button renders whenever MediBook is NOT running
 * as an installed app — standalone PWA or the Electron desktop shell):
 *
 *   Android (Chromium) → the native install prompt fires directly,
 *   iOS                → the help sheet with Share → Add to Home Screen,
 *   desktop            → the help sheet: PWA install steps for this browser
 *                        plus the desktop app installer.
 *
 * Once installed, the button retires itself (the shell header then shows the
 * notification bell again).
 */

import { useCallback, useEffect, useState } from "react";
import { Download, MonitorSmartphone, Smartphone, X } from "lucide-react";
import {
  detectPlatform,
  useInstallAvailability,
  type AppPlatform,
} from "../pwa/installPrompt";
import { useToast } from "../state/app-context";

export type InstallAppButtonVariant = "header" | "floating" | "inline" | "block";

/**
 * Windows installer produced by `desktop/` (`npm run dist`). Copy the built
 * file into `public/downloads/` so this link resolves in production.
 */
const DESKTOP_DOWNLOAD_PATH = "/downloads/MediBook-Setup.exe";

/** Per-platform install sheet shown when the native prompt is not the path. */
function InstallHelpDialog({
  platform,
  canInstall,
  onInstall,
  onClose,
}: {
  platform: AppPlatform;
  canInstall: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const installCta = (
    <button
      type="button"
      className="ab-btn ab-btn--primary install-help__action"
      onClick={onInstall}
    >
      Install now
    </button>
  );

  return (
    <div className="install-help" role="presentation" onClick={onClose}>
      <div
        className="install-help__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Download MediBook"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="install-help__head">
          <Download size={18} aria-hidden="true" />
          <h2>Download MediBook</h2>
          <button
            type="button"
            className="install-help__close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        {platform === "ios" && (
          <div className="install-help__option">
            <span className="install-help__icon" aria-hidden="true">
              <Smartphone size={18} />
            </span>
            <div>
              <h3 className="install-help__subtitle">Add to Home Screen</h3>
              <p>
                Tap <b>Share</b> in Safari, then choose <b>Add to Home Screen</b> to
                install MediBook.
              </p>
            </div>
          </div>
        )}

        {platform === "android" && (
          <div className="install-help__option">
            <span className="install-help__icon" aria-hidden="true">
              <Smartphone size={18} />
            </span>
            <div>
              <strong>Android app</strong>
              {canInstall ? (
                installCta
              ) : (
                <p>
                  Open this page in Chrome, tap the ⋮ menu → <b>Install app</b>.
                </p>
              )}
            </div>
          </div>
        )}

        {platform === "desktop" && (
          <>
            <div className="install-help__option">
              <span className="install-help__icon" aria-hidden="true">
                <MonitorSmartphone size={18} />
              </span>
              <div>
                <strong>Desktop app</strong>
                <p>MediBook in its own window — no browser needed.</p>
                <a
                  className="ab-btn ab-btn--primary install-help__action"
                  href={DESKTOP_DOWNLOAD_PATH}
                  download
                >
                  Download desktop app
                </a>
              </div>
            </div>
            <div className="install-help__option">
              <span className="install-help__icon" aria-hidden="true">
                <Download size={18} />
              </span>
              <div>
                <strong>Install as a web app</strong>
                {canInstall ? (
                  installCta
                ) : (
                  <p>
                    In Chrome or Edge, open the ⋮ menu → <b>Install MediBook</b>.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function InstallAppButton({
  variant = "header",
}: {
  variant?: InstallAppButtonVariant;
}) {
  const { installed, installable, isIOS, install } = useInstallAvailability();
  const { notify } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);
  const platform = detectPlatform();

  const runInstall = useCallback(() => {
    void install().then((accepted) => {
      if (accepted) {
        notify("success", "Installing MediBook…");
        setHelpOpen(false);
      }
    });
  }, [install, notify]);

  const handleClick = useCallback(() => {
    // Android + a live Chromium prompt → straight to the native dialog.
    if (platform === "android" && installable) {
      runInstall();
      return;
    }
    // iOS (Share → Add to Home Screen) and every browser without an install
    // prompt → the platform-specific download sheet.
    setHelpOpen(true);
  }, [platform, installable, runInstall]);

  if (installed) return null;

  return (
    <>
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
      {helpOpen && (
        <InstallHelpDialog
          platform={platform}
          canInstall={installable && !isIOS}
          onInstall={runInstall}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </>
  );
}
