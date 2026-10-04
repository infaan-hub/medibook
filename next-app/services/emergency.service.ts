/**
 * Emergency appointment service — emergency booking, nearby doctor search, and
 * the emergency lifecycle (accept → in progress → done) including the
 * re-request rules:
 *
 *   PENDING / ACCEPTED → blocked for 30 minutes from the request, then the
 *                        patient may file again (the old row is stamped
 *                        EXPIRED, never deleted or rewritten to `done`).
 *   IN_PROGRESS        → the doctor arrived; only DONE releases the patient,
 *                        no timeout applies.
 *   DONE / REJECTED / CANCELLED / EXPIRED → the patient may file again.
 *
 * Every eligibility decision is made HERE, on the server, from database
 * timestamps — the client countdown is display-only.
 */
import { Prisma } from "@prisma/client";
import { conflict, notFound, badRequest, forbidden, ValidationError } from "@/lib/errors";
import { isoWeekday, normalizeTime, secondsToTime, timeToSeconds, todayIso } from "@/lib/dates";
import { appointmentDto, emergencyAppointmentDto } from "@/lib/serializers";
import { emergencyAppointmentCreateSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as appointments from "@/repositories/appointments.repo";
import {
  EMERGENCY_ACTIVE_STATUSES,
  type AppointmentDb,
} from "@/repositories/appointments.repo";
import * as doctors from "@/repositories/doctors.repo";
import { broadcastAppointmentEvent, notify } from "@/lib/notify";
import { hasLocation, haversineKm } from "@/lib/geo";
import type { AuthUser } from "@/lib/auth";
import type { Appointment, AppointmentStatus, Doctor, NotificationType, User } from "@prisma/client";

type AppointmentWithPatient = Appointment & { patient: User };
/** An emergency row with the relations every action/serializer needs. */
export type EmergencyRow = Appointment & { patient: User; doctor: Doctor & { user: User } };

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

/**
 * The re-request window (§4): this long after the patient filed the request,
 * with the doctor still not at IN_PROGRESS, the patient is eligible again.
 * Purely a server-side timestamp comparison — see `EMERGENCY_TIMEOUT_CUTOFF`.
 */
export const EMERGENCY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Advisory-lock namespace for `pg_advisory_xact_lock(ns, patient_id)` during
 * emergency creation: one patient = one lock, so simultaneous requests from
 * two tabs queue up instead of both reading "no active emergency". Arbitrary
 * but fixed constant; the partial unique index `uniq_active_patient_emergency`
 * remains the database-level backstop.
 */
const EMERGENCY_CREATE_LOCK_NAMESPACE = 87213401;

/** How many nearby doctors we inspect before giving up on a date/slot. */
const MAX_SLOT_CANDIDATES = 25;
/** Stop widening once this many doctors have at least one free slot. */
const MIN_DOCTORS_WITH_SLOTS = 5;

/**
 * The `NotificationType` DB enum has no emergency_* members — writing one
 * makes Prisma throw a validation error, so the notify() call inside create /
 * accept / reject 500'd the whole emergency flow. Emergency traffic reuses the
 * closest valid member instead; the message body (and, for the lifecycle
 * steps, an explicit title) still says "Emergency".
 */
const EMERGENCY_NOTIFICATION_TYPES = {
  requested: "appointment_request",
  accepted: "appointment_confirmed",
  inProgress: "appointment_confirmed",
  completed: "system",
  rejected: "appointment_rejected",
} as const;

export type EmergencyNotificationKind = keyof typeof EMERGENCY_NOTIFICATION_TYPES;

export const emergencyNotificationType = (
  kind: EmergencyNotificationKind
): NotificationType => EMERGENCY_NOTIFICATION_TYPES[kind];

/** "09:00:00" → "09:00" for notification copy. */
const formatClock = (time: string) => time.slice(0, 5);

/* ==========================================================================
   Eligibility — the single source of truth for "may this patient request
   another emergency?" (§7). Everything reads server timestamps only.
   ========================================================================== */

/** Why the patient is blocked right now. */
export type EmergencyBlockReason = "EMERGENCY_ACTIVE" | "EMERGENCY_IN_PROGRESS";

export interface EmergencyEligibility {
  canCreateEmergency: boolean;
  /** Machine-readable blocker; null when the patient is free to request. */
  reason: EmergencyBlockReason | null;
  /** ISO instant the patient becomes eligible again (null = only `done` ends it). */
  availableAt: string | null;
  /** Status of the emergency causing the block (null when none). */
  status: AppointmentStatus | null;
  activeEmergencyId: number | null;
  /** Human copy the UI can show verbatim. */
  message: string;
}

/** The bits of the active emergency eligibility depends on (pure data). */
export interface ActiveEmergencyFacts {
  id: number;
  status: AppointmentStatus;
  /** COALESCE(emergency_requested_at, created_at) — always server time. */
  requestedAt: Date;
}

const ELIGIBLE: EmergencyEligibility = {
  canCreateEmergency: true,
  reason: null,
  availableAt: null,
  status: null,
  activeEmergencyId: null,
  message: "",
};

/**
 * Pure decision table (§33) — kept side-effect free so the 30-minute boundary
 * is unit-testable without a database or a real clock:
 *
 *   none / done / rejected / cancelled / expired → ALLOW
 *   in_progress                                  → BLOCK forever (until done)
 *   pending / accepted                           → BLOCK until requested+30min
 */
export function evaluateEmergencyEligibility(
  active: ActiveEmergencyFacts | null,
  now: Date
): EmergencyEligibility {
  if (!active) return ELIGIBLE;

  const base = { status: active.status, activeEmergencyId: active.id };

  if (active.status === "in_progress") {
    return {
      ...base,
      canCreateEmergency: false,
      reason: "EMERGENCY_IN_PROGRESS",
      availableAt: null,
      message: "Your emergency appointment is currently in progress.",
    };
  }

  // done / rejected / cancelled / expired — the request is over, the patient
  // is free straight away regardless of how long ago it was filed (§33).
  if (active.status !== "pending" && active.status !== "accepted") {
    return { ...ELIGIBLE, status: active.status, activeEmergencyId: active.id };
  }

  const availableAt = new Date(active.requestedAt.getTime() + EMERGENCY_TIMEOUT_MS);
  if (now.getTime() >= availableAt.getTime()) {
    // Window closed before the doctor arrived — the caller will stamp the old
    // row EXPIRED, so this is a real ALLOW, not a stale read.
    return { ...ELIGIBLE, status: active.status, activeEmergencyId: active.id };
  }

  return {
    ...base,
    canCreateEmergency: false,
    reason: "EMERGENCY_ACTIVE",
    availableAt: availableAt.toISOString(),
    message:
      "You already have an active emergency request. You can request another after 30 minutes if the doctor has not started the appointment.",
  };
}

/**
 * Server-authoritative eligibility for one patient (§7):
 * expire whatever timed out, then evaluate the remaining active emergency.
 *
 * `db` lets the create path run the exact same logic inside its transaction;
 * `now` exists for tests only — production callers always use server time.
 */
export async function getEmergencyEligibility(
  patientId: number,
  options: { db?: AppointmentDb; now?: Date } = {}
): Promise<EmergencyEligibility> {
  const db = options.db ?? (await import("@/lib/db")).prisma;
  const now = options.now ?? new Date();

  const cutoff = new Date(now.getTime() - EMERGENCY_TIMEOUT_MS);
  await appointments.expireTimedOutEmergencies(cutoff, patientId, db);

  const active = await appointments.findPatientEmergencyAppointment(patientId, db);
  return evaluateEmergencyEligibility(active ? activeEmergencyFacts(active) : null, now);
}

/** Row → the minimal facts the pure evaluator needs. */
function activeEmergencyFacts(row: Appointment): ActiveEmergencyFacts {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.emergency_requested_at ?? row.created_at,
  };
}

