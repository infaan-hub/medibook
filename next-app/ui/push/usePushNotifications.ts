/**
 * Push notification hook — subscription lifecycle as a finite state machine.
 * POST body matches backend pushSubscriptionSchema: {endpoint, p256dh_key, auth_key, device_info}.
 * Unsubscribe looks up the server row by endpoint (numeric id), then clears browser sub.
 *
 * Platform rules:
 *  - iOS/iPadOS: Web Push only exists in the installed Home Screen app. In a
 *    Safari tab the hook reports IOS_NOT_INSTALLED (install instructions) and
 *    NEVER calls Notification.requestPermission(); inside the Home Screen app
 *    the request runs directly from the button tap, as Apple requires.
 *  - Android/desktop: the normal browser permission flow, also started from
 *    the tap.
 *  - denied: reported as DENIED with settings guidance, never a re-ask loop.
 *
 * State is truthful: `subscribed` is only true after BOTH the browser
 * subscription exists and the server accepted it. Server registration
 * failures roll the browser subscription back and surface a typed failure
 * (`backend-failed`) instead of being swallowed.
 */
import { useCallback, useEffect, useState } from "react";
import {
  listPushSubscriptions,
  registerPushSubscription,
  deletePushSubscription,
} from "../api/notifications";
import { getNotificationCapability, type NotificationCapability } from "../lib/platform";
import {
  readNotificationPermission,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "./notifications";
import { ensureServerSubscription } from "./sync";
import {
  IOS_INSTALL_STEPS,
  pushFailureMessage,
  pushStateActionLabel,
  pushStateMessage,
  resolvePushState,
  type PushFailureReason,
  type PushUiState,
} from "./prompt";

export function usePushNotifications(userId: number | null) {
  const [capability, setCapability] = useState<NotificationCapability>(() =>
    getNotificationCapability()
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    readNotificationPermission()
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<PushFailureReason | null>(null);
  // True once the read-only subscription probe has settled, so prompt
  // surfaces wait for the real state instead of flashing a stale one.
  const [probed, setProbed] = useState(false);

  // Standalone can flip while the app is open (installed from the browser
  // menu / display-mode change) — re-probe so the iOS branch never goes stale.
  useEffect(() => {
    const update = () => setCapability(getNotificationCapability());
    window.addEventListener("appinstalled", update);
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    media?.addEventListener("change", update);
    return () => {
      window.removeEventListener("appinstalled", update);
      media?.removeEventListener("change", update);
    };
  }, []);

  // Read-only re-check when the user comes back: permission can change while
  // the app is in the background (device Settings). Purely a read — it never
  // triggers a prompt, so returning from Settings can only update the state,
  // never nag. It also re-runs the subscription self-heal pass: iOS rotates or
  // drops endpoints while the app is closed, which is exactly when the server
  // would otherwise keep pointing at a dead one.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      setPermission(readNotificationPermission());
      void ensureServerSubscription();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Read-only probe: reports the current answer and an existing subscription.
  // It never requests permission — the OS prompt only ever comes from a tap.
  // While it runs, the server copy of the subscription is compared and
  // repaired (throttled, never prompting), so `subscribed` reflects what is
  // actually deliverable rather than a browser state the server never saw.
  useEffect(() => {
    if (!userId) return;
    setPermission(readNotificationPermission());
    if (!getNotificationCapability().webPushSupported) {
      setProbed(true);
      return;
    }
    let cancelled = false;
    getPushSubscription()
      .then(async (sub) => {
        if (cancelled) return;
        setSubscribed(!!sub);
        const outcome = await ensureServerSubscription();
        if (cancelled) return;
        if (outcome !== "skipped" && outcome !== "failed") {
          setSubscribed(true);
        }
        setProbed(true);
      })
      .catch(() => {
        if (!cancelled) setProbed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const state: PushUiState = resolvePushState({
    platform: capability.platform,
    standalone: capability.standalone,
    secure: capability.secureContext,
    permission,
    subscribed,
    requesting: loading,
    failure,
  });

  /**
   * Enable notifications. Called ONLY from a button's click handler — the
   * permission request inside runs synchronously from this tap, which is what
   * iOS requires before it will show its system prompt.
   *
   * Resolves `true` only when the browser subscription exists AND the backend
   * stored it; every other outcome surfaces a typed `failure` instead.
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setLoading(true);
    setFailure(null);
    try {
      const result = await subscribeToPush();
      setPermission(readNotificationPermission());
      if (!result.ok) {
        setFailure(result.reason);
        return false;
      }
      const p = result.subscription.toJSON();
      const keys = (p.keys ?? {}) as { p256dh?: string; auth?: string };
      if (!p.endpoint || !keys.p256dh || !keys.auth) {
        setFailure("subscription-failed");
        return false;
      }
      try {
        await registerPushSubscription({
          endpoint: p.endpoint,
          p256dh_key: keys.p256dh,
          auth_key: keys.auth,
          device_info: {
            userAgent: navigator.userAgent,
            platform: capability.platform,
            standalone: capability.standalone,
            registered_at: new Date().toISOString(),
          },
        });
      } catch {
        // Server did not store the subscription (401/expired session/network).
        // Roll back THIS device's browser subscription so `subscribed` never
        // lies — other devices keep their own rows (endpoint-unique, so an
        // iPhone/Android/desktop set never overwrites each other).
        await unsubscribeFromPush().catch(() => undefined);
        setSubscribed(false);
        setFailure("backend-failed");
        return false;
      }
      setSubscribed(true);
      return true;
    } finally {
      setLoading(false);
    }
  }, [userId, capability.platform, capability.standalone]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFailure(null);
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

  const actionLabel = pushStateActionLabel(state, failure);
  const message = pushStateMessage(state, failure);
  const error = state === "FAILED" ? pushFailureMessage(failure ?? "failed") : null;

  const toggle = useCallback(() => {
    if (subscribed) void unsubscribe();
    else if (actionLabel) void subscribe();
  }, [subscribed, actionLabel, subscribe, unsubscribe]);

  return {
    /** Current finite-state-machine state — the single source of UI truth. */
    state,
    /** False until the initial (read-only) subscription probe has settled. */
    probed,
    permission,
    subscribed,
    loading,
    /** Failure copy for the current state (modals + red banner), else null. */
    error,
    /** Copy for the current state; "" when there is nothing to show. */
    message,
    /** Button label for the state, or null when no button can help. */
    actionLabel,
    /** iOS "Add to Home Screen" instructions, when that is the blocker. */
    steps: state === "IOS_NOT_INSTALLED" ? IOS_INSTALL_STEPS : null,
    subscribe,
    unsubscribe,
    toggle,
  };
}
