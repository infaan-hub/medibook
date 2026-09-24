/**
 * Notification service — inbox CRUD + push subscriptions
 * (port of notifications/views.py).
 */
import { notFound } from "@/lib/errors";
import { notificationDto, pushSubscriptionDto } from "@/lib/serializers";
import { notificationPatchSchema, pushSubscriptionSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as notifications from "@/repositories/notifications.repo";
import { broadcastNotificationUpdated } from "@/lib/notify";
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
    if (existing.user_id !== user.id) {
      const { forbidden } = await import("@/lib/errors");
      throw forbidden("This push endpoint belongs to another account.");
    }
    const updated = await notifications.updatePushSubscription(existing.id, {
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