/** 409 for a blocked create, carrying the structured eligibility in `data`. */
function emergencyBlockedConflict(eligibility: EmergencyEligibility) {
  const message =
    eligibility.message || "You already have an active emergency request.";
  return conflict(
    message,
    { non_field_errors: [message] },
    {
      canCreateEmergency: false,
      reason: eligibility.reason ?? "EMERGENCY_ACTIVE",
      availableAt: eligibility.availableAt,
      status: eligibility.status,
      activeEmergencyId: eligibility.activeEmergencyId,
    }
  );
}

/* ==========================================================================
   Status transitions — only the assigned doctor (or an admin) may move an
   emergency forward, and only along the legal path (§22).
   ========================================================================== */

export const EMERGENCY_STATUS_TRANSITIONS: Record<string, readonly AppointmentStatus[]> = {
  pending: ["accepted", "rejected", "cancelled", "expired"],
  accepted: ["in_progress", "rejected", "cancelled", "expired"],
  // The doctor is with the patient: nothing but finishing releases it.
  in_progress: ["done"],
  done: [],
  cancelled: [],
  rejected: [],
  expired: [],
};

/** Pure: may `from` move to `to`? (shared with appointment.service's runAction.) */
export const canEmergencyTransition = (from: string, to: string): boolean =>
  (EMERGENCY_STATUS_TRANSITIONS[from] ?? []).includes(to as AppointmentStatus);

