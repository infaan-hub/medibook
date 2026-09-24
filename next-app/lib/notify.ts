/**
 * Notification helpers — create inbox rows, push realtime envelopes, and
 * fan out web push where appropriate.
 *
 * Realtime events are only emitted AFTER the corresponding DB write succeeds.
 */
import { prisma } from "./db";
import { dateStr } from "./serialize";
import { pushEvent, pushEventAll } from "./realtime";
import { sendWebPushSafe } from "./push";
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
    updated_at: notification.updated_at.toISOString(),
  };
}

export function appointmentPayload(appointment: Appointment): Record<string, unknown> {
  return {
    id: appointment.id,
    status: appointment.status,
    appointment_date: dateStr(appointment.appointment_date),
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    doctor_id: appointment.doctor_id,
    patient_id: appointment.patient_id,
    reason: appointment.reason,
    updated_at: appointment.updated_at.toISOString(),
  };
}

function versionOf(date: Date | undefined): number {
  return date ? date.getTime() : Date.now();
}

/** Create an inbox row, push it live, and attempt web push delivery. */
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

  // DB write succeeded → safe to emit realtime + push.
  pushEvent([recipientId], "notification.created", notificationPayload(notification), {
    version: versionOf(notification.updated_at),
    entityId: notification.id,
  });

  sendWebPushSafe(recipientId, {
    title: notification.title,
    body: message,
    url: appointmentId != null ? `/appointments/${appointmentId}` : "/notifications",
    appointment_id: appointmentId ?? undefined,
    notification_id: notification.id,
    tag:
      notificationType === "appointment_reminder" && appointmentId != null
        ? `reminder-${appointmentId}`
        : `notification-${notification.id}`,
  });

  return notification;
}

/** Emit notification.updated after mark-read / patch so clients sync is_read. */
export function broadcastNotificationUpdated(notification: Notification): void {
  pushEvent([notification.recipient_id], "notification.updated", notificationPayload(notification), {
    version: versionOf(notification.updated_at),
    entityId: notification.id,
  });
}

/** Push appointment.created / appointment.updated to both parties. */
export function broadcastAppointmentEvent(
  appointment: Appointment,
  event: "appointment.created" | "appointment.updated",
  recipientIds: Array<number | null | undefined>
): void {
  const targets = recipientIds.filter((id): id is number => typeof id === "number");
  pushEvent(targets, event, appointmentPayload(appointment), {
    version: versionOf(appointment.updated_at),
    entityId: appointment.id,
  });
}

/** After a booking changes occupancy, refresh open slots for connected clients. */
export function broadcastAvailabilityUpdated(
  doctorId: number,
  date: string
): void {
  pushEventAll(
    "doctor.availability.updated",
    { doctor_id: doctorId, date },
    { version: Date.now(), entityId: `doctor-${doctorId}-${date}` }
  );
}

/** Low-level push (used by DELETE /api/appointments/{id}/ → appointment.deleted). */
export function pushRaw(
  event: string,
  payload: Record<string, unknown>,
  recipientIds: Array<number | null | undefined>
): void {
  const targets = recipientIds.filter((id): id is number => typeof id === "number");
  const rawId = payload.id;
  const entityId =
    typeof rawId === "string" || typeof rawId === "number" ? rawId : undefined;
  pushEvent(targets, event, payload, {
    version: Date.now(),
    ...(entityId !== undefined ? { entityId } : {}),
  });
}
