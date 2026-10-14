/**
 * "Download app" barge + how-to-install popup (§22.1, §69).
 *
 * The install CTA no longer lives in the app header. Instead the shell shows:
 *
 *   - `InstallAppBarge` — a small badge glued to the right edge, middle of
 *     the viewport, while MediBook is not installed. One tap opens the
 *     device-specific popup below. Once the user taps "Got it" (or installs
 *     the app) the barge never appears again.
 *   - `InstallInfoDialog` — the small popup:
 *       • iOS/iPadOS   — description + Share → Add to Home Screen steps and
 *                        ONLY a "Got it" button (WebKit has no install
 *                        prompt, so there is nothing to tap),
 *       • Android      — short description + "Download app" (runs the native
 *                        install → app on the home screen) + "Got it",
 *       • Desktop      — short description + "Download app" (desktop / Start
 *                        menu / Dock shortcut, own window) + "Got it",
 *       • no install path (e.g. Firefox, desktop Safari) — manual
 *                        browser-menu instructions + "Got it".
 *   - The sidebar keeps a "Download app" button below the nav links (never in
 *     the header) that opens the same popup; it retires itself once the app
 *     is installed.
 *
 * `useInstallCta()` holds the shared state (installed/dismissed/dialog open)
 * so AppShell can wire the three pieces together with one hook.
 */

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "./Modal";
import { useToast } from "../state/app-context";
import { useInstallAvailability } from "../pwa/installPrompt";
import { isAndroid } from "../lib/platform";

/** Persisted by "Got it" so the barge never comes back (per device/browser). */
const DISMISSED_KEY = "medibook_install_barge_dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Storage unavailable (private mode) — keep showing the barge.
    return false;
  }
}

/** Shared install-CTA state for AppShell (barge + sidebar button + popup). */
export function useInstallCta() {
  const { installed, isIOS, installable, install } = useInstallAvailability();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  /** "Got it": close the popup AND hide the barge for good (persisted). */
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable — still hide it for this session.
    }
    setDismissed(true);
    setOpen(false);
  }, []);

  return {
    /** Not installed yet — the sidebar "Download app" button may show. */
    ctaVisible: !installed,
    /** The right-edge barge: hidden once installed or once "Got it" was tapped. */
    bargeVisible: !installed && !dismissed,
    open,
    show,
    close,
    dismiss,
    installed,
    isIOS,
    installable,
    install,
  };
}

/**
 * The barge itself — a badge glued to the right edge at the middle of the
 * viewport (not a button in the header). Tapping it opens the popup.
 */
export function InstallAppBarge({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className="install-barge"
      onClick={onOpen}
      aria-label="Download app"
      title="Download app"
    >
      <Download size={16} aria-hidden="true" />
      <span className="install-barge__label">Download app</span>
    </button>
  );
}

export interface InstallInfoDialogProps {
  open: boolean;
  /** X / backdrop / ESC — closes the popup; the barge stays. */
  onClose: () => void;
  /** "Got it" — closes the popup AND hides the barge for good. */
  onGotIt: () => void;
  /** iOS/iPadOS: steps + Got it only, never an install button. */
  isIOS: boolean;
  /** A native install prompt exists (Chrome / Edge / Android). */
  installable: boolean;
  /** Runs the native install prompt. Resolves true when accepted. */
  install: () => Promise<boolean>;
}

/** The device-specific "how to download" description. */
function InstallInfoBody({
  isIOS,
  isAndroidDevice,
  installable,
}: {
  isIOS: boolean;
  isAndroidDevice: boolean;
  installable: boolean;
}) {
  if (isIOS) {
    return (
      <>
        <p className="install-info__intro">
          Safari can't install apps from the web directly. Add MediBook to your
          Home Screen instead:
        </p>
        <ol className="install-info__steps">
          <li>Tap the Share button (a square with an upward arrow).</li>
          <li>Scroll down and tap &ldquo;Add to Home Screen&rdquo;.</li>
          <li>Tap &ldquo;Add&rdquo; &mdash; MediBook appears on your home screen.</li>
        </ol>
      </>
    );
  }
  if (installable) {
    return (
      <p className="install-info__intro">
        {isAndroidDevice
          ? "One tap adds MediBook to your home screen with its own icon \u2014 it opens in its own window and keeps working offline. No app store needed."
          : "One tap installs MediBook on this computer: a shortcut is added to your desktop and Start menu (or Dock), and the app opens in its own window."}
      </p>
    );
  }
  return (
    <p className="install-info__intro">
      This browser can't install MediBook automatically. Open the browser menu
      (the dots or lines icon) and choose &ldquo;Install MediBook&rdquo; or
      &ldquo;Install this site as an app&rdquo;. In Safari, use File &rarr; Add
      to Dock.
    </p>
  );
}

/** The small how-to-download popup opened by the barge / sidebar button. */
export function InstallInfoDialog({
  open,
  onClose,
  onGotIt,
  isIOS,
  installable,
  install,
}: InstallInfoDialogProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    try {
      const accepted = await install();
      if (accepted) {
        notify("success", "Installing MediBook\u2026");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }, [install, notify, onClose]);

  return (
    <Modal
      open={open}
      title="Download MediBook app"
      className="install-info__card"
      onDismiss={onClose}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onGotIt}>
            Got it
          </button>
          {!isIOS && installable && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleInstall}
              disabled={busy}
            >
              <Download size={16} aria-hidden="true" />
              Download app
            </button>
          )}
        </>
      }
    >
      <InstallInfoBody
        isIOS={isIOS}
        isAndroidDevice={isAndroid()}
        installable={installable}
      />
    </Modal>
  );
}