function assertEmergencyTransition(from: string, to: string): void {
  if (!canEmergencyTransition(from, to)) {
    throw conflict(`Cannot change emergency status from "${from}" to "${to}".`, {
      status: [`Invalid transition ${from} → ${to}.`],
    });
  }
}

/**
 * Role + ownership gate shared by every doctor-side emergency action: the
 * assigned doctor or an admin, never the patient and never another doctor (§23).
 */
async function assertEmergencyActor(user: AuthUser, doctorId: number, verb: string): Promise<void> {
  const ownDoctor = await ownDoctorId(user);
  const isOwnerDoctor = user.role === "doctor" && ownDoctor === doctorId;
  const isAdmin = user.role === "admin" || user.is_superuser;
  if (!isOwnerDoctor && !isAdmin) {
    throw forbidden(`Only the assigned doctor can ${verb} this emergency appointment.`);
  }
}

/** The doctor's display name from a row that includes `doctor.user`. */
function doctorLabel(appointment: Appointment & { doctor?: { user?: Partial<User> } }): string {
  const user = appointment.doctor?.user;
  const name = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  return name ? `Dr. ${name}` : "your doctor";
}


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

export type EmergencyTarget = {
  id: number;
  user_id: number;
  name: string;
  distance: number | null;
};

export async function pickEmergencyDoctor(
  origin: { latitude: number; longitude: number },
  date: string,
  weekday: number,
  seconds: number,
  specialtyId?: number
): Promise<EmergencyTarget | null> {
  const asTarget = (candidate: { doctor: NearbyDoctorRow; distance: number }): EmergencyTarget => ({
    id: candidate.doctor.id,
    user_id: candidate.doctor.user_id,
    name: `${candidate.doctor.user.first_name} ${candidate.doctor.user.last_name}`.trim(),
    distance: candidate.distance,
  });

  const candidates = await findNearbyDoctors(
    origin.latitude,
    origin.longitude,
    Number.POSITIVE_INFINITY,
    specialtyId
  );

  for (const candidate of candidates.slice(0, MAX_SLOT_CANDIDATES)) {
    if (await isDoctorAvailableAt(candidate.doctor.id, weekday, date, seconds)) {
      return asTarget(candidate);
    }
  }
  if (candidates.length > 0) return asTarget(candidates[0]);

  const widened = await findNearbyDoctors(
    origin.latitude,
    origin.longitude,
    Number.POSITIVE_INFINITY,
    specialtyId,
    true
  );
  if (widened.length > 0) return asTarget(widened[0]);

  const { prisma } = await import("@/lib/db");
  const anyone = await prisma.doctor.findFirst({
    where: { user: { is_active: true } },
    select: {
      id: true,
      user_id: true,
      user: { select: { first_name: true, last_name: true } },
    },
  });
  return anyone
    ? {
        id: anyone.id,
        user_id: anyone.user_id,
        name: `${anyone.user.first_name} ${anyone.user.last_name}`.trim(),
        distance: null,
      }
    : null;
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

  // Patient-level guard first: if they already hold an active emergency, say
  // so (409 + structured eligibility) instead of "slot not available" — the
  // slot is often taken by their own emergency. This is a fast fail only; the
  // AUTHORITATIVE check runs again inside the create transaction below.
  const eligibility = await getEmergencyEligibility(user.id);
  if (!eligibility.canCreateEmergency) throw emergencyBlockedConflict(eligibility);

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
      id: picked.id,
      user_id: picked.user_id,
      name: picked.name,
    };
    distance = picked.distance;
  }

  // Auto-dispatch books straight into `accepted` (there is no accept step);
  // an explicitly chosen doctor stays `pending` until they accept.
  const autoDispatched = input.doctor === undefined || input.doctor === null;
  const requestedAt = new Date();
  const { prisma } = await import("@/lib/db");

  let appointment: EmergencyRow;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      // One patient = one lock. Two simultaneous requests (double tap, two
      // tabs, network retry) queue here instead of both reading "no active
      // emergency" and both inserting (§8).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EMERGENCY_CREATE_LOCK_NAMESPACE}::int, ${user.id}::int)`;

      // Authoritative eligibility re-check with the transaction handle: the
      // window may have closed while dispatch ran, or a concurrent request may
      // have won. Server timestamps only — never anything the client sent.
      const fresh = await getEmergencyEligibility(user.id, { db: tx, now: requestedAt });
      if (!fresh.canCreateEmergency) throw emergencyBlockedConflict(fresh);

      return appointments.createEmergencyAppointment(
        {
          patient_id: user.id,
          doctor_id: target.id,
          hospital_id: input.hospital ?? null,
          appointment_date: date,
          start_time: start,
          end_time: end,
          reason: input.reason ?? "",
          notes: input.notes ?? "",
          appointment_type: "EMERGENCY",
          status: autoDispatched ? "accepted" : "pending",
          emergency_reason: input.emergency_reason,
          emergency_description: input.emergency_description ?? "",
          emergency_latitude: input.emergency_latitude,
          emergency_longitude: input.emergency_longitude,
          emergency_location_accuracy: input.emergency_location_accuracy ?? null,
          emergency_requested_at: requestedAt,
          emergency_accepted_at: autoDispatched ? requestedAt : null,
        },
        tx
      );
    });
  } catch (error) {
    // Backstop: `uniq_active_patient_emergency` rejected the insert because a
    // request that did not take the advisory lock still got there first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw emergencyBlockedConflict(await getEmergencyEligibility(user.id));
    }
    throw error;
  }

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

