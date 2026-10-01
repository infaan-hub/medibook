/**
 * Emergency appointment service — handles emergency appointment booking,
 * nearby doctor search, and emergency-specific actions.
 */
import { Prisma } from "@prisma/client";
import { conflict, notFound, badRequest, forbidden, ValidationError } from "@/lib/errors";
import { isoWeekday, normalizeTime, secondsToTime, timeToSeconds, todayIso } from "@/lib/dates";
import { appointmentDto, emergencyAppointmentDto } from "@/lib/serializers";
import { emergencyAppointmentCreateSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as appointments from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { broadcastAppointmentEvent, notify } from "@/lib/notify";
import { hasLocation, haversineKm } from "@/lib/geo";
import type { AuthUser } from "@/lib/auth";
import type { Appointment, NotificationType, User } from "@prisma/client";

type AppointmentWithPatient = Appointment & { patient: User };

/**
 * Row shape returned by the nearby search — deliberately `select`s only the
 * `User` columns `doctorDto()` reads so a password hash never travels with a
 * public emergency response.
 */
type NearbyDoctorRow = Prisma.DoctorGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
        email: true;
        phone: true;
        profile_image_id: true;
      };
    };
    specialties: { include: { specialty: true } };
    hospitals: { include: { hospital: true } };
  };
}>;

/**
 * Default search radius around the patient's position, in km. The HTTP route
 * clamps to MAX so internal callers can scan past it — auto-dispatch and the
 * merged slot grid deliberately keep scanning until a doctor matches.
 */
const EMERGENCY_RADIUS_KM = 5;
export const MAX_EMERGENCY_RADIUS_KM = 50;

/** Emergency appointments are stamped for now + this window. */
const EMERGENCY_SLOT_SECONDS = 30 * 60;

/** How many nearby doctors we inspect before giving up on a date/slot. */
const MAX_SLOT_CANDIDATES = 25;
/** Stop widening once this many doctors have at least one free slot. */
const MIN_DOCTORS_WITH_SLOTS = 5;

/**
 * The `NotificationType` DB enum has no emergency_* members — writing one
 * makes Prisma throw a validation error, so the notify() call inside create /
 * accept / reject 500'd the whole emergency flow. Emergency traffic reuses the
 * closest valid member instead; the message body still says "Emergency".
 */
const EMERGENCY_NOTIFICATION_TYPES = {
  requested: "appointment_request",
  accepted: "appointment_confirmed",
  rejected: "appointment_rejected",
} as const;

export type EmergencyNotificationKind = keyof typeof EMERGENCY_NOTIFICATION_TYPES;

export const emergencyNotificationType = (
  kind: EmergencyNotificationKind
): NotificationType => EMERGENCY_NOTIFICATION_TYPES[kind];

/** "09:00:00" → "09:00" for notification copy. */
const formatClock = (time: string) => time.slice(0, 5);


/**
 * Distance maths lives in `lib/geo.ts` (`haversineKm`) — one implementation
 * shared with the doctor directory so "nearby" means the same thing
 * everywhere. The old local `calculateDistance` here was never called: every
 * nearby doctor came back with `distance: 0`.
 */

export async function isDoctorAvailableAt(
  doctorId: number,
  weekday: number,
  date: string,
  seconds: number
): Promise<boolean> {
  const windows = await doctors.listActiveWindowsForWeekday(doctorId, weekday);
  const inWindow = windows.some((window) => {
    const windowStart = timeToSeconds(window.start_time);
    const windowEnd = timeToSeconds(window.end_time);
    if (seconds < windowStart || seconds >= windowEnd) return false;
    return !window.breaks.some(
      (item) => seconds >= timeToSeconds(item.start_time) && seconds < timeToSeconds(item.end_time)
    );
  });
  if (!inWindow) return false;

  const exceptions = await doctors.listExceptionsForDate(doctorId, date);
  if (exceptions.some((item) => item.start_time === null)) return false;
  return !exceptions.some(
    (item) =>
      item.start_time !== null &&
      item.end_time !== null &&
      seconds >= timeToSeconds(item.start_time) &&
      seconds < timeToSeconds(item.end_time)
  );
}

