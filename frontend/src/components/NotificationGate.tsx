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
 * Permission DENIED is not a special case: the browser will simply not show
 * its native bubble on a repeat request, but the modal stays the same — an
 * "Allow" button that calls `requestPermission()` — instead of dead-end copy
 * telling the user to hunt through browser settings.
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
  const { loading, error, subscribe } = usePushNotifications(userId);
  const [answered, setAnswered] = useState<boolean>(() => readAnswered());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId || answered) return;
    if (typeof Notification === "undefined") {
      markAnswered();
      setAnswered(true);
      return;
    }
    // Give the boot (session restore, first paint) a beat before blocking.
    const id = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(id);
  }, [userId, answered]);

  const dismiss = useCallback(() => {
    markAnswered();
    setAnswered(true);
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    await subscribe();
    // Permission resolved either way — never re-block on the same browser.
    if (Notification.permission !== "default") {
      markAnswered();
      setAnswered(true);
      setVisible(false);
    }
  }, [subscribe]);

  if (!visible || answered) return null;

  // Always the same popup, whatever the browser's current answer: the only
  // way to get device permission is to ask for it.
  return (
    <NotificationPrompt
      open
      busy={loading}
      error={error}
      onEnable={enable}
      onDismiss={dismiss}
      title="Turn on notifications"
      enableLabel="Allow notifications"
      skipLabel="Maybe later"
    />
  );
}
