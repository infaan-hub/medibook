/**
 * Appointment service — booking, PATCH (notes/reschedule), delete and the
 * confirm/complete/cancel/reject actions (port of appointments/views.py).
 *
 * Concurrency (§15): the pre-insert live-slot check runs inside a transaction
 * and the partial unique index `uniq_live_doctor_slot` guarantees that two
 * concurrent requests can never occupy the same doctor/date/start slot — the
 * loser receives the same 409 the Django IntegrityError path produced.
 */
import { Prisma } from "@prisma/client";
import { conflict, forbidden, notFound, badRequest, ValidationError } from "@/lib/errors";
import { combineDateTime, normalizeTime, todayIso } from "@/lib/dates";
import { appointmentDto } from "@/lib/serializers";
import { broadcastAppointmentEvent, broadcastAvailabilityUpdated, notify, pushRaw } from "@/lib/notify";
import { availableSlots } from "./schedule.service";
import { appointmentCreateSchema, appointmentPatchSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";
import type { Appointment, User } from "@prisma/client";

type AppointmentWithPatient = Appointment & { patient: User };

const SLOT_TAKEN = () =>
  conflict("This appointment slot is no longer available. Please select another time.", {
    start_time: ["This slot was just booked."],
  });

/** Serializable-transaction retry around the unique-slot insert. */
async function createWithSlotGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.meta?.constraint === "uniq_live_doctor_slot")
    ) {
      throw SLOT_TAKEN();
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw badRequest("The request could not be processed.", {
        non_field_errors: ["A record with these details already exists."],
      });
    }
    throw error;
  }
}

/** POST /api/appointments/ — patient books a slot (201 "Appointment requested."). */
export async function bookAppointment(req: Request, user: AuthUser, body: unknown) {
  const input = parse(appointmentCreateSchema, body);

  const doctor = await doctors.findDoctorById(Number(input.doctor)).catch(() => null);
  if (!doctor) {
    throw badRequest("The selected doctor was not found.", {
      doctor: ["The selected doctor was not found."],
    });
  }
  if (input.hospital !== undefined && input.hospital !== null) {
    const { findHospital } = await import("@/repositories/content.repo");
    if (!(await findHospital(input.hospital))) {
      throw new ValidationError({ hospital: [`Invalid pk "${input.hospital}" - object does not exist.`] });
    }
  }

  const date = input.appointment_date;
  const start = normalizeTime(input.start_time);
  const end = normalizeTime(input.end_time);

  // 1) Live-slot occupancy (transaction check from the Django view).
  if (await appointments.liveSlotExists(doctor.id, date, start)) throw SLOT_TAKEN();

  // 2) Past dates + open-slot membership.
  if (date < todayIso() || !(await slotIsOpen(doctor, date, start, end))) {
    throw badRequest("The selected appointment time is not available.", {
      start_time: ["Choose an available appointment slot."],
    });
  }

  const appointment = await createWithSlotGuard(() =>
    appointments.createAppointment({
      patient_id: user.id,
      doctor_id: doctor.id,
      hospital_id: input.hospital ?? null,
      appointment_date: date,
      start_time: start,
      end_time: end,
      reason: input.reason ?? "",
    })
  );

  await notify(
    doctor.user_id,
    "appointment_request",
    `New appointment request from ${user.email}.`,
    appointment.id
  );
  broadcastAppointmentEvent(appointment, "appointment.created", [
    appointment.patient_id,
    doctor.user_id,
  ]);
  // Slot is now occupied — tell connected clients to refresh availability.
  broadcastAvailabilityUpdated(doctor.id, date);
  return appointment;
}

async function slotIsOpen(
  doctor: { id: number; is_available: boolean },
  date: string,
  start: string,
  end: string
): Promise<boolean> {
  const slots = await availableSlots(doctor.id, doctor.is_available, date);
  return slots.some((slot) => slot.start_time === start && slot.end_time === end);
}

export { slotIsOpen };

/** Map appointment → DTO (patient relation preloaded by the repo). */
export const toDto = appointmentDto;

/** True when the user may read this appointment (patient/doctor owner or admin). */
async function canAccess(user: AuthUser, appointment: AppointmentWithPatient): Promise<boolean> {
  const isAdmin = user.role === "admin" || user.is_superuser;
  if (isAdmin || appointment.patient_id === user.id) return true;
  if (user.role === "doctor") {
    const own = await ownDoctorId(user);
    return own !== -1 && appointment.doctor_id === own;
  }
  return false;
}

