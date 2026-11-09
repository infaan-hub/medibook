/**
 * Psychological therapy (psychotherapy) service.
 *
 * Lifecycle:
 *   request: pending → assigned → accepted → in_progress → follow_up → completed
 *   session: scheduled → in_progress → completed
 *
 * Clinical data (confidential notes + linked medication treatment) is only ever
 * serialized for the psychologist assigned to the request.
 */
import { prisma } from "@/lib/db";
import { badRequest, notFound, conflict, forbidden } from "@/lib/errors";
import { notify, broadcastPlatformDataUpdated } from "@/lib/notify";
import type { AuthUser } from "@/lib/auth";
import * as doctorsRepo from "@/repositories/doctors.repo";
import { normalizeTime, timeToSeconds, secondsToTime, todayIso } from "@/lib/dates";
import { treatmentDto } from "@/lib/serializers";
import { Prisma } from "@prisma/client";

const ACTIVE_STATUSES = ["pending", "assigned", "accepted", "in_progress", "follow_up"];

const APPROACHES = ["CBT", "DBT", "ACT", "supportive", "psychodynamic"];
const FREQUENCIES = ["weekly", "biweekly", "twice_weekly"];
const SESSION_MODES = ["in_person", "online"];
const URGENCIES = ["routine", "soon", "urgent"];
const GENDERS = ["male", "female", "any"];
const LANGUAGES = ["english", "swahili", "spanish", "french", "german"];

function ownDoctorId(actor: AuthUser): Promise<number | null> {
  if (actor.role !== "doctor") return Promise.resolve(null);
  return doctorsRepo.findDoctorByUserId(actor.id).then((d) => d?.id ?? null);
}

function includeFull() {
  return {
    patient: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, profile_image_id: true } },
    doctor: { include: { user: { select: { id: true, first_name: true, last_name: true, email: true, profile_image_id: true } } } },
    sessions: {
      include: {
        medication_record: true,
        treatment: { include: { prescriptions: { include: { items: true } }, appointment: { select: { status: true } } } },
      },
      orderBy: { session_number: "asc" as const },
    },
  };
}

function canSeeClinical(actor: AuthUser, req: any, doctorId: number | null) {
  // Psychotherapy notes and medication details are visible only to the
  // psychologist assigned to this case, including after the case is closed.
  return actor.role === "doctor" && req.doctor_id !== null && req.doctor_id === doctorId;
}

