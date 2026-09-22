/**
 * Push notification hook — manages subscription lifecycle.
 * Automatically subscribes when user grants permission.
 */
import { useCallback, useEffect, useState } from "react";
import { apiPost, apiDelete } from "../api/client";
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

  // Check current state on mount
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
        // Send to backend
        const p = subscription.toJSON();
        await apiPost("/notifications/push-subscriptions/", {
          endpoint: p.endpoint,
          keys: p.keys,
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
        await apiDelete(`/notifications/push-subscriptions/${sub.endpoint.slice(-8)}/`).catch(() => {});
        await unsubscribeFromPush();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const toggle = useCallback(() => {
    if (subscribed) unsubscribe();
    else subscribe();
  }, [subscribed, subscribe, unsubscribe]);

  return { permission, subscribed, loading, subscribe, unsubscribe, toggle };
}