/** Load one emergency row, or fail with the usual 404 / 400. */
async function loadEmergency(id: number): Promise<EmergencyRow> {
  const appointment = await appointments.findAppointmentById(id);
  if (!appointment) throw notFound();
  if (appointment.appointment_type !== "EMERGENCY") {
    throw badRequest("This is not an emergency appointment.");
  }
  return appointment;
}

/** Doctor accepts emergency appointment. */
export async function acceptEmergencyAppointment(req: Request, user: AuthUser, id: number) {
  const appointment = await loadEmergency(id);
  await assertEmergencyActor(user, appointment.doctor_id, "accept");

  if (!canEmergencyTransition(appointment.status, "accepted")) {
    throw conflict("This emergency appointment is no longer pending.");
  }

  const updated = await appointments.updateAppointment(id, {
    status: "accepted",
    emergency_accepted_at: new Date(),
  });

  await notify(
    appointment.patient_id,
    emergencyNotificationType("accepted"),
    `Your emergency appointment has been accepted by ${doctorLabel(updated)}.`,
    updated.id
  );

  // Realtime recipients are USER ids — updated.doctor_id is the profile row id.
  broadcastAppointmentEvent(updated, "appointment.emergency_accepted", [
    updated.patient_id,
    updated.doctor.user_id,
  ]);

  return { appointment: updated, message: "Emergency appointment accepted." };
}

/**
 * Doctor taps "Emergency In Progress" — they have physically arrived and are
 * seeing the patient (§9). From here the 30-minute rule no longer applies: the
 * patient stays blocked until this emergency reaches `done`.
 */