function serializeRequest(req: any, actor: AuthUser, doctorId: number | null) {
  const clinical = canSeeClinical(actor, req, doctorId);
  return {
    id: req.id,
    patient_id: req.patient_id,
    patient: req.patient,
    doctor_id: req.doctor_id,
    doctor: req.doctor
      ? { id: req.doctor.id, user: req.doctor.user }
      : null,
    session_mode: req.session_mode,
    preferred_start_date: req.preferred_start_date,
    urgency: req.urgency,
    confidentiality_accepted: req.confidentiality_accepted,
    gender_preference: req.gender_preference,
    language_preference: req.language_preference,
    notes: req.notes,
    status: req.status,
    plan_goals: req.plan_goals,
    plan_frequency: req.plan_frequency,
    plan_session_duration: req.plan_session_duration,
    plan_total_sessions: req.plan_total_sessions,
    plan_start_date: req.plan_start_date,
    plan_start_time: req.plan_start_time,
    assigned_at: req.assigned_at,
    accepted_at: req.accepted_at,
    started_at: req.started_at,
    completed_at: req.completed_at,
    created_at: req.created_at,
    updated_at: req.updated_at,
    sessions: (req.sessions || []).map((s: any) => {
      const base: any = {
        id: s.id,
        psychotherapy_request_id: s.psychotherapy_request_id,
        session_number: s.session_number,
        scheduled_date: s.scheduled_date,
        start_time: s.start_time,
        end_time: s.end_time,
        duration_minutes: s.duration_minutes,
        status: s.status,
        started_at: s.started_at,
        completed_at: s.completed_at,
        created_at: s.created_at,
        updated_at: s.updated_at,
      };
      if (clinical) {
        base.confidential_notes = s.confidential_notes;
        base.treatment_id = s.treatment_id;
        base.treatment = s.treatment ? treatmentDto(s.treatment) : null;
        base.medication_record = s.medication_record ?? null;
      }
      return base;
    }),
  };
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export async function createPsychotherapyRequest(actor: AuthUser, body: any) {
  if (actor.role !== "patient") throw forbidden();
  const sessionMode = String(body?.session_mode ?? "");
  if (!SESSION_MODES.includes(sessionMode)) throw badRequest("Choose a session mode.");
  const preferredText = String(body?.preferred_start_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredText)) throw badRequest("Preferred start date is required.");
  const preferred = new Date(`${preferredText}T00:00:00.000Z`);
  if (Number.isNaN(preferred.getTime()) || preferred.toISOString().slice(0, 10) !== preferredText) throw badRequest("Choose a valid preferred start date.");
  if (preferredText < todayIso()) throw badRequest("Preferred start date cannot be in the past.");
  const urgency = String(body?.urgency ?? "routine");
  if (!URGENCIES.includes(urgency)) throw badRequest("Invalid urgency.");
  if (!body?.confidentiality_accepted) throw badRequest("You must accept the confidentiality notice.");
  const gender = String(body?.gender_preference ?? "any");
  if (!GENDERS.includes(gender)) throw badRequest("Invalid gender preference.");
  const language = String(body?.language_preference ?? "english");
  if (!LANGUAGES.includes(language)) throw badRequest("Invalid language preference.");

  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`medibook:psychotherapy-patient:${actor.id}`}))`;
    const active = await tx.psychotherapyRequest.findFirst({
      where: { patient_id: actor.id, status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (active) throw conflict("You already have an active psychotherapy request. Complete it before requesting another.");
    return tx.psychotherapyRequest.create({
      data: {
        patient_id: actor.id,
        session_mode: sessionMode,
        preferred_start_date: preferred,
        urgency,
        confidentiality_accepted: true,
        gender_preference: gender,
        language_preference: language,
        notes: body?.notes ? String(body.notes).trim().slice(0, 5000) : null,
        status: "pending",
      },
      include: includeFull(),
    });
  });
  broadcastPlatformDataUpdated("psychotherapy");
  return serializeRequest(request, actor, null);
}

export async function listPsychotherapyRequests(actor: AuthUser, filters?: { status?: string; patient_id?: number; doctor_id?: number }) {
  const where: any = {};
  if (actor.role === "patient") where.patient_id = actor.id;
  else if (actor.role === "doctor") {
    const did = await ownDoctorId(actor);
    where.doctor_id = did ?? -1;
  }
  if (filters?.status) where.status = filters.status;
  if (filters?.patient_id && (actor.role === "coordinator" || actor.role === "admin")) where.patient_id = filters.patient_id;
  if (filters?.doctor_id && (actor.role === "coordinator" || actor.role === "admin")) where.doctor_id = filters.doctor_id;

  const rows = await prisma.psychotherapyRequest.findMany({
    where,
    include: includeFull(),
    orderBy: { created_at: "desc" },
    take: 200,
  });
  const doctorId = await ownDoctorId(actor);
  return rows.map((r) => serializeRequest(r, actor, doctorId));
}

export async function getPsychotherapyRequest(actor: AuthUser, id: number) {
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id }, include: includeFull() });
  if (!req) throw notFound("Psychotherapy request not found.");
  if (actor.role === "patient" && req.patient_id !== actor.id) throw forbidden();
  if (actor.role === "doctor") {
    const did = await ownDoctorId(actor);
    if (!did || req.doctor_id !== did) throw forbidden();
  }
  if (actor.role !== "patient" && actor.role !== "doctor" && actor.role !== "coordinator" && actor.role !== "admin") throw forbidden();
  const doctorId = await ownDoctorId(actor);
  return serializeRequest(req, actor, doctorId);
}

export async function assignPsychotherapyDoctor(actor: AuthUser, id: number, doctorId: number) {
  if (actor.role !== "coordinator" && actor.role !== "admin") throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Psychotherapy request not found.");
  if (req.status !== "pending") throw conflict("This psychotherapy request is no longer pending.");
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor || !doctor.is_available) throw badRequest("Choose an available psychologist.");
  const changed = await prisma.psychotherapyRequest.updateMany({
    where: { id, status: "pending", doctor_id: null },
    data: { status: "assigned", doctor_id: doctorId, assigned_at: new Date() },
  });
  if (changed.count !== 1) throw conflict("This psychotherapy request was assigned or changed already. Refresh the request.");
  const updated = await prisma.psychotherapyRequest.findUniqueOrThrow({ where: { id }, include: includeFull() });
  broadcastPlatformDataUpdated("psychotherapy");
  const effects = await Promise.allSettled([
    notify(req.patient_id, "appointment_confirmed", `Your psychotherapy request has been assigned to Dr. ${doctor.user.first_name} ${doctor.user.last_name}.`, null, "Psychotherapy assigned"),
    notify(doctor.user.id, "appointment_request", "You have been assigned a psychotherapy case. Open Psychotherapy to plan the sessions.", null, "Psychotherapy assigned"),
  ]);
  effects.forEach((effect) => {
    if (effect.status === "rejected") console.error("[psychotherapy] assignment notification failed", effect.reason);
  });
  const did = await ownDoctorId(actor);
  return serializeRequest(updated, actor, did);
}

export async function planPsychotherapy(actor: AuthUser, id: number, body: any) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id }, include: includeFull() });
  if (!req) throw notFound("Psychotherapy request not found.");
  if (req.doctor_id !== doctorId) throw forbidden();
  if (req.status !== "assigned") throw conflict("This psychotherapy request is not ready for planning.");

  const goals = String(body?.goals ?? "").trim();
  if (!goals) throw badRequest("Goals are required.");
  const frequency = String(body?.frequency ?? "");
  if (!FREQUENCIES.includes(frequency)) throw badRequest("Invalid frequency.");
  const duration = Number(body?.session_duration);
  if (!Number.isFinite(duration) || duration < 10 || duration > 240) throw badRequest("Invalid session duration.");
  const total = Number(body?.planned_sessions);
  if (!Number.isFinite(total) || total < 1 || total > 50) throw badRequest("Invalid planned session count.");
  const start = body?.start_date ? new Date(body.start_date) : null;
  if (!start || Number.isNaN(start.getTime())) throw badRequest("Start date is required.");
  const startTime = normalizeTime(String(body?.start_time ?? "09:00"));

  // Generate planned session dates.
  const dates: Date[] = [];
  if (frequency === "twice_weekly") {
    for (let i = 0; i < total; i++) {
      const week = Math.floor(i / 2);
      const offset = week * 7 + (i % 2 === 0 ? 0 : 3);
      dates.push(addDays(start, offset));
    }
  } else {
    const interval = frequency === "biweekly" ? 14 : 7;
    for (let i = 0; i < total; i++) dates.push(addDays(start, i * interval));
  }

  const startSec = timeToSeconds(startTime);
  const endSec = startSec + duration * 60;
  const endTime = secondsToTime(endSec);

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.psychotherapyRequest.findUnique({ where: { id }, select: { doctor_id: true, status: true } });
    if (!current || current.doctor_id !== doctorId || current.status !== "assigned") {
      throw conflict("This psychotherapy request is no longer ready for a plan.");
    }
    // Remove any previously planned sessions (none expected here, but safe).
    await tx.psychotherapySession.deleteMany({ where: { psychotherapy_request_id: id, status: "scheduled" } });
    for (let i = 0; i < dates.length; i++) {
      await tx.psychotherapySession.create({
        data: {
          psychotherapy_request_id: id,
          session_number: i + 1,
          scheduled_date: dates[i],
          start_time: startTime,
          end_time: endTime,
          duration_minutes: duration,
          status: "scheduled",
        },
      });
    }
    return tx.psychotherapyRequest.update({
      where: { id },
      data: {
        status: "accepted",
        plan_goals: goals,
        plan_frequency: frequency,
        plan_session_duration: duration,
        plan_total_sessions: total,
        plan_start_date: start,
        plan_start_time: startTime,
        accepted_at: new Date(),
      },
      include: includeFull(),
    });
  });

  broadcastPlatformDataUpdated("psychotherapy");
  const planned = (updated.sessions ?? [])
    .map((session) => `${session.scheduled_date.toISOString().slice(0, 10)} ${session.start_time.slice(0, 5)}`)
    .join(", ");
  await notify(
    req.patient_id,
    "appointment_confirmed",
    `Your psychotherapy plan has been accepted. Psychologist: Dr. ${updated.doctor?.user?.first_name ?? ""} ${updated.doctor?.user?.last_name ?? ""}. Sessions: ${planned}. View Psychotherapy for the full plan.`,
    null,
    "Psychotherapy accepted"
  ).catch((error) => console.error("[psychotherapy] plan notification failed", error));
  return serializeRequest(updated, actor, doctorId);
}

export async function startPsychotherapySession(actor: AuthUser, requestId: number, sessionId: number) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const session = await prisma.psychotherapySession.findUnique({
    where: { id: sessionId },
    include: { request: true },
  });
  if (!session || session.psychotherapy_request_id !== requestId) throw notFound("Session not found.");
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  if (session.status === "completed") throw conflict("Session already completed.");
  if (!["accepted", "in_progress", "follow_up"].includes(req.status)) {
    throw conflict("The psychotherapy plan must be accepted before a session can start.");
  }
  if (session.status !== "in_progress") {
    if (session.status !== "scheduled") throw conflict("This session is not scheduled.");
    // Block until scheduled date/time reached.
    const scheduled = new Date(`${session.scheduled_date.toISOString().slice(0, 10)}T${normalizeTime(session.start_time)}Z`);
    if (Number.isNaN(scheduled.getTime())) throw badRequest("Invalid scheduled time.");
    if (new Date() < scheduled) throw conflict("This session is not due yet.");
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`medibook:psychotherapy-request:${requestId}`}))`;
    const otherActive = await tx.psychotherapySession.findFirst({
      where: { psychotherapy_request_id: requestId, status: "in_progress", id: { not: sessionId } },
      select: { id: true },
    });
    if (otherActive) throw conflict("Complete the active session before starting another one.");
    const changed = await tx.psychotherapySession.updateMany({
      where: { id: sessionId, psychotherapy_request_id: requestId, status: { in: ["scheduled", "in_progress"] } },
      data: { status: "in_progress", started_at: session.started_at ?? new Date() },
    });
    if (changed.count !== 1) throw conflict("This session changed before it could be started. Refresh and try again.");
    await tx.psychotherapyRequest.update({
      where: { id: requestId },
      data: { status: "in_progress", started_at: req.started_at ?? new Date() },
    });
    return tx.psychotherapySession.findUniqueOrThrow({ where: { id: sessionId } });
  });
  broadcastPlatformDataUpdated("psychotherapy");
  return updatedSession;
}

