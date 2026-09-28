/**
 * Guided notification-permission prompt (Phase 2).
 *
 * The browser must never be the first thing the user hears about a permission
 * request, so this modal explains what will be sent before `subscribe()` pops
 * the native bubble. Used twice:
 *   - blocking, once per browser, on first load (NotificationGate)
 *   - right after a booking, when the next event is literally "the doctor
 *     replied" (BookingSuccessScreen)
 */
import { useState } from "react";
import { BellRing, TriangleAlert } from "lucide-react";
import { Button } from "./ui";
import { Modal } from "./Modal";

export interface NotificationPromptProps {
  open: boolean;
  /** Runs the permission request + push subscription. */
  onEnable: () => void | Promise<void>;
  onDismiss?: () => void;
  busy?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  /** Label of the secondary ("skip") action; null to hide it. */
  skipLabel?: string | null;
  /** Label of the primary action. */
  enableLabel?: string;
}

const DEFAULT_DESCRIPTION =
  "Get appointment confirmations, rejections and reminders as soon as they happen — even when MediBook is closed.";

export function NotificationPrompt({
  open,
  onEnable,
  onDismiss,
  busy = false,
  error,
  title = "Turn on notifications",
  description = DEFAULT_DESCRIPTION,
  skipLabel = "Maybe later",
  enableLabel = "Enable notifications",
}: NotificationPromptProps) {
  const [dismissed, setDismissed] = useState(false);
  const close = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Modal
      open={open && !dismissed}
      title={title}
      onDismiss={onDismiss ? close : undefined}
      dismissible={Boolean(onDismiss)}
      actions={
        <>
          {skipLabel !== null && onDismiss && (
            <Button variant="ghost" onClick={close}>
              {skipLabel}
            </Button>
          )}
          <Button variant="primary" loading={busy} onClick={() => void onEnable()}>
            {enableLabel}
          </Button>
        </>
      }
    >
      <div className="prompt">
        <div className="prompt__icon" aria-hidden="true">
          <BellRing size={26} />
        </div>
        <p className="prompt__description">{description}</p>
        {error && (
          <p className="prompt__error" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            {error}
          </p>
        )}
        <p className="prompt__privacy">
          Only appointment and reminder updates. No marketing, and you can turn them off in
          Settings at any time.
        </p>
      </div>
    </Modal>
  );
}
