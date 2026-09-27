/**
 * Push notification hook — manages subscription lifecycle.
 * POST body matches backend pushSubscriptionSchema: {endpoint, p256dh_key, auth_key}.
 * Unsubscribe looks up the server row by endpoint (numeric id), then clears browser sub.
 *
 * State is truthful: `subscribed` is only true after BOTH the browser
 * subscription exists and the server accepted it. Server registration
 * failures roll the browser subscription back and surface `error` instead of
 * being swallowed (the old `.catch(() => {})` hid exactly the failures that
 * left the database with zero push-subscription rows).
 */
import { useCallback, useEffect, useState } from "react";
import {
  listPushSubscriptions,
  registerPushSubscription,
  deletePushSubscription,
} from "../api/notifications";
import {
  requestNotificationPermission,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "./notifications";
import { pushFailureMessage } from "./prompt";

export function usePushNotifications(userId: number | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (!("Notification" in window)) return;
    setPermission(Notification.permission);
    getPushSubscription().then((sub) => setSubscribed(!!sub));
  }, [userId]);

  const subscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(pushFailureMessage("permission-denied"));
        return;
      }
      const result = await subscribeToPush();
      if (!result.ok) {
        setError(pushFailureMessage(result.reason));
        return;
      }
      const p = result.subscription.toJSON();
      const keys = (p.keys ?? {}) as { p256dh?: string; auth?: string };
      if (!p.endpoint || !keys.p256dh || !keys.auth) {
        setError(pushFailureMessage("failed"));
        return;
      }
      try {
        await registerPushSubscription({
          endpoint: p.endpoint,
          p256dh_key: keys.p256dh,
          auth_key: keys.auth,
          device_info: { userAgent: navigator.userAgent },
        });
      } catch {
        // Server did not store the subscription (401/expired session/network).
        // Roll back the browser subscription so `subscribed` never lies —
        // otherwise the user sees "enabled" while the server has no row.
        await unsubscribeFromPush().catch(() => undefined);
        setSubscribed(false);
        setError("Could not save this device for notifications — sign in again and retry.");
        return;
      }
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const sub = await getPushSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        try {
          const list = await listPushSubscriptions();
          const match = list.data.results.find((row) => row.endpoint === endpoint);
          if (match) {
            await deletePushSubscription(match.id).catch(() => undefined);
          }
        } catch {
          // list failed — still clear the browser subscription
        }
        await unsubscribeFromPush();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const toggle = useCallback(() => {
    if (subscribed) void unsubscribe();
    else void subscribe();
  }, [subscribed, subscribe, unsubscribe]);

  return { permission, subscribed, loading, error, subscribe, unsubscribe, toggle };
}