export async function updatePsychotherapySession(actor: AuthUser, requestId: number, sessionId: number, body: any) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const session = await prisma.psychotherapySession.findUnique({ where: { id: sessionId } });
  if (!session || session.psychotherapy_request_id !== requestId) throw notFound("Session not found.");
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  if (session.status === "completed" || req.status === "completed") throw conflict("Completed psychotherapy sessions are read-only.");
  if (body?.confidential_notes !== undefined && session.status !== "in_progress") {
    throw conflict("Start the session before saving confidential notes.");
  }

  const data: any = {};
  if (body?.confidential_notes !== undefined) data.confidential_notes = body.confidential_notes ? String(body.confidential_notes) : null;
  if (body?.treatment_id !== undefined) {
    if (body.treatment_id === null) data.treatment_id = null;
    else {
      const t = await prisma.medicalTreatment.findUnique({ where: { id: Number(body.treatment_id) } });
      if (!t || t.doctor_id !== doctorId || t.patient_id !== req.patient_id) throw badRequest("Invalid treatment.");
      data.treatment_id = Number(body.treatment_id);
    }
  }
  if (Object.keys(data).length === 0) return session;
  const updated = await prisma.psychotherapySession.update({ where: { id: sessionId }, data });
  broadcastPlatformDataUpdated("psychotherapy");
  return updated;
}

