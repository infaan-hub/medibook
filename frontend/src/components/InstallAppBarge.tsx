/**
 * "Download app" barge + how-to-install popup (§22.1, §69).
 *
 * The install CTA no longer lives in the app header. Instead the shell shows:
 *
 *   - `InstallAppBarge` — a small badge glued to the right edge, middle of
 *     the viewport, while MediBook is not installed. One tap opens the
 *     installation instructions below. Once the user taps the action (or installs
 *     the app) the barge never appears again.
 *   - `InstallInfoDialog` — the popup with Chrome and Safari installation
 *     instructions and a single button that installs when a native prompt is
 *     available, or dismisses the instructions otherwise.
 *   - The sidebar keeps a "Download app" button below the nav links (never in
 *     the header) that opens the same popup; it retires itself once the app
 *     is installed.
 *
 * `useInstallCta()` holds the shared state (installed/dismissed/dialog open)
 * so AppShell can wire the three pieces together with one hook.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Modal } from "./Modal";
import { useToast } from "../state/app-context";
import { useInstallAvailability } from "../pwa/installPrompt";

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
  const { installed, installable, install } = useInstallAvailability();
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
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <button
      type="button"
      className="install-barge"
      onClick={onOpen}
      aria-label={t("nav.downloadApp")}
      title={t("nav.downloadApp")}
    >
      <Download size={16} aria-hidden="true" />
      <span className="install-barge__label">{t("nav.downloadApp")}</span>
    </button>
  );
}

export interface InstallInfoDialogProps {
  open: boolean;
  /** X / backdrop / ESC — closes the popup; the barge stays. */
  onClose: () => void;
  /** "Got it" — closes the popup AND hides the barge for good. */
  onGotIt: () => void;
  /** A native install prompt exists (Chrome / Edge / Android). */
  installable: boolean;
  /** Runs the native install prompt. Resolves true when accepted. */
  install: () => Promise<boolean>;
}

/** Shared installation instructions shown from the barge and sidebar CTA. */
function InstallInfoBody() {
  const { t } = useTranslation();
  return (
    <>
      <p className="install-info__intro">{t("shared.install.intro")}</p>
      <p className="install-info__platform"><strong>{t("shared.install.chromeTitle")}</strong></p>
      <ol className="install-info__steps">
        <li>{t("shared.install.chromeStepOne")}</li>
        <li>{t("shared.install.chromeStepTwo")}</li>
        <li>{t("shared.install.chromeStepThree")}</li>
      </ol>
      <p className="install-info__platform"><strong>{t("shared.install.safariTitle")}</strong></p>
      <ol className="install-info__steps">
        <li>{t("shared.install.safariStepOne")}</li>
        <li>{t("shared.install.safariStepTwo")}</li>
        <li>{t("shared.install.safariStepThree")}</li>
      </ol>
      <p className="install-info__outro">{t("shared.install.outro")}</p>
    </>
  );
}

/** The small how-to-download popup opened by the barge / sidebar button. */
export function InstallInfoDialog({
  open,
  onClose,
  onGotIt,
  installable,
  install,
}: InstallInfoDialogProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const handleInstall = useCallback(async () => {
    if (!installable) {
      onGotIt();
      return;
    }
    setBusy(true);
    try {
      const accepted = await install();
      if (accepted) {
        notify("success", t("shared.install.installing"));
        onClose();
      } else {
        // The user can follow the manual steps shown in the popup.
        notify(
          "info",
          t("shared.install.manualHint")
        );
      }
    } finally {
      setBusy(false);
    }
  }, [installable, install, notify, onClose, onGotIt, t]);

  return (
    <Modal
      open={open}
      title={t("shared.install.title")}
      className="install-info__card"
      onDismiss={onClose}
      actions={
        <>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onGotIt}
          >
            {t("shared.install.gotIt")}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleInstall}
            disabled={busy}
          >
            <Download size={16} aria-hidden="true" />
            {t("shared.install.download")}
          </button>
        </>
      }
    >
      <InstallInfoBody />
    </Modal>
  );
}