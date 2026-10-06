/**
 * Notification service — inbox CRUD + push subscriptions
 * (port of notifications/views.py).
 */
import { notFound } from "@/lib/errors";
import { notificationDto, pushSubscriptionDto } from "@/lib/serializers";
import { notificationPatchSchema, pushSubscriptionSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as notifications from "@/repositories/notifications.repo";
import { broadcastNotificationUpdated, notify } from "@/lib/notify";
import type { AuthUser } from "@/lib/auth";

const isUnreadOnly = (req: Request): boolean => {
  const value = new URL(req.url).searchParams.get("unread") ?? "";
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
};

export const listOwn = (req: Request, user: AuthUser) => ({
  unreadOnly: isUnreadOnly(req),
  run: (skip: number, take: number) =>
    notifications.listNotifications(user.id, { unreadOnly: isUnreadOnly(req), skip, take }),
  count: () => notifications.countNotifications(user.id, isUnreadOnly(req)),
});

export async function retrieveOwn(user: AuthUser, id: number) {
  const row = await notifications.findNotificationOwned(id, user.id);
  if (!row) throw notFound();
  return notificationDto(row);
}

/** PATCH /api/notifications/{id}/ — only is_read is writable (read-only fields ignored). */
export async function patchOwn(user: AuthUser, id: number, body: unknown) {
  const row = await notifications.findNotificationOwned(id, user.id);
  if (!row) throw notFound();
  const input = parse(notificationPatchSchema, body ?? {});
  const updated = input.is_read !== undefined
    ? await notifications.updateNotification(id, { is_read: input.is_read })
    : row;
  if (input.is_read !== undefined) broadcastNotificationUpdated(updated);
  return notificationDto(updated);
}

export async function destroyOwn(user: AuthUser, id: number): Promise<void> {
  const row = await notifications.findNotificationOwned(id, user.id);
  if (!row) throw notFound();
  await notifications.deleteNotification(id);
}

/* --------------------------- Push subscriptions ---------------------------- */

export const listPush = (user: AuthUser) => ({
  run: (skip: number, take: number) => notifications.listPushSubscriptions(user.id, skip, take),
  count: () => notifications.countPushSubscriptions(user.id),
});

export async function createPush(user: AuthUser, body: unknown) {
  const input = parse(pushSubscriptionSchema, body);
  // Idempotent: same endpoint re-register (renewal / multi-tab) updates keys
  // and reactivates instead of failing with a unique-constraint error.
  const existing = await notifications.findPushByEndpoint(input.endpoint);
  if (existing) {
    const updated = await notifications.updatePushSubscription(existing.id, {
      // A Web Push endpoint identifies a BROWSER/DEVICE, not a person — one
      // endpoint can only ever deliver to the account currently using that
      // device. Handing it over (rather than 403-ing) is what makes push work
      // after someone signs out and a different account signs in on the same
      // phone; the previous owner simply stops receiving on that device.
      user_id: existing.user_id === user.id ? undefined : user.id,
      p256dh_key: input.p256dh_key,
      auth_key: input.auth_key,
      fcm_token: input.fcm_token,
      device_info: input.device_info,
      is_active: input.is_active ?? true,
    });
    return pushSubscriptionDto(updated);
  }
  const row = await notifications.createPushSubscription(user.id, {
    endpoint: input.endpoint,
    p256dh_key: input.p256dh_key,
    auth_key: input.auth_key,
    fcm_token: input.fcm_token,
    device_info: input.device_info,
    is_active: input.is_active,
  });
  console.log(`[push] subscription created user=${user.id} id=${row.id}`);
  return pushSubscriptionDto(row);
}

export async function retrievePush(user: AuthUser, id: number) {
  const row = await notifications.findPushSubscriptionOwned(id, user.id);
  if (!row) throw notFound();
  return pushSubscriptionDto(row);
}

export async function destroyPush(user: AuthUser, id: number): Promise<void> {
  const row = await notifications.findPushSubscriptionOwned(id, user.id);
  if (!row) throw notFound();
  await notifications.deletePushSubscription(id);
  console.log(`[push] subscription removed user=${user.id} id=${id}`);
}

/* ------------------------------ Delivery test ------------------------------ */

/**
 * POST /api/notifications/test/ — send a test notification to the CALLER.
 *
 * The diagnostic behind "my browser stopped receiving notifications": it runs
 * the exact path a real system notification takes (inbox row → realtime frame
 * → web push), so the answer is end-to-end rather than a guess.
 *
 * `push_subscriptions` is the number of ACTIVE device registrations the push
 * half could target. Zero (or a browser with no local subscription) is the
 * usual reason nothing arrives — the repair lives on /profile: re-run the
 * permission + subscribe flow from the "Allow"/"Enable" action there.
 */
export async function sendTestNotification(user: AuthUser) {
  const push_subscriptions = await notifications.countActivePushSubscriptions(user.id);
  const row = await notify(
    user.id,
    "system",
    "This is a test notification from MediBook. If you can see it, delivery to this account works.",
    null,
    "MediBook test notification"
  );
  console.log(`[notifications] test sent user=${user.id} active_push_subs=${push_subscriptions}`);
  return { notification: notificationDto(row), push_subscriptions };
}