/** GET/DELETE guard — 404 when missing, 403 when the user cannot access it. */
export async function assertCanAccess(user: AuthUser, id: number): Promise<AppointmentWithPatient> {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (!(await canAccess(user, appointment))) {
    throw forbidden("You do not have permission to access this appointment.");
  }
  return appointment;
}

/** Shared detail fetch used by GET /api/appointments/{id}/. */
export async function getAccessible(user: AuthUser, id: number): Promise<AppointmentWithPatient> {
  return assertCanAccess(user, id);
}

async function ownDoctorId(user: AuthUser): Promise<number> {
  const doctor = await doctors.findDoctorByUserId(user.id);
  return doctor ? doctor.id : -1;
}

/**
 * PATCH /api/appointments/{id}/ — notes/reason for either party; in-place
 * reschedule restricted to the owning doctor or an admin.
 */
export async function patchAppointment(req: Request, user: AuthUser, id: number, body: unknown) {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.status !== undefined) {
    throw badRequest("Status changes must use the confirm/cancel/complete/reject endpoints.", {
      status: ["Use the status action endpoints instead of PATCH."],
    });
  }

  const input = parse(appointmentPatchSchema, body);
  const changingTime =
    raw.appointment_date !== undefined || raw.start_time !== undefined || raw.end_time !== undefined;

  const role = user.role;
  const isOwnerDoctor = role === "doctor" && appointment.doctor_id === (await ownDoctorId(user));
  const isAdmin = role === "admin" || user.is_superuser;

  const before = {
    date: appointment.appointment_date.toISOString().slice(0, 10),
    start: appointment.start_time,
    end: appointment.end_time,
  };

  if (changingTime) {
    if (!isOwnerDoctor && !isAdmin) {
      throw forbidden("Only the doctor who owns this appointment can reschedule it.");
    }
    const newDate = input.appointment_date ?? before.date;
    const newStart = input.start_time ? normalizeTime(input.start_time) : before.start;
    const newEnd = input.end_time ? normalizeTime(input.end_time) : before.end;
    if (newDate < todayIso()) {
      throw badRequest("The new appointment date must be today or later.", {
        appointment_date: ["Choose a future date."],
      });
    }
    if (await appointments.liveSlotExists(appointment.doctor_id, newDate, newStart, id)) {
      throw conflict("That time slot is already booked. Choose another.", {
        start_time: ["This slot was just booked."],
      });
    }
    const open = await slotIsOpen(
      { id: appointment.doctor_id, is_available: true },
      newDate,
      newStart,
      newEnd
    );
    if (!open) {
      throw badRequest("The new appointment time is not an open slot.", {
        start_time: ["Choose an available appointment slot."],
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (input.reason !== undefined) data.reason = input.reason;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.hospital !== undefined) data.hospital_id = input.hospital;
  if (changingTime) {
    data.appointment_date = new Date(`${input.appointment_date ?? before.date}T00:00:00Z`);
    data.start_time = input.start_time ? normalizeTime(input.start_time) : before.start;
    data.end_time = input.end_time ? normalizeTime(input.end_time) : before.end;
  }

  const updated = await createWithSlotGuard(() => appointments.updateAppointment(id, data));

  const after = {
    date: updated.appointment_date.toISOString().slice(0, 10),
    start: updated.start_time,
    end: updated.end_time,
  };
  const timeChanged =
    changingTime && (after.date !== before.date || after.start !== before.start || after.end !== before.end);

  if (timeChanged) {
    const doctorRow = await doctors.findDoctorById(updated.doctor_id);
    const doctorName = doctorRow
      ? `Dr. ${doctorRow.user.first_name} ${doctorRow.user.last_name}`.trim() ||
        `Dr. ${doctorRow.user.username}`
      : "your doctor";
    await notify(
      updated.patient_id,
      "appointment_reminder",
      `Appointment rescheduled to ${after.date} at ${after.start.slice(0, 5)}–${after.end.slice(0, 5)} by ${doctorName}.`,
      updated.id
    );
    broadcastAvailabilityUpdated(updated.doctor_id, before.date);
    broadcastAvailabilityUpdated(updated.doctor_id, after.date);
  }
  const doctorRow = await doctors.findDoctorById(updated.doctor_id);
  broadcastAppointmentEvent(updated, "appointment.updated", [updated.patient_id, doctorRow?.user_id]);
  return {
    appointment: updated,
    message: timeChanged ? "Appointment rescheduled." : "Appointment updated.",
  };
}

/** DELETE /api/appointments/{id}/ — 204 + realtime appointment.deleted. */
export async function destroyAppointment(id: number): Promise<void> {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  const doctor = await doctors.findDoctorById(appointment.doctor_id);
  await appointments.deleteAppointment(id);
  pushRaw("appointment.deleted", { id }, [appointment.patient_id, doctor?.user_id]);
  broadcastAvailabilityUpdated(
    appointment.doctor_id,
    appointment.appointment_date.toISOString().slice(0, 10)
  );
}

const ACTION_MAP: Record<string, { status: string; roles: string[] }> = {
  confirm: { status: "confirmed", roles: ["doctor", "admin"] },
  complete: { status: "completed", roles: ["doctor", "admin"] },
  cancel: { status: "cancelled", roles: ["patient", "doctor", "admin"] },
  reject: { status: "rejected", roles: ["doctor", "admin"] },
};

/** Allowed next statuses from each current status (terminal states have none). */
const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["confirmed", "cancelled", "rejected"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};

function assertTransition(from: string, to: string): void {
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw conflict(
      `Cannot change appointment status from "${from}" to "${to}".`,
      { status: [`Invalid transition ${from} → ${to}.`] }
    );
  }
}

const NOTIFY_TYPE: Record<string, string> = {
  confirmed: "appointment_confirmed",
  completed: "system",
  cancelled: "appointment_cancelled",
  rejected: "appointment_rejected",
};

const NOTIFY_MESSAGE: Record<string, string> = {
  confirmed: "Appointment confirmed",
  completed: "Appointment completed",
  cancelled: "Appointment cancelled",
  rejected: "Appointment rejected",
};

export const isKnownAction = (action: string): boolean => action in ACTION_MAP;

/**
 * POST /api/appointments/{id}/{confirm,complete,cancel,reject}/ —
 * role matrix and side effects ported from AppointmentActionView.
 */
export async function runAction(user: AuthUser, id: number, action: string, body: unknown) {
  const config = ACTION_MAP[action];
  if (!config) throw notFound();

  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();

  const role = user.role;
  const isAdmin = role === "admin" || user.is_superuser;
  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = role === "doctor" && ownDoctor === appointment.doctor_id;
  const isOwnerPatient = appointment.patient_id === user.id;

  // Django: cancel → owner patient/doctor/admin; others → (role in roles and
  // (owner-doctor or admin)) or (admin and "admin" in roles).
  const allowed =
    action === "cancel"
      ? isOwnerPatient || isOwnerDoctor || isAdmin
      : ((role === "doctor" || role === "admin") && (isOwnerDoctor || isAdmin)) ||
        (isAdmin && config.roles.includes("admin"));
  if (!allowed) throw forbidden("You do not have permission to perform this action.");

  // State machine: reject illegal transitions (e.g. confirm a cancelled appointment).
  assertTransition(appointment.status, config.status);

  const { appointmentActionSchema } = await import("@/validators/misc");
  const rawBody = (body ?? {}) as Record<string, unknown>;
  const payload = parse(appointmentActionSchema, { ...rawBody, status: config.status });
  const updated = await appointments.updateAppointment(id, {
    status: config.status as never,
    ...(payload.cancel_reason ? { cancel_reason: payload.cancel_reason } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
  });

  // Auto-create 1h/24h/1w reminders when an appointment is confirmed.
  if (config.status === "confirmed") await createReminders(updated);

  const doctor = await doctors.findDoctorById(updated.doctor_id);
  const other =
    isOwnerDoctor || (isAdmin && !isOwnerPatient) ? updated.patient_id : doctor?.user_id;
  await notify(
    other as number,
    NOTIFY_TYPE[config.status],
    `${NOTIFY_MESSAGE[config.status]}: ${updated.appointment_date.toISOString().slice(0, 10)} ${updated.start_time}.`,
    updated.id
  );
  broadcastAppointmentEvent(updated, "appointment.updated", [updated.patient_id, doctor?.user_id]);
  return { appointment: updated, message: `Appointment ${config.status}.` };
}

/** Django AppointmentViewSet._create_reminders (only future reminders). */
export async function createReminders(appointment: Appointment): Promise<void> {
  const startsAt = combineDateTime(
    appointment.appointment_date.toISOString().slice(0, 10),
    appointment.start_time
  ).getTime();
  const now = Date.now();
  const configs: Array<[string, number]> = [
    ["1h", 3_600_000],
    ["24h", 86_400_000],
    ["1w", 604_800_000],
  ];
  for (const [type, delta] of configs) {
    const scheduled = new Date(startsAt - delta);
    if (scheduled.getTime() > now) {
      await appointments.createReminderIfAbsent(appointment.id, type, scheduled);
    }
  }
}


