/**
 * Notification helpers — port of backend/notifications/helpers.py.
 * Every created inbox row is immediately pushed over the realtime WebSocket,
 * and appointment mutations broadcast appointment.* events to both parties.
 */
import { prisma } from "./db";
import { dateStr } from "./serialize";
import { pushEvent } from "./realtime";
import type { Notification, NotificationType, Appointment } from "@prisma/client";

/** Django _TITLES map (helpers.py). */
const TITLES: Record<string, string> = {
  appointment_request: "New appointment request",
  appointment_confirmed: "Appointment confirmed",
  appointment_cancelled: "Appointment cancelled",
  appointment_rejected: "Appointment rejected",
  appointment_reminder: "Appointment reminder",
  review: "New review",
  system: "MediBook update",
};

export function notificationPayload(notification: Notification): Record<string, unknown> {
  return {
    id: notification.id,
    notification_type: notification.notification_type,
    title: notification.title,
    message: notification.message,
    related_appointment: notification.related_appointment_id,
    is_read: notification.is_read,
    created_at: notification.created_at.toISOString(),
  };
}

export function appointmentPayload(appointment: Appointment): Record<string, unknown> {
  return {
    id: appointment.id,
    status: appointment.status,
    appointment_date: dateStr(appointment.appointment_date),
    start_time: appointment.start_time,
    end_time: appointment.end_time,
  };
}

/** Create an inbox row for the recipient and push it live (notify()). */
export async function notify(
  recipientId: number,
  notificationType: NotificationType | string,
  message: string,
  appointmentId?: number | null
): Promise<Notification> {
  const notification = await prisma.notification.create({
    data: {
      recipient_id: recipientId,
      notification_type: notificationType as NotificationType,
      title: TITLES[notificationType] ?? "MediBook update",
      message,
      ...(appointmentId != null ? { related_appointment_id: appointmentId } : {}),
    },
  });
  pushEvent([recipientId], "notification.created", notificationPayload(notification));
  return notification;
}

/** Push appointment.created / appointment.updated to both parties. */
export function broadcastAppointmentEvent(
  appointment: Appointment,
  event: "appointment.created" | "appointment.updated",
  recipientIds: Array<number | null | undefined>
): void {
  const targets = recipientIds.filter((id): id is number => typeof id === "number");
  pushEvent(targets, event, appointmentPayload(appointment));
}

/** Low-level push (used by DELETE /api/appointments/{id}/ → appointment.deleted). */
export function pushRaw(
  event: string,
  payload: Record<string, unknown>,
  recipientIds: Array<number | null | undefined>
): void {
  const targets = recipientIds.filter((id): id is number => typeof id === "number");
  pushEvent(targets, event, payload);
}
