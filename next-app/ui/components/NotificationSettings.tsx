/**
 * /profile — "Notifications" section: status, enable/repair, delivery test.
 *
 * "My browser stopped receiving notifications" has three distinct causes and
 * each needs a different fix; this card makes all three self-service:
 *
 *  1. Permission never granted / re-askable — the "Allow"/"Enable" tap runs
 *     the SAME `subscribe()` flow as the first-load gate (permission request
 *     from the gesture → PushManager.subscribe → server registration), which
 *     is what re-registers a device after site data was cleared.
 *  2. Safari — an iOS Safari tab or macOS Safari tab cannot present Web Push
 *     at all, so this section shows the Add-to-Home-Screen / Add-to-Dock
 *     steps from the shared push state machine and NEVER a button the OS
 *     would silently ignore (the exact cause of "I tapped Allow and nothing
 *     happened").
 *  3. Blocked permission — guidance only; JavaScript cannot override a
 *     system-level denial, so there is deliberately no request loop.
 *
 * "Send test notification" is ADMIN-ONLY and platform-wide: it fans the real
 * delivery path (inbox → realtime → web push) out to every ACTIVE device
 * registration on the platform and reports the reach. Doctors and patients
 * never see it — their section only offers turn-on/turn-off for their own
 * device (the server enforces the same rule with a 403).
 */
import { useState } from "react";
import { BellRing, Check, TriangleAlert } from "lucide-react";
import { sendTestNotification } from "../api/notifications";
import { usePushNotifications } from "../push/usePushNotifications";
import { useSession, useToast } from "../state/app-context";
import { Button, Card } from "./ui";

/** Human wording for the OS permission — the raw enum means nothing to users. */
const PERMISSION_LABEL: Record<string, string> = {
  granted: "Allowed",
  denied: "Blocked",
  default: "Not asked yet",
  unsupported: "Not supported by this browser",
};

/** Contexts where the OS cannot present Web Push from this surface (Safari rules). */
function isInstallState(state: string): boolean {
  return state === "IOS_NOT_INSTALLED" || state === "SAFARI_NOT_INSTALLED";
}

export function NotificationSettings({ userId }: { userId: number | null }) {
  const { notify } = useToast();
  // The platform test is admin-only; everyone else gets turn-on/turn-off only.
  const { user } = useSession();
  const isAdmin = user?.role === "admin" || user?.is_superuser === true;
  const {
    probed,
    state,
    permission,
    subscribed,
    loading,
    error,
    message,
    actionLabel,
    steps,
    subscribe,
    unsubscribe,
  } = usePushNotifications(userId);
  const [testing, setTesting] = useState(false);

  const installMode = isInstallState(state);
  const blocked = state === "DENIED";

  /** Status copy — always something readable, never an empty card. */
  const status = !probed
    ? "Checking this device…"
    : state === "SUBSCRIBED"
      ? "Enabled — this device is registered and receives MediBook notifications."
      : blocked
        ? message ||
          "Notifications are blocked. Allow notifications for this site in your browser settings, then reload."
        : installMode
          ? "Notifications are delivered by the installed MediBook app — a plain browser tab cannot receive them."
          : message || "Notifications are not enabled on this device yet.";

  /** ADMIN-ONLY platform fan-out; the toast reports the reach. */
  async function onTest() {
    setTesting(true);
    try {
      const envelope = await sendTestNotification();
      const { users, push_subscriptions } = envelope.data;
      if (push_subscriptions > 0) {
        notify(
          "success",
          `Test notification sent to ${push_subscriptions} device${push_subscriptions === 1 ? "" : "s"} across ${users} account${users === 1 ? "" : "s"}.`
        );
      } else {
        notify(
          "info",
          "Test notification ran, but no devices are registered for push anywhere — nothing arrived. Ask users to enable notifications from their Profile."
        );
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Could not send a test notification.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <h2 className="card__title">Notifications</h2>
      <p className="page__subtitle">
        Appointment confirmations, rejections and reminders — even when MediBook is closed.
      </p>

      <p className="prompt__description">
        <BellRing size={15} aria-hidden="true" />{" "}
        Browser permission: <strong>{PERMISSION_LABEL[permission] ?? permission}</strong>
        {" · "}
        This device: <strong>{subscribed ? "registered" : "not registered"}</strong>
      </p>

      <p className="prompt__description" data-push-state={state}>
        {status}
      </p>

      {error && (
        <p className="field__error" role="alert">
          <TriangleAlert size={15} aria-hidden="true" /> {error}
        </p>
      )}

      {installMode && steps && (
        <ol className="prompt__steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      <div className="prompt__actions-row">
        {actionLabel && (
          <Button type="button" loading={loading} onClick={() => void subscribe()}>
            <Check size={14} aria-hidden="true" /> {actionLabel}
          </Button>
        )}
        {subscribed && (
          <Button
            type="button"
            variant="ghost"
            loading={loading}
            onClick={() => void unsubscribe()}
          >
            Turn off
          </Button>
        )}
        {isAdmin && (
          <Button
            type="button"
            variant="secondary"
            loading={testing}
            disabled={!probed}
            onClick={() => void onTest()}
          >
            Send test notification
          </Button>
        )}
      </div>
    </Card>
  );
}