async function pickEmergencyDoctor(
  origin: { latitude: number; longitude: number },
  date: string,
  weekday: number,
  seconds: number,
  specialtyId?: number
): Promise<{ doctor: NearbyDoctorRow; distance: number } | null> {
  const candidates = await findNearbyDoctors(
    origin.latitude,
    origin.longitude,
    Number.POSITIVE_INFINITY,
    specialtyId
  );

  for (const candidate of candidates.slice(0, MAX_SLOT_CANDIDATES)) {
    if (await isDoctorAvailableAt(candidate.doctor.id, weekday, date, seconds)) return candidate;
  }
  if (candidates.length > 0) return candidates[0];

  const widened = await findNearbyDoctors(
    origin.latitude,
    origin.longitude,
    Number.POSITIVE_INFINITY,
    specialtyId,
    true
  );
  return widened[0] ?? null;
}

/**
 * GET /api/emergency/available-slots/ — every free slot that day across the
 * doctors nearest the patient, merged into one grid. Slots identical to the
 * minute collapse onto their nearest provider, so the patient picks a time and
 * auto-dispatch decides who takes it.
 */
export async function listAvailableEmergencySlots(
  latitude: number,
  longitude: number,
  date: string,
  specialtyId?: number
) {
  const { availableSlots } = await import("./schedule.service");
  const { nearestAreaName } = await import("@/lib/zanzibar");

  const candidates = await findNearbyDoctors(
    latitude,
    longitude,
    Number.POSITIVE_INFINITY,
    specialtyId
  );

  const merged = new Map<
    string,
    { start_time: string; end_time: string; distance_km: number; area: string | null }
  >();
  let withSlots = 0;

  for (const { doctor, distance } of candidates.slice(0, MAX_SLOT_CANDIDATES)) {
    const slots = await availableSlots(doctor.id, true, date);
    if (slots.length === 0) continue;
    withSlots += 1;

    const area = nearestAreaName({ latitude: doctor.latitude, longitude: doctor.longitude });
    for (const slot of slots) {
      const key = `${slot.start_time}|${slot.end_time}`;
      const current = merged.get(key);
      if (!current || current.distance_km > distance) {
        merged.set(key, {
          start_time: slot.start_time,
          end_time: slot.end_time,
          distance_km: distance,
          area,
        });
      }
    }

    if (withSlots >= MIN_DOCTORS_WITH_SLOTS) break;
  }

  return [...merged.values()].sort((a, b) =>
    a.start_time === b.start_time
      ? a.distance_km - b.distance_km
      : a.start_time < b.start_time
        ? -1
        : 1
  );
}

/** POST /api/emergency/ — patient books an emergency appointment. */
export async function createEmergencyAppointment(req: Request, user: AuthUser, body: unknown) {
  const input = parse(emergencyAppointmentCreateSchema, body);

  const date = input.appointment_date ?? todayIso();
  const start = input.start_time
    ? normalizeTime(input.start_time)
    : secondsToTime(Math.floor(Date.now() / 1000) % 86400);
  const end = input.end_time
    ? normalizeTime(input.end_time)
    : secondsToTime(Math.min(timeToSeconds(start) + EMERGENCY_SLOT_SECONDS, 86400));

  const origin = {
    latitude: input.emergency_latitude,
    longitude: input.emergency_longitude,
  };

  // Patient-level guard first: if they already hold a pending/accepted
  // emergency, say so (409) instead of "slot not available" — the slot is
  // often taken by their own active emergency.
  const existingEmergency = await appointments.findPatientEmergencyAppointment(user.id);
  if (existingEmergency) {
    throw conflict("You already have a pending emergency appointment.", {
      non_field_errors: ["You can only have one pending emergency appointment at a time."],
    });
  }

  if (input.hospital !== undefined && input.hospital !== null) {
    const { findHospital } = await import("@/repositories/content.repo");
    if (!(await findHospital(input.hospital))) {
      throw new ValidationError({ hospital: [`Invalid pk "${input.hospital}" - object does not exist.`] });
    }
  }

  let target: { id: number; user_id: number; name: string };
  let distance: number | null = null;

  if (input.doctor !== undefined && input.doctor !== null) {
    // Explicit choice (legacy clients) — validate that doctor directly.
    const selected = await doctors.findDoctorById(Number(input.doctor)).catch(() => null);
    if (!selected) {
      throw badRequest("The selected doctor was not found.", {
        doctor: ["The selected doctor was not found."],
      });
    }
    // The patient's own position travels with this request as a live GPS fix
    // (the schema requires it), but the doctor's practice coordinates must be on
    // file or there is no destination to route the emergency to.
    const { assertDoctorLocation } = await import("@/services/location.service");
    await assertDoctorLocation(selected.id);

    target = {
      id: selected.id,
      user_id: selected.user_id,
      name: `${selected.user.first_name} ${selected.user.last_name}`.trim(),
    };
  } else {
    // No doctor chosen — prefer one who is available right now; if none is,
    // fall back to the nearest doctor regardless of their availability window
    // so the emergency is always dispatched and notified.
    const picked = await pickEmergencyDoctor(
      origin,
      date,
      isoWeekday(date),
      timeToSeconds(start)
    );
    if (!picked) {
      throw badRequest("No doctor could be reached for this emergency.", {
        doctor: ["No doctor could be reached for this emergency."],
      });
    }
    target = {
      id: picked.doctor.id,
      user_id: picked.doctor.user_id,
      name: `${picked.doctor.user.first_name} ${picked.doctor.user.last_name}`.trim(),
    };
    distance = picked.distance;
  }

  const appointment = await appointments.createEmergencyAppointment({
    patient_id: user.id,
    doctor_id: target.id,
    hospital_id: input.hospital ?? null,
    appointment_date: date,
    start_time: start,
    end_time: end,
    reason: input.reason ?? "",
    notes: input.notes ?? "",
    appointment_type: "EMERGENCY",
    // Auto-dispatch books straight into `accepted`: there is no accept step.
    status: input.doctor !== undefined && input.doctor !== null ? "pending" : "accepted",
    emergency_reason: input.emergency_reason,
    emergency_description: input.emergency_description ?? "",
    emergency_latitude: input.emergency_latitude,
    emergency_longitude: input.emergency_longitude,
    emergency_location_accuracy: input.emergency_location_accuracy ?? null,
    emergency_requested_at: new Date(),
  });

  // The doctor is told the emergency is theirs; the patient is told who got it.
  await notify(
    target.user_id,
    emergencyNotificationType("requested"),
    `Emergency ${date} ${formatClock(start)}–${formatClock(end)} assigned to you: ${input.emergency_reason.replace("_", " ")}.`,
    appointment.id
  );
  if (appointment.status === "accepted") {
    await notify(
      user.id,
      emergencyNotificationType("accepted"),
      `Your emergency has been sent to Dr. ${target.name}${distance === null ? "" : ` (${distance} km away)`}.`,
      appointment.id
    );
  }

  // Broadcast realtime event
  broadcastAppointmentEvent(appointment, "appointment.emergency_created", [
    appointment.patient_id,
    target.user_id,
  ]);

  return appointment;
}