/** Save the medication/treatment form privately against one active therapy session. */
export async function savePsychotherapyMedication(actor: AuthUser, requestId: number, sessionId: number, body: any) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const session = await prisma.psychotherapySession.findUnique({
    where: { id: sessionId },
    include: { request: { select: { doctor_id: true, status: true } } },
  });
  if (!session || session.psychotherapy_request_id !== requestId) throw notFound("Session not found.");
  if (session.request.doctor_id !== doctorId) throw forbidden();
  if (session.status !== "in_progress" || session.request.status === "completed") {
    throw conflict("Medication can only be saved during an active psychotherapy session.");
  }

  const diagnosis = String(body?.diagnosis ?? "").trim().slice(0, 2000);
  const treatmentNotes = String(body?.treatment_notes ?? "").trim().slice(0, 10_000);
  const incoming = body?.items ?? [];
  if (!Array.isArray(incoming) || incoming.length > 20) throw badRequest("Add no more than 20 medication items.");
  const items = incoming.map((item: any) => ({
    medication: String(item?.medication ?? "").trim().slice(0, 200),
    dosage: String(item?.dosage ?? "").trim().slice(0, 200),
    frequency: String(item?.frequency ?? "").trim().slice(0, 200),
    duration: String(item?.duration ?? "").trim().slice(0, 200),
    quantity: String(item?.quantity ?? "").trim().slice(0, 100),
    instructions: String(item?.instructions ?? "").trim().slice(0, 2000),
  })).filter((item: any) => item.medication);
  if (!diagnosis && !treatmentNotes && items.length === 0) {
    throw badRequest("Enter treatment notes or at least one medication before saving.");
  }

  const record = await prisma.psychotherapyMedication.upsert({
    where: { session_id: sessionId },
    create: {
      session_id: sessionId,
      diagnosis,
      treatment_notes: treatmentNotes,
      items: items as Prisma.InputJsonValue,
    },
    update: {
      diagnosis,
      treatment_notes: treatmentNotes,
      items: items as Prisma.InputJsonValue,
    },
  });
  broadcastPlatformDataUpdated("psychotherapy");
  return record;
}

