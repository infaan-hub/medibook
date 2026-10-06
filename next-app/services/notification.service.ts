/**
 * Notification service — inbox CRUD + push subscriptions
 * (port of notifications/views.py).
 */
import { forbidden, notFound } from "@/lib/errors";
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

/* --------------------------- Platform test fan-out -------------------------- */

const TEST_NOTIFICATION_MESSAGE =
  "This is a test notification from MediBook. If you can see it, delivery to this account works.";

/**
 * POST /api/notifications/test/ — ADMIN ONLY: fan a test notification out to
 * EVERY device registered for push on the platform.
 *
 * The diagnostic behind "are our notifications broken?": each recipient goes
 * through the exact path a real system notification takes (inbox row →
 * realtime frame → web push), so the admin verifies the pipeline end to end
 * instead of guessing. Doctors and patients never reach this — their /profile
 * section only offers turn-on/turn-off for their own device — and the role
 * gate lives HERE, not in the UI, so a hand-crafted request cannot fan out.
 *
 * `users` / `push_subscriptions` report the reach: how many accounts were
 * notified and how many ACTIVE device registrations the push half targeted.
 * Zero devices means nobody can receive push anywhere — the fix is asking
 * users to re-enable notifications from their own Profile.
 */
export async function sendTestNotificationToAllDevices(actor: AuthUser) {
  if (actor.role !== "admin" && !actor.is_superuser) {
    throw forbidden("Only administrators can send platform-wide test notifications.");
  }
  const userIds = await notifications.listUserIdsWithActivePush();
  const push_subscriptions = await notifications.countAllActivePushSubscriptions();
  for (const userId of userIds) {
    await notify(userId, "system", TEST_NOTIFICATION_MESSAGE, null, "MediBook test notification");
  }
  console.log(
    `[notifications] platform test sent by=${actor.id} users=${userIds.length} active_push_subs=${push_subscriptions}`
  );
  return { users: userIds.length, push_subscriptions };
}
