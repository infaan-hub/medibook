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
import { useTranslation } from "react-i18next";
import { BellRing, Check, TriangleAlert } from "lucide-react";
import { sendTestNotification } from "../api/notifications";
import { usePushNotifications } from "../push/usePushNotifications";
import { useSession, useToast } from "../state/app-context";
import { Button, Card } from "./ui";

/** Translation key for the OS permission — the raw enum means nothing to users. */
const PERMISSION_KEY: Record<string, string> = {
  granted: "push.permission.granted",
  denied: "push.permission.denied",
  default: "push.permission.default",
  unsupported: "push.permission.unsupported",
};

/** Contexts where the OS cannot present Web Push from this surface (Safari rules). */
function isInstallState(state: string): boolean {
  return state === "IOS_NOT_INSTALLED" || state === "SAFARI_NOT_INSTALLED";
}

export function NotificationSettings({ userId }: { userId: number | null }) {
  const { t } = useTranslation();
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
    ? t("push.checking")
    : state === "SUBSCRIBED"
      ? t("push.enabled")
      : blocked
        ? t("push.blocked")
        : installMode
          ? t("push.installOnly")
          : message || t("push.notEnabled");

  /** ADMIN-ONLY platform fan-out; the toast reports the reach. */
  async function onTest() {
    setTesting(true);
    try {
      const envelope = await sendTestNotification();
      const { users, push_subscriptions } = envelope.data;
      if (push_subscriptions > 0) {
        notify(
          "success",
          t("push.testSent", { devices: push_subscriptions, users })
        );
      } else {
        notify("info", t("push.testNone"));
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : t("push.testError"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <h2 className="card__title">{t("push.title")}</h2>
      <p className="page__subtitle">
        {t("push.subtitle")}
      </p>

      <p className="prompt__description">
        <BellRing size={15} aria-hidden="true" />{" "}
        {t("push.browserPermission")} <strong>{t(PERMISSION_KEY[permission] ?? "push.permission.default")}</strong>
        {" · "}
        {t("push.thisDevice")} <strong>{subscribed ? t("push.registered") : t("push.notRegistered")}</strong>
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
            <Check size={14} aria-hidden="true" />{" "}
            {actionLabel === "Allow"
              ? t("push.allow")
              : actionLabel === "Enable"
                ? t("push.enable")
                : actionLabel}
          </Button>
        )}
        {subscribed && (
          <Button
            type="button"
            variant="ghost"
            loading={loading}
            onClick={() => void unsubscribe()}
          >
            {t("push.turnOff")}
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
            {t("push.sendTest")}
          </Button>
        )}
      </div>
    </Card>
  );
}