/**
 * Find nearby doctors for emergency appointment. `radiusKm` is NOT clamped
 * here — `Number.POSITIVE_INFINITY` is the "keep scanning until someone
 * matches" signal used by auto-dispatch; the HTTP route clamps its query
 * string to MAX_EMERGENCY_RADIUS_KM instead.
 */
export async function findNearbyDoctors(
  latitude: number,
  longitude: number,
  radiusKm: number = EMERGENCY_RADIUS_KM,
  specialtyId?: number,
  includeUnavailable: boolean = false
): Promise<Array<{ doctor: NearbyDoctorRow; distance: number }>> {
  const { prisma } = await import("@/lib/db");
  const origin = { latitude, longitude };

  const doctorsList = await prisma.doctor.findMany({
    where: {
      ...(includeUnavailable ? {} : { is_available: true }),
      user: {
        is_active: true,
      },
      // Doctors who never set a real location cannot be measured, so they are
      // excluded here rather than being padded in with a fake `distance: 0`.
      latitude: { not: null },
      longitude: { not: null },
      ...(specialtyId ? { specialties: { some: { specialty_id: specialtyId } } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          profile_image_id: true,
        },
      },
      specialties: { include: { specialty: true } },
      hospitals: { include: { hospital: true } },
    },
  });

  const nearby: Array<{ doctor: typeof doctorsList[number]; distance: number }> = [];
  for (const doc of doctorsList) {
    if (!hasLocation(doc)) continue;
    const km = haversineKm(origin, doc);
    if (km === null || km > radiusKm) continue;
    nearby.push({ doctor: doc, distance: Math.round(km * 100) / 100 });
  }
  nearby.sort((a, b) => a.distance - b.distance);

  return nearby;
}