export async function startEmergencyInProgress(req: Request, user: AuthUser, id: number) {
  const appointment = await loadEmergency(id);
  await assertEmergencyActor(user, appointment.doctor_id, "start");

  if (appointment.status === "pending") {
    throw conflict("Accept the emergency appointment before marking it in progress.");
  }
  if (!canEmergencyTransition(appointment.status, "in_progress")) {
    throw conflict("This emergency appointment is no longer active.");
  }

  const updated = await appointments.updateAppointment(id, {
    status: "in_progress",
    emergency_in_progress_at: new Date(),
  });

  await notify(
    updated.patient_id,
    emergencyNotificationType("inProgress"),
    `Your emergency appointment with ${doctorLabel(updated)} is now in progress.`,
    updated.id,
    "Emergency in progress"
  );

  broadcastAppointmentEvent(updated, "appointment.emergency_in_progress", [
    updated.patient_id,
    updated.doctor.user_id,
  ]);

  return { appointment: updated, message: "Emergency appointment in progress." };
}

/**
 * Doctor taps "Done" — treatment finished. This is the ONLY state that ends an
 * IN_PROGRESS emergency, and it releases the patient immediately (§12-14).
 */
export async function completeEmergencyAppointment(req: Request, user: AuthUser, id: number) {
  const appointment = await loadEmergency(id);
  await assertEmergencyActor(user, appointment.doctor_id, "complete");

  if (appointment.status === "accepted") {
    throw conflict("Mark the emergency in progress when you reach the patient, then finish it.");
  }
  if (!canEmergencyTransition(appointment.status, "done")) {
    throw conflict("This emergency appointment is no longer in progress.");
  }

  const updated = await appointments.updateAppointment(id, {
    status: "done",
    emergency_completed_at: new Date(),
  });

  await notify(
    updated.patient_id,
    emergencyNotificationType("completed"),
    `Your emergency appointment with ${doctorLabel(updated)} has been completed.`,
    updated.id,
    "Emergency completed"
  );

  broadcastAppointmentEvent(updated, "appointment.emergency_completed", [
    updated.patient_id,
    updated.doctor.user_id,
  ]);

  return { appointment: updated, message: "Emergency appointment completed." };
}

/** Doctor rejects emergency appointment. */
export async function rejectEmergencyAppointment(req: Request, user: AuthUser, id: number, body: unknown) {
  const appointment = await loadEmergency(id);
  await assertEmergencyActor(user, appointment.doctor_id, "reject");

  // Auto-dispatched emergencies land on `accepted`, so rejecting has to work
  // there too — the patient still needs a way out if the doctor cannot attend.
  if (!canEmergencyTransition(appointment.status, "rejected")) {
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

/**
 * Run the 30-minute sweep before anyone reads a queue: a request whose window
 * closed without the doctor reaching IN_PROGRESS drops out of the live list
 * (the row itself is kept as history). Server-side, so a closed browser or a
 * stale tab never keeps a dead request alive (§18).
 */
async function sweepTimedOutEmergencies(): Promise<void> {
  const cutoff = new Date(Date.now() - EMERGENCY_TIMEOUT_MS);
  await appointments.expireTimedOutEmergencies(cutoff);
}

/** Get doctor's live (pending + accepted + in-progress) emergency appointments. */
export async function getDoctorEmergencyAppointments(user: AuthUser) {
  const ownDoctor = await ownDoctorId(user);
  if (ownDoctor === -1) return [];

  await sweepTimedOutEmergencies();

  const { prisma } = await import("@/lib/db");
  return prisma.appointment.findMany({
    where: {
      doctor_id: ownDoctor,
      appointment_type: "EMERGENCY",
      status: { in: [...EMERGENCY_ACTIVE_STATUSES] },
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
 *   doctor  → live requests assigned to them (pending / accepted / in progress)
 *   admin   → every live emergency on the platform
 */
export async function listEmergencies(user: AuthUser) {
  const { prisma } = await import("@/lib/db");
  const include = { patient: true, doctor: { include: { user: true } } } as const;

  if (user.role !== "doctor") await sweepTimedOutEmergencies();

  if (user.role === "admin" || user.is_superuser) {
    return prisma.appointment.findMany({
      where: { appointment_type: "EMERGENCY", status: { in: [...EMERGENCY_ACTIVE_STATUSES] } },
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