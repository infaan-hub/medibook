/** Notification inbox + push subscriptions. */
import { prisma } from "@/lib/db";
import type { NotificationType, Prisma } from "@prisma/client";

/* ------------------------------ Notifications ------------------------------ */

export const createNotification = (data: {
  recipient_id: number;
  notification_type: string;
  title: string;
  message: string;
  related_appointment_id?: number | null;
}) =>
  prisma.notification.create({
    data: {
      recipient_id: data.recipient_id,
      notification_type: data.notification_type as NotificationType,
      title: data.title,
      message: data.message,
      ...(data.related_appointment_id != null
        ? { related_appointment_id: data.related_appointment_id }
        : {}),
    },
  });

export const listNotifications = (recipientId: number, opts: { unreadOnly: boolean; skip: number; take: number }) =>
  prisma.notification.findMany({
    where: { recipient_id: recipientId, ...(opts.unreadOnly ? { is_read: false } : {}) },
    orderBy: { created_at: "desc" },
    skip: opts.skip,
    take: opts.take,
  });

export const countNotifications = (recipientId: number, unreadOnly: boolean) =>
  prisma.notification.count({
    where: { recipient_id: recipientId, ...(unreadOnly ? { is_read: false } : {}) },
  });

export const findNotificationOwned = (id: number, recipientId: number) =>
  prisma.notification.findFirst({ where: { id, recipient_id: recipientId } });

export const updateNotification = (id: number, data: Prisma.NotificationUpdateInput) =>
  prisma.notification.update({ where: { id }, data });

export const deleteNotification = (id: number) => prisma.notification.delete({ where: { id } });

/* --------------------------- Push subscriptions ---------------------------- */

export const listPushSubscriptions = (userId: number, skip: number, take: number) =>
  prisma.pushSubscription.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    skip,
    take,
  });

export const countPushSubscriptions = (userId: number) =>
  prisma.pushSubscription.count({ where: { user_id: userId } });

/**
 * ACTIVE registrations only — a deactivated row (VAPID rotation, purged
 * endpoint) can never deliver a push, so diagnostics based on this count must
 * not treat it as a reachable device.
 */
export const countActivePushSubscriptions = (userId: number) =>
  prisma.pushSubscription.count({ where: { user_id: userId, is_active: true } });

export const findPushSubscriptionOwned = (id: number, userId: number) =>
  prisma.pushSubscription.findFirst({ where: { id, user_id: userId } });

export const pushEndpointExists = async (endpoint: string) =>
  (await prisma.pushSubscription.findUnique({ where: { endpoint } })) !== null;

export const findPushByEndpoint = (endpoint: string) =>
  prisma.pushSubscription.findUnique({ where: { endpoint } });

export const updatePushSubscription = (
  id: number,
  data: {
    /** Replace the endpoint (SW `pushsubscriptionchange` rotation). Unique — caller must not collide with another row. */
    endpoint?: string;
    /** Reassign the endpoint to another account (see `createPush`). */
    user_id?: number;
    p256dh_key?: string;
    auth_key?: string;
    fcm_token?: string;
    device_info?: Record<string, unknown>;
    is_active?: boolean;
  }
) =>
  prisma.pushSubscription.update({
    where: { id },
    data: {
      ...(data.endpoint !== undefined ? { endpoint: data.endpoint } : {}),
      ...(data.user_id !== undefined ? { user_id: data.user_id } : {}),
      ...(data.p256dh_key !== undefined ? { p256dh_key: data.p256dh_key } : {}),
      ...(data.auth_key !== undefined ? { auth_key: data.auth_key } : {}),
      ...(data.fcm_token !== undefined ? { fcm_token: data.fcm_token } : {}),
      ...(data.device_info !== undefined
        ? { device_info: data.device_info as Prisma.InputJsonValue }
        : {}),
      ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
    },
  });

export const createPushSubscription = (
  userId: number,
  data: {
    endpoint: string;
    p256dh_key?: string;
    auth_key?: string;
    fcm_token?: string;
    device_info?: Record<string, unknown>;
    is_active?: boolean;
  }
) =>
  prisma.pushSubscription.create({
    data: {
      user_id: userId,
      endpoint: data.endpoint,
      p256dh_key: data.p256dh_key ?? "",
      auth_key: data.auth_key ?? "",
      fcm_token: data.fcm_token ?? "",
      device_info: (data.device_info ?? {}) as Prisma.InputJsonValue,
      is_active: data.is_active ?? true,
    },
  });

export const deletePushSubscription = (id: number) => prisma.pushSubscription.delete({ where: { id } });
