/**
 * Notifications API — inbox CRUD + push subscription management.
 * Backend: /api/notifications/, /api/notifications/push-subscriptions/.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { Envelope, Notification, Paginated, PushSubscription } from "./types";

/** GET /api/notifications/ — paginated notification inbox. */
export function listNotifications(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<Notification>>> {
  return apiGet<Paginated<Notification>>("/notifications/", params);
}

/** GET /api/notifications/?unread=1 — unread notifications only. */
export function listUnreadNotifications(): Promise<Envelope<Paginated<Notification>>> {
  return apiGet<Paginated<Notification>>("/notifications/", { unread: 1 });
}

/** PATCH /api/notifications/:id/ — mark as read. */
export function markNotificationRead(id: number): Promise<Envelope<Notification>> {
  return apiPatch<Notification>(`/notifications/${id}/`, { is_read: true });
}

/** DELETE /api/notifications/:id/ — delete a notification. */
export function deleteNotification(id: number): Promise<void> {
  return apiDelete(`/notifications/${id}/`).then(() => undefined);
}

/** GET /api/notifications/push-subscriptions/ — list the caller's push rows. */
export function listPushSubscriptions(): Promise<Envelope<Paginated<PushSubscription>>> {
  return apiGet<Paginated<PushSubscription>>("/notifications/push-subscriptions/");
}

/** POST /api/notifications/push-subscriptions/ — register a push subscription. */
export function registerPushSubscription(payload: {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  fcm_token?: string;
  device_info?: Record<string, unknown>;
}): Promise<Envelope<PushSubscription>> {
  return apiPost<PushSubscription>("/notifications/push-subscriptions/", payload);
}

/** DELETE /api/notifications/push-subscriptions/:id/ — remove a push subscription. */
export function deletePushSubscription(id: number): Promise<void> {
  return apiDelete(`/notifications/push-subscriptions/${id}/`).then(() => undefined);
}