/** Doctor accepts emergency appointment. */
export async function acceptEmergencyAppointment(req: Request, user: AuthUser, id: number) {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (appointment.appointment_type !== "EMERGENCY") {
    throw badRequest("This is not an emergency appointment.");
  }

  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = user.role === "doctor" && ownDoctor === appointment.doctor_id;
  const isAdmin = user.role === "admin" || user.is_superuser;

  if (!isOwnerDoctor && !isAdmin) {
    throw forbidden("Only the assigned doctor can accept this emergency appointment.");
  }

  if (appointment.status !== "pending") {
    throw conflict("This emergency appointment is no longer pending.");
  }

  const updated = await appointments.updateAppointment(id, { status: "accepted" });

  await notify(
    appointment.patient_id,
    emergencyNotificationType("accepted"),
    `Your emergency appointment has been accepted by Dr. ${updated.doctor?.user?.first_name} ${updated.doctor?.user?.last_name}.`,
    updated.id
  );

  // Realtime recipients are USER ids — updated.doctor_id is the profile row id.
  broadcastAppointmentEvent(updated, "appointment.emergency_accepted", [
    updated.patient_id,
    updated.doctor.user_id,
  ]);

  return { appointment: updated, message: "Emergency appointment accepted." };
}

/** Doctor rejects emergency appointment. */
export async function rejectEmergencyAppointment(req: Request, user: AuthUser, id: number, body: unknown) {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (appointment.appointment_type !== "EMERGENCY") {
    throw badRequest("This is not an emergency appointment.");
  }

  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = user.role === "doctor" && ownDoctor === appointment.doctor_id;
  const isAdmin = user.role === "admin" || user.is_superuser;

  if (!isOwnerDoctor && !isAdmin) {
    throw forbidden("Only the assigned doctor can reject this emergency appointment.");
  }

  // Auto-dispatched emergencies land on `accepted`, so rejecting has to work
  // there too — the patient still needs a way out if the doctor cannot attend.
  if (appointment.status !== "pending" && appointment.status !== "accepted") {
    throw conflict("This emergency appointment is no longer open.");
  }

  const { appointmentActionSchema } = await import("@/validators/misc");
  const rawBody = (body ?? {}) as Record<string, unknown>;
  const payload = parse(appointmentActionSchema, { ...rawBody, status: "rejected" });

  const updated = await appointments.updateAppointment(id, {
    status: "rejected",
    cancel_reason: payload.cancel_reason ?? "Doctor rejected the emergency appointment",
  });

  await notify(
    appointment.patient_id,
    emergencyNotificationType("rejected"),
    `Your emergency appointment was rejected. Reason: ${payload.cancel_reason ?? "No reason provided"}`,
    updated.id
  );

  // Realtime recipients are USER ids — updated.doctor_id is the profile row id.
  broadcastAppointmentEvent(updated, "appointment.emergency_rejected", [
    updated.patient_id,
    updated.doctor.user_id,
  ]);

  return { appointment: updated, message: "Emergency appointment rejected." };
}

/** Get patient's active emergency appointment. */
export async function getPatientEmergencyAppointment(user: AuthUser) {
  return appointments.findPatientEmergencyAppointment(user.id);
}

/** Get doctor's live (pending + auto-assigned) emergency appointments. */
export async function getDoctorEmergencyAppointments(user: AuthUser) {
  const ownDoctor = await ownDoctorId(user);
  if (ownDoctor === -1) return [];

  const { prisma } = await import("@/lib/db");
  return prisma.appointment.findMany({
    where: {
      doctor_id: ownDoctor,
      appointment_type: "EMERGENCY",
      status: { in: ["pending", "accepted"] },
    },
    include: {
      patient: true,
      doctor: { include: { user: true } },
      hospital: true,
    },
    orderBy: { emergency_requested_at: "asc" },
  });
}

/**
 * GET /api/emergency/ — role-scoped emergency queue (the UI's sidebar screen
 * loads exactly this):
 *   patient → their own emergency appointments, newest first (0..1 active)
 *   doctor  → live requests assigned to them (pending or auto-accepted)
 *   admin   → every live emergency on the platform
 */
export async function listEmergencies(user: AuthUser) {
  const { prisma } = await import("@/lib/db");
  const include = { patient: true, doctor: { include: { user: true } } } as const;

  if (user.role === "admin" || user.is_superuser) {
    return prisma.appointment.findMany({
      where: { appointment_type: "EMERGENCY", status: { in: ["pending", "accepted"] } },
      include,
      orderBy: { emergency_requested_at: "asc" },
    });
  }
  if (user.role === "doctor") return getDoctorEmergencyAppointments(user);
  return prisma.appointment.findMany({
    where: { patient_id: user.id, appointment_type: "EMERGENCY" },
    include,
    orderBy: { created_at: "desc" },
    take: 20,
  });
}

async function ownDoctorId(user: AuthUser): Promise<number> {
  const doctor = await doctors.findDoctorByUserId(user.id);
  return doctor ? doctor.id : -1;
}