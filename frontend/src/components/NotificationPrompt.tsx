/**
 * Guided notification-permission prompt (Phase 2).
 *
 * The browser must never be the first thing the user hears about a permission
 * request, so this modal explains what will be sent before `subscribe()` pops
 * the native bubble. Used twice:
 *   - blocking, once per browser, on first load (NotificationGate)
 *   - right after a booking, when the next event is literally "the doctor
 *     replied" (BookingSuccessScreen)
 *
 * The primary action is optional: states where the OS cannot present a prompt
 * (iOS Safari tab → "Add to Home Screen" instructions, blocked permission)
 * pass no `onEnable` and the modal explains the situation instead of showing
 * an "Allow" button the OS would ignore.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, TriangleAlert } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./Modal";

export interface NotificationPromptProps {
  open: boolean;
  /** Runs the permission request + push subscription. Omit when the current
   *  context cannot request permission (iOS install / blocked states). */
  onEnable?: () => void | Promise<void>;
  onDismiss?: () => void;
  busy?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  /** Ordered setup steps (iOS "Add to Home Screen"). */
  steps?: readonly string[] | null;
  /** Label of the secondary ("skip") action; null to hide it. */
  skipLabel?: string | null;
  /** Label of the primary action. */
  enableLabel?: string;
}

export function NotificationPrompt({
  open,
  onEnable,
  onDismiss,
  busy = false,
  error,
  title,
  description,
  steps,
  skipLabel,
  enableLabel,
}: NotificationPromptProps) {
  const { t } = useTranslation();
  const resolvedSkipLabel = skipLabel === undefined ? t("shared.notificationPrompt.skip") : skipLabel;
  const [dismissed, setDismissed] = useState(false);
  const close = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Modal
      open={open && !dismissed}
      title={title ?? t("shared.notificationPrompt.title")}
      onDismiss={onDismiss ? close : undefined}
      dismissible={Boolean(onDismiss)}
      actions={
        <>
          {resolvedSkipLabel !== null && onDismiss && (
            <Button variant="ghost" onClick={close}>
              {resolvedSkipLabel}
            </Button>
          )}
          {onEnable && (
            <Button variant="primary" loading={busy} onClick={() => void onEnable()}>
              {enableLabel ?? t("shared.notificationPrompt.enable")}
            </Button>
          )}
        </>
      }
    >
      <div className="prompt">
        <div className="prompt__icon" aria-hidden="true">
          <BellRing size={26} />
        </div>
        <p className="prompt__description">{description ?? t("shared.notificationPrompt.description")}</p>
        {steps && steps.length > 0 && (
          <ol className="prompt__steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {error && (
          <p className="prompt__error" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            {error}
          </p>
        )}
        <p className="prompt__privacy">
          {t("shared.notificationPrompt.privacy")}
        </p>
      </div>
    </Modal>
  );
}
