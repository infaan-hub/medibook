/**
 * Notification service — inbox CRUD + push subscriptions
 * (port of notifications/views.py).
 */
import { badRequest, notFound } from "@/lib/errors";
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

/**
 * Rotate a subscription to its FRESH endpoint.
 *
 * Driven by the service worker's `pushsubscriptionchange`
 * (public/service-worker.js): the browser has already created the new
 * subscription while the page is closed, so no access token is available
 * and the backend must swap old → new itself, or every send keeps targeting
 * a dead endpoint.
 *
 * - Authenticated caller: same policy as `createPush` — upsert under that
 *   user; with no `oldEndpoint` this just registers the fresh subscription.
 * - Anonymous caller: possession of the OLD endpoint is the proof. Only that
 *   row's endpoint/keys/device move to the fresh values; `user_id` is NEVER
 *   reassigned, so this can never hand notifications to another account.
 *
 * Returns the stored DTO, or null when nothing matched (→ 404).
 */
export async function rotatePushSubscription(
  input: {
    oldEndpoint: string | null;
    subscription: {
      endpoint: string;
      p256dh_key?: string;
      auth_key?: string;
      fcm_token?: string;
      device_info?: Record<string, unknown>;
    };
  },
  user: AuthUser | null
) {
  const parsed = parse(pushSubscriptionSchema, input.subscription);
  if (!parsed.p256dh_key || !parsed.auth_key) {
    throw badRequest("p256dh_key and auth_key are required to rotate a subscription.");
  }
  const oldRow = input.oldEndpoint
    ? await notifications.findPushByEndpoint(input.oldEndpoint)
    : null;

  if (!oldRow) {
    // Signed-in: register the fresh subscription (old row may already be
    // purged, or this is the first one from this device). Anonymous callers
    // cannot prove anything without the old endpoint → 404, nothing to rotate.
    if (!user) return null;
    return createPush(user, parsed);
  }

  // Retry / second tab: the successor endpoint may already be its own row.
  // Keep it (it is the live one) and drop the row it replaced — writing the
  // old row onto a taken endpoint would trip the unique index.
  const successor = await notifications.findPushByEndpoint(parsed.endpoint);
  if (successor && successor.id !== oldRow.id) {
    const merged = await notifications.updatePushSubscription(successor.id, {
      p256dh_key: parsed.p256dh_key,
      auth_key: parsed.auth_key,
      device_info: parsed.device_info,
      is_active: true,
    });
    await notifications.deletePushSubscription(oldRow.id);
    console.log(`[push] rotation merged old id=${oldRow.id} → id=${merged.id} user=${merged.user_id}`);
    return pushSubscriptionDto(merged);
  }

  const updated = await notifications.updatePushSubscription(oldRow.id, {
    endpoint: parsed.endpoint,
    p256dh_key: parsed.p256dh_key,
    auth_key: parsed.auth_key,
    fcm_token: parsed.fcm_token,
    device_info: parsed.device_info,
    is_active: true,
    // A signed-in rotation may hand the device over (same rule as
    // createPush); an anonymous rotation must NEVER move it.
    ...(user ? { user_id: user.id } : {}),
  });
  console.log(
    `[push] subscription rotated id=${updated.id} user=${updated.user_id}${user ? "" : " (endpoint possession)"}`
  );
  return pushSubscriptionDto(updated);
}
