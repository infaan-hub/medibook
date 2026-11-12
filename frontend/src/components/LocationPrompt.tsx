/**
 * Guided location prompt.
 *
 * Shown (a) the first time a patient needs to book, (b) when a doctor sets up
 * their practice location, and (c) as the error-recovery path when the backend
 * rejects a booking with `errors.location`. It explains *why* a location is
 * required before asking for the permission, so the browser's permission
 * bubble is not the first thing the user hears about it.
 *
 * The component never talks to the API itself — it hands the fix to
 * `onCaptured`, so the caller decides whether it is a patient profile update,
 * a doctor profile update, or a retry of the appointment.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crosshair, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./Modal";
import { captureFix, LocationError, type CapturedFix } from "../lib/location";
import { nearestAreaName } from "../lib/zanzibar";

export interface LocationPromptProps {
  open: boolean;
  /** Called once a fix is captured; awaiting it runs the save. */
  onCaptured: (fix: CapturedFix) => void | Promise<void>;
  /** Omit to make the prompt blocking (booking gate). */
  onDismiss?: () => void;
  /** Externally driven save-in-progress, merged with the local capture state. */
  saving?: boolean;
  title?: string;
  description?: string;
  /** Label of the primary action. */
  actionLabel?: string;
  /** Small print shown under the buttons — how the location is used. */
  privacyNote?: string;
}

const DEFAULT_DESCRIPTION =
  "MediBook needs your position to find doctors near you and to route emergency requests. Nothing is shared with other patients.";

const DEFAULT_DESCRIPTION_KEY = "locationPrompt.description";

export function LocationPrompt({
  open,
  onCaptured,
  onDismiss,
  saving = false,
  title,
  description,
  actionLabel,
  privacyNote,
}: LocationPromptProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("locationPrompt.title");
  const resolvedDescription = description ?? t("locationPrompt.description");
  const resolvedActionLabel = actionLabel ?? t("locationPrompt.actionLabel");
  const resolvedPrivacyNote = privacyNote ?? t("locationPrompt.privacyNote");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFix, setLastFix] = useState<CapturedFix | null>(null);
  const working = busy || saving;
  // The fix is confirmed by the ward it landed in — the raw coordinates and the
  // accuracy reading are deliberately kept out of the UI.
  const capturedArea = lastFix ? nearestAreaName(lastFix) : null;

  const grab = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const fix = await captureFix();
      setLastFix(fix);
      await onCaptured(fix);
    } catch (err) {
      setError(
        err instanceof LocationError
          ? err.message
          : t("locationPrompt.readFailed")
      );
    } finally {
      setBusy(false);
    }
  }, [onCaptured]);

  return (
    <Modal
      open={open}
      title={resolvedTitle}
      dismissible={Boolean(onDismiss)}
      onDismiss={onDismiss}
      className="modal__card--prompt"
      actions={
        onDismiss ? (
          <>
            <Button variant="ghost" onClick={onDismiss}>
              {t("common.notNow")}
            </Button>
            <Button variant="primary" loading={working} onClick={grab}>
              {resolvedActionLabel}
            </Button>
          </>
        ) : (
          <Button variant="primary" fullWidth loading={working} onClick={grab}>
            {resolvedActionLabel}
          </Button>
        )
      }
    >
      <div className="prompt">
        <div className="prompt__icon" aria-hidden="true">
          <MapPin size={26} />
        </div>
        <p className="prompt__description">{resolvedDescription}</p>

        {lastFix && (
          <p className="prompt__fix">
            <Crosshair size={14} aria-hidden="true" />
            {capturedArea
              ? t("locationPrompt.capturedArea", { area: capturedArea })
              : t("locationPrompt.captured")}
          </p>
        )}

        {error && (
          <p className="prompt__error" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            {error}
          </p>
        )}

        <p className="prompt__privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          {resolvedPrivacyNote}
        </p>
      </div>
    </Modal>
  );
}
