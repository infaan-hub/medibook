/**
 * Push notification hook — manages subscription lifecycle.
 * POST body matches backend pushSubscriptionSchema: {endpoint, p256dh_key, auth_key}.
 * Unsubscribe looks up the server row by endpoint (numeric id), then clears browser sub.
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

export function usePushNotifications(userId: number | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!("Notification" in window)) return;
    setPermission(Notification.permission);
    getPushSubscription().then((sub) => setSubscribed(!!sub));
  }, [userId]);

  const subscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return;
      }
      const subscription = await subscribeToPush();
      if (subscription) {
        const p = subscription.toJSON();
        const keys = (p.keys ?? {}) as { p256dh?: string; auth?: string };
        if (!p.endpoint || !keys.p256dh || !keys.auth) {
          setSubscribed(false);
          return;
        }
        await registerPushSubscription({
          endpoint: p.endpoint,
          p256dh_key: keys.p256dh,
          auth_key: keys.auth,
          device_info: { userAgent: navigator.userAgent },
        }).catch(() => {});
        setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const sub = await getPushSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        try {
          const list = await listPushSubscriptions();
          const match = list.data.results.find((row) => row.endpoint === endpoint);
          if (match) {
            await deletePushSubscription(match.id).catch(() => {});
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

  return { permission, subscribed, loading, subscribe, unsubscribe, toggle };
}
