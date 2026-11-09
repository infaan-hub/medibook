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
import { normalizeTime, timeToSeconds, secondsToTime } from "@/lib/dates";
import { treatmentDto } from "@/lib/serializers";

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
        treatment: { include: { prescriptions: { include: { items: true } }, appointment: { select: { status: true } } } },
      },
      orderBy: { session_number: "asc" as const },
    },
  };
}

function canSeeClinical(actor: AuthUser, req: any, doctorId: number | null) {
  if (actor.role === "admin") return true;
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
    plan_approach: req.plan_approach,
    plan_goals: req.plan_goals,
    plan_frequency: req.plan_frequency,
    plan_session_duration: req.plan_session_duration,
    plan_total_sessions: req.plan_total_sessions,
    plan_start_date: req.plan_start_date,
    plan_start_time: req.plan_start_time,
    plan_review_after: req.plan_review_after,
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
  const preferred = body?.preferred_start_date ? new Date(body.preferred_start_date) : null;
  if (!preferred || Number.isNaN(preferred.getTime())) throw badRequest("Preferred start date is required.");
  const urgency = String(body?.urgency ?? "routine");
  if (!URGENCIES.includes(urgency)) throw badRequest("Invalid urgency.");
  if (!body?.confidentiality_accepted) throw badRequest("You must accept the confidentiality notice.");
  const gender = String(body?.gender_preference ?? "any");
  if (!GENDERS.includes(gender)) throw badRequest("Invalid gender preference.");
  const language = String(body?.language_preference ?? "english");
  if (!LANGUAGES.includes(language)) throw badRequest("Invalid language preference.");

  const active = await prisma.psychotherapyRequest.findFirst({
    where: { patient_id: actor.id, status: { in: ACTIVE_STATUSES } },
  });
  if (active) throw conflict("You already have an active psychotherapy request. Complete it before requesting another.");

  const request = await prisma.psychotherapyRequest.create({
    data: {
      patient_id: actor.id,
      session_mode: sessionMode,
      preferred_start_date: preferred,
      urgency,
      confidentiality_accepted: true,
      gender_preference: gender,
      language_preference: language,
      notes: body?.notes ? String(body.notes).trim() : null,
      status: "pending",
    },
    include: includeFull(),
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
  const updated = await prisma.psychotherapyRequest.update({
    where: { id },
    data: { status: "assigned", doctor_id: doctorId, assigned_at: new Date() },
    include: includeFull(),
  });
  await notify(req.patient_id, "appointment_confirmed", `Your psychotherapy request has been assigned to Dr. ${doctor.user.first_name} ${doctor.user.last_name}.`, null, "Psychotherapy assigned");
  await notify(doctor.user.id, "appointment_request", "You have been assigned a psychotherapy case. Open Psychotherapy to plan the sessions.", null, "Psychotherapy assigned");
  broadcastPlatformDataUpdated("psychotherapy");
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

  const approach = String(body?.approach ?? "");
  if (!APPROACHES.includes(approach)) throw badRequest("Invalid approach.");
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
  const reviewAfter = body?.review_after !== undefined && body?.review_after !== null && body?.review_after !== ""
    ? Number(body.review_after)
    : null;
  if (reviewAfter !== null && (!Number.isFinite(reviewAfter) || reviewAfter < 1)) throw badRequest("Invalid review point.");

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

  // Remove any previously planned sessions (none expected here, but safe).
  await prisma.psychotherapySession.deleteMany({ where: { psychotherapy_request_id: id, status: "scheduled" } });

  for (let i = 0; i < dates.length; i++) {
    await prisma.psychotherapySession.create({
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

  const updated = await prisma.psychotherapyRequest.update({
    where: { id },
    data: {
      status: "accepted",
      plan_approach: approach,
      plan_goals: goals,
      plan_frequency: frequency,
      plan_session_duration: duration,
      plan_total_sessions: total,
      plan_start_date: start,
      plan_start_time: startTime,
      plan_review_after: reviewAfter,
      accepted_at: new Date(),
    },
    include: includeFull(),
  });

  await notify(req.patient_id, "appointment_confirmed", `Your psychotherapy appointment has been accepted. Psychologist: Dr. ${updated.doctor?.user?.first_name ?? ""} ${updated.doctor?.user?.last_name ?? ""}. ${total} session(s) planned from ${start.toISOString().slice(0, 10)}.`, null, "Psychotherapy accepted");
  broadcastPlatformDataUpdated("psychotherapy");
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
  if (session.status === "in_progress") {
    // idempotent
  } else {
    // Block until scheduled date/time reached.
    const scheduled = new Date(`${session.scheduled_date.toISOString().slice(0, 10)}T${session.start_time}`);
    if (Number.isNaN(scheduled.getTime())) throw badRequest("Invalid scheduled time.");
    if (new Date() < scheduled) throw conflict("This session is not due yet.");
  }

  const updatedSession = await prisma.psychotherapySession.update({
    where: { id: sessionId },
    data: { status: "in_progress", started_at: session.started_at ?? new Date() },
  });
  await prisma.psychotherapyRequest.update({ where: { id: requestId }, data: { status: "in_progress", started_at: req.started_at ?? new Date() } });
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

export async function completePsychotherapySession(actor: AuthUser, requestId: number, sessionId: number, body: any) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const session = await prisma.psychotherapySession.findUnique({ where: { id: sessionId } });
  if (!session || session.psychotherapy_request_id !== requestId) throw notFound("Session not found.");
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: { sessions: true } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  if (session.status === "completed") throw conflict("Session already completed.");

  await prisma.psychotherapySession.update({
    where: { id: sessionId },
    data: { status: "completed", completed_at: new Date(), confidential_notes: body?.confidential_notes !== undefined ? (body.confidential_notes ? String(body.confidential_notes) : null) : session.confidential_notes },
  });

  // Optional follow-up scheduling.
  const followUpDate = body?.follow_up_date ? new Date(body.follow_up_date) : null;
  const followUpTime = body?.follow_up_time ? normalizeTime(String(body.follow_up_time)) : null;
  if (followUpDate && !Number.isNaN(followUpDate.getTime())) {
    if (!followUpTime) throw badRequest("Follow-up time is required.");
    const duration = req.plan_session_duration ?? session.duration_minutes ?? 50;
    const startSec = timeToSeconds(followUpTime);
    const endSec = startSec + duration * 60;
    const nextNumber = (req.sessions?.length ?? 0) + 1;
    await prisma.psychotherapySession.create({
      data: {
        psychotherapy_request_id: requestId,
        session_number: nextNumber,
        scheduled_date: followUpDate,
        start_time: followUpTime,
        end_time: secondsToTime(endSec),
        duration_minutes: duration,
        status: "scheduled",
      },
    });
    await prisma.psychotherapyRequest.update({ where: { id: requestId }, data: { status: "follow_up" } });
  } else {
    // If all sessions completed, mark follow_up? Keep in_progress until finalized or follow-up.
    const remaining = await prisma.psychotherapySession.count({ where: { psychotherapy_request_id: requestId, status: { in: ["scheduled", "in_progress"] } } });
    if (remaining === 0) {
      await prisma.psychotherapyRequest.update({ where: { id: requestId }, data: { status: "follow_up" } });
    } else {
      await prisma.psychotherapyRequest.update({ where: { id: requestId }, data: { status: "in_progress" } });
    }
  }

  broadcastPlatformDataUpdated("psychotherapy");
  const updated = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: includeFull() });
  const did = await ownDoctorId(actor);
  return serializeRequest(updated, actor, did);
}

export async function finalizePsychotherapy(actor: AuthUser, requestId: number) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: { sessions: true } });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  // Block if any scheduled/in-progress sessions remain.
  const pending = (req.sessions || []).some((s: any) => s.status === "scheduled" || s.status === "in_progress");
  if (pending) throw conflict("Complete or remove pending sessions before finalizing.");
  const updated = await prisma.psychotherapyRequest.update({
    where: { id: requestId },
    data: { status: "completed", completed_at: new Date() },
    include: includeFull(),
  });
  await notify(req.patient_id, "appointment_confirmed", "Your psychotherapy sessions have been completed. Your report is now available.", null, "Psychotherapy completed");
  const coordinators = await prisma.user.findMany({ where: { role: "coordinator", is_active: true }, select: { id: true } });
  await Promise.allSettled(
    coordinators.map((c) =>
      notify(c.id, "system", "A psychotherapy case has been completed. Its report is ready in Manage psychotherapy.", null, "Psychotherapy completed")
    )
  );
  broadcastPlatformDataUpdated("psychotherapy");
  const did = await ownDoctorId(actor);
  return serializeRequest(updated, actor, did);
}

export async function listPsychotherapyMedicationHistory(actor: AuthUser, requestId: number) {
  const doctorId = await ownDoctorId(actor);
  if (!doctorId) throw forbidden();
  const req = await prisma.psychotherapyRequest.findUnique({ where: { id: requestId }, include: includeFull() });
  if (!req || req.doctor_id !== doctorId) throw forbidden();
  return (req.sessions || [])
    .filter((s: any) => s.treatment)
    .map((s: any) => ({
      session_id: s.id,
      session_number: s.session_number,
      scheduled_date: s.scheduled_date,
      treatment: treatmentDto(s.treatment),
    }));
}