export async function completePsychotherapySession(actor: AuthUser, requestId: number, sessionId: number, body: any) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const session = await prisma.psychotherapySession.findUnique({ where: { id: sessionId } });
  if (!session || session.psychotherapy_request_id !== requestId) throw notFound("Session not found.");
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  if (req.status === "completed") throw conflict("This psychotherapy case is already complete.");
  if (session.status !== "in_progress") throw conflict("Start the session before completing it.");

  const hasFollowUpDate = Boolean(body?.follow_up_date);
  const hasFollowUpTime = Boolean(body?.follow_up_time);
  if (hasFollowUpDate !== hasFollowUpTime) throw badRequest("Enter both a follow-up date and time, or leave both blank.");
  let followUpDate: Date | null = null;
  let followUpTime: string | null = null;
  let followUpEndTime: string | null = null;
  if (hasFollowUpDate && hasFollowUpTime) {
    const dateText = String(body.follow_up_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw badRequest("Enter a valid follow-up date.");
    followUpDate = new Date(`${dateText}T00:00:00.000Z`);
    if (Number.isNaN(followUpDate.getTime()) || followUpDate.toISOString().slice(0, 10) !== dateText) {
      throw badRequest("Enter a valid follow-up date.");
    }
    followUpTime = normalizeTime(String(body.follow_up_time));
    const duration = req.plan_session_duration ?? session.duration_minutes ?? 50;
    const endSeconds = timeToSeconds(followUpTime) + duration * 60;
    if (endSeconds > 24 * 60 * 60) throw badRequest("The follow-up session cannot run past midnight.");
    followUpEndTime = secondsToTime(endSeconds);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`medibook:psychotherapy-request:${requestId}`}))`;
    const changed = await tx.psychotherapySession.updateMany({
      where: { id: sessionId, psychotherapy_request_id: requestId, status: "in_progress" },
      data: {
        status: "completed",
        completed_at: new Date(),
        confidential_notes: body?.confidential_notes !== undefined
          ? (body.confidential_notes ? String(body.confidential_notes).slice(0, 20_000) : null)
          : session.confidential_notes,
      },
    });
    if (changed.count !== 1) throw conflict("This session was already completed. Refresh the case.");

    if (followUpDate && followUpTime && followUpEndTime) {
      const count = await tx.psychotherapySession.count({ where: { psychotherapy_request_id: requestId } });
      await tx.psychotherapySession.create({
        data: {
          psychotherapy_request_id: requestId,
          session_number: count + 1,
          scheduled_date: followUpDate,
          start_time: followUpTime,
          end_time: followUpEndTime,
          duration_minutes: req.plan_session_duration ?? session.duration_minutes ?? 50,
          status: "scheduled",
        },
      });
      await tx.psychotherapyRequest.update({ where: { id: requestId }, data: { status: "follow_up" } });
    }
  });

  broadcastPlatformDataUpdated("psychotherapy");
  if (followUpDate && followUpTime) {
    await notify(
      req.patient_id,
      "appointment_confirmed",
      `Your psychologist scheduled a follow-up psychotherapy session for ${followUpDate.toISOString().slice(0, 10)} at ${followUpTime.slice(0, 5)}.`,
      null,
      "Psychotherapy follow-up scheduled"
    ).catch((error) => console.error("[psychotherapy] follow-up notification failed", error));
  }
  const updated = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: includeFull() });
  const did = await ownDoctorId(actor);
  return serializeRequest(updated, actor, did);
}

export async function finalizePsychotherapy(actor: AuthUser, requestId: number) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: { sessions: true } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  if (req.status === "completed") throw conflict("This psychotherapy case is already complete.");
  if (req.sessions.length === 0 || req.sessions.some((session) => session.status !== "completed")) {
    throw conflict("Complete every planned session before marking psychotherapy done.");
  }
  const changed = await prisma.psychotherapyRequest.updateMany({
    where: { id: requestId, doctor_id: doctorId, status: { in: ["accepted", "in_progress", "follow_up"] } },
    data: { status: "completed", completed_at: new Date() },
  });
  if (changed.count !== 1) throw conflict("The psychotherapy case changed. Refresh and try again.");
  const updated = await prisma.psychotherapyRequest.findUniqueOrThrow({ where: { id: requestId }, include: includeFull() });
  broadcastPlatformDataUpdated("psychotherapy");
  const coordinators = await prisma.user.findMany({ where: { role: "coordinator", is_active: true }, select: { id: true } });
  const notifications = await Promise.allSettled([
    notify(req.patient_id, "appointment_confirmed", "Your psychotherapy sessions have been completed. Your report is now available.", null, "Psychotherapy completed"),
    ...coordinators.map((c) =>
      notify(c.id, "system", `Psychotherapy case #${requestId} is complete. ${req.sessions.length} session(s) completed. Its report is ready in Manage psychotherapy.`, null, "Psychotherapy completed")
    ),
  ]);
  notifications.forEach((result) => {
    if (result.status === "rejected") console.error("[psychotherapy] completion notification failed", result.reason);
  });
  const did = await ownDoctorId(actor);
  return serializeRequest(updated, actor, did);
}

export async function listPsychotherapyMedicationHistory(actor: AuthUser, requestId: number) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: includeFull() });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  return (req.sessions || [])
    .filter((s: any) => s.medication_record || s.treatment)
    .map((s: any) => ({
      session_id: s.id,
      session_number: s.session_number,
      scheduled_date: s.scheduled_date,
      medication_record: s.medication_record ?? null,
      // Read legacy records created before psychotherapy had a private table.
      treatment: s.medication_record ? null : treatmentDto(s.treatment),
    }));
}
