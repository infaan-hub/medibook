/**
 * First-load notification permission gate (Phase 2).
 *
 * Mounted once at the app root for signed-in users. Until the user has given
 * an answer, a modal stands in front of the UI explaining what will be sent —
 * the native permission bubble is never the first thing they see. After an
 * answer (enabled or skipped) the key is written and the gate stays closed for
 * good on that browser; the same prompt is offered again at booking time,
 * where the next event really is "the doctor replied".
 *
 * Platform-specific, driven by the push state machine:
 *  - iOS/iPadOS Safari tab → "Install MediBook to enable notifications" with
 *    the Add-to-Home-Screen steps and NO Allow button (asking iOS there can
 *    never produce Web Push, so we never call requestPermission() from it).
 *  - iOS Home Screen PWA / Android / desktop → the normal "Allow" flow, and
 *    the request runs inside the button's click handler.
 *  - denied → "Notifications are blocked" with settings guidance and no
 *    request loop: JavaScript cannot override a system-level denial.
 */
import { useCallback, useEffect, useState } from "react";
import { usePushNotifications } from "../push/usePushNotifications";
import { NotificationPrompt } from "./NotificationPrompt";

const ANSWERED_KEY = "medibook_notifications_prompted";

function readAnswered(): boolean {
  try {
    return localStorage.getItem(ANSWERED_KEY) === "1";
  } catch {
    // Storage unavailable (private mode) — never trap the user behind a modal.
    return true;
  }
}

function markAnswered(): void {
  try {
    localStorage.setItem(ANSWERED_KEY, "1");
  } catch {
    /* ignore — worst case the prompt shows again next visit */
  }
}

export function NotificationGate({ userId }: { userId: number | null }) {
  const { probed, state, message, steps, actionLabel, loading, error, subscribe } =
    usePushNotifications(userId);
  const [answered, setAnswered] = useState<boolean>(() => readAnswered());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Wait for the read-only subscription probe so the modal never flashes a
    // stale "enable" state at an already-subscribed device.
    if (!userId || answered || !probed) return;
    // Nothing this modal could offer: no Notifications API, insecure origin,
    // or this device is already fully subscribed.
    if (state === "UNSUPPORTED" || state === "INSECURE" || state === "SUBSCRIBED") {
      markAnswered();
      setAnswered(true);
      return;
    }
    // Give the boot (session restore, first paint) a beat before blocking.
    const id = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(id);
  }, [userId, answered, probed, state]);

  const dismiss = useCallback(() => {
    markAnswered();
    setAnswered(true);
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    const ok = await subscribe();
    // Stop blocking once the flow can't move forward any further: full
    // success, or a system-level denial (nothing left to ask). A dismissed
    // prompt or a subscription/backend failure keeps the modal open so the
    // message stays visible and the tap can be retried.
    const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
    if (ok || denied) {
      markAnswered();
      setAnswered(true);
      setVisible(false);
    }
  }, [subscribe]);

  if (!visible || answered) return null;

  const installMode = state === "IOS_NOT_INSTALLED";
  const blockedMode = state === "DENIED";

  return (
    <NotificationPrompt
      open
      busy={loading}
      error={error}
      steps={steps}
      onEnable={actionLabel ? enable : undefined}
      onDismiss={dismiss}
      title={
        installMode
          ? "Install MediBook to enable notifications"
          : blockedMode
            ? "Notifications are blocked"
            : "Turn on notifications"
      }
      description={
        installMode
          ? "iOS delivers notifications from the MediBook app on your Home Screen. Add it once, then open MediBook from there:"
          : blockedMode
            ? message
            : "Get appointment confirmations, rejections and reminders as soon as they happen — even when MediBook is closed."
      }
      enableLabel={actionLabel ?? "Allow notifications"}
      skipLabel={installMode ? "Got it" : "Maybe later"}
    />
  );
}
