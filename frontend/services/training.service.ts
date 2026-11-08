import { prisma } from "@/lib/db";
import { badRequest, notFound, conflict, forbidden } from "@/lib/errors";
import { notify, broadcastPlatformDataUpdated } from "@/lib/notify";
import type { AuthUser } from "@/lib/auth";
import * as doctorsRepo from "@/repositories/doctors.repo";

export async function createTrainingRequest(actor: AuthUser, data: any) {
  if (!data.training_topic?.trim()) throw badRequest("Training topic is required.");
  if (!data.preferred_start_date) throw badRequest("Preferred start date is required.");
  const days = Number(data.preferred_days) || 1;
  if (days < 1 || days > 30) throw badRequest("Preferred days must be between 1 and 30.");
  if (!["individual", "company"].includes(data.audience)) throw badRequest("Invalid audience.");
  if (!["onsite", "online"].includes(data.delivery_mode)) throw badRequest("Invalid delivery mode.");
  if (data.audience === "company") {
    if (!data.company_name?.trim()) throw badRequest("Company name is required.");
    if (!data.contact_name?.trim()) throw badRequest("Contact name is required.");
    if (!data.contact_email?.trim()) throw badRequest("Contact email is required.");
  }
  if (data.delivery_mode === "onsite" && !data.location?.trim()) throw badRequest("Location is required for onsite training.");

  // One active training at a time per patient
  const active = await prisma.trainingRequest.findFirst({
    where: { patient_id: actor.id, status: { in: ["pending", "accepted", "scheduled", "in_progress"] } },
  });
  if (active) throw conflict("You already have an active training request. Complete it before requesting another.");

  const request = await prisma.trainingRequest.create({
    data: {
      patient_id: actor.id,
      audience: data.audience,
      company_name: data.company_name || null,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      training_topic: data.training_topic.trim(),
      preferred_start_date: new Date(data.preferred_start_date),
      preferred_days: days,
      delivery_mode: data.delivery_mode,
      location: data.location || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      location_accuracy: data.location_accuracy ?? null,
      notes: data.notes || null,
      status: "pending",
    },
  });
  // Create sessions for each day
  const start = new Date(data.preferred_start_date);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    await prisma.trainingSession.create({
      data: { training_request_id: request.id, session_number: i + 1, session_date: d, status: "pending" },
    });
  }
  broadcastPlatformDataUpdated("training");
  return request;
}

export async function listTrainingRequests(filters?: { status?: string; doctor_id?: number; patient_id?: number }) {
  const where: any = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.doctor_id) where.doctor_id = filters.doctor_id;
  if (filters?.patient_id) where.patient_id = filters.patient_id;
  return prisma.trainingRequest.findMany({
    where,
    include: { patient: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, profile_image_id: true } }, doctor: { include: { user: { select: { first_name: true, last_name: true, email: true, profile_image_id: true } } } }, sessions: { include: { questions: true }, orderBy: { session_number: "asc" } } },
    orderBy: { created_at: "desc" },
    take: 200,
  });
}

export async function getTrainingRequest(id: number) {
  const r = await prisma.trainingRequest.findUnique({
    where: { id },
    include: { patient: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, profile_image_id: true } }, doctor: { include: { user: { select: { first_name: true, last_name: true, email: true, profile_image_id: true } } } }, sessions: { include: { questions: true }, orderBy: { session_number: "asc" } } },
  });
  if (!r) throw notFound("Training request not found.");
  return r;
}

export async function acceptTraining(actor: AuthUser, id: number, doctorId: number) {
  const req = await prisma.trainingRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Training request not found.");
  if (req.status !== "pending") throw conflict("This training request is no longer pending.");
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor || !doctor.is_available) throw badRequest("Choose an available specialist.");
  const updated = await prisma.trainingRequest.update({
    where: { id },
    data: { status: "accepted", doctor_id: doctorId },
  });
  await notify(req.patient_id, "appointment_request", `Your training request "${req.training_topic}" has been accepted. Specialist: Dr. ${doctor.user.first_name} ${doctor.user.last_name}.`, null, "Training accepted");
  await notify(doctor.user.id, "appointment_request", `You have been assigned a training: "${req.training_topic}" for ${req.preferred_days} day(s).`, null, "Training assigned");
  broadcastPlatformDataUpdated("training");
  return updated;
}

export async function startSession(actor: AuthUser, trainingId: number, sessionId: number) {
  const doctor = actor.role === "doctor" ? await doctorsRepo.findDoctorByUserId(actor.id) : null;
  const doctorId = doctor?.id ?? null;
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, include: { training: true } });
  if (!session || session.training_request_id !== trainingId) throw notFound("Session not found.");
  if (session.training.doctor_id !== doctorId && actor.role !== "admin") throw forbidden("Not assigned to this training.");
  if (session.status === "completed") throw conflict("Session already completed.");
  const updated = await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { status: "in_progress", started_at: new Date() },
  });
  await prisma.trainingRequest.update({ where: { id: trainingId }, data: { status: "in_progress" } });
  broadcastPlatformDataUpdated("training");
  return updated;
}

export async function addQuestion(actor: AuthUser, sessionId: number, question: string, challenge?: string) {
  const doctor = actor.role === "doctor" ? await doctorsRepo.findDoctorByUserId(actor.id) : null;
  const doctorId = doctor?.id ?? null;
  if (!question?.trim()) throw badRequest("Question is required.");
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, include: { training: true } });
  if (!session) throw notFound("Session not found.");
  if (session.status !== "in_progress") throw conflict("Session must be in progress to add questions.");
  if (session.training.doctor_id !== doctorId && actor.role !== "admin") throw forbidden("Not assigned.");
  return prisma.trainingQuestion.create({ data: { session_id: sessionId, question: question.trim(), challenge: challenge?.trim() || null } });
}

export async function nextSession(actor: AuthUser, trainingId: number, sessionId: number) {
  const doctor = actor.role === "doctor" ? await doctorsRepo.findDoctorByUserId(actor.id) : null;
  const doctorId = doctor?.id ?? null;
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, include: { training: { include: { sessions: true } } } });
  if (!session || session.training_request_id !== trainingId) throw notFound("Session not found.");
  if (session.training.doctor_id !== doctorId && actor.role !== "admin") throw forbidden("Not assigned.");
  await prisma.trainingSession.update({ where: { id: sessionId }, data: { status: "completed", completed_at: new Date() } });
  broadcastPlatformDataUpdated("training");
  return session.training;
}

export async function rescheduleTraining(actor: AuthUser, id: number, newStartDate: string, days?: number) {
  const req = await prisma.trainingRequest.findUnique({ where: { id }, include: { sessions: true } });
  if (!req) throw notFound("Training request not found.");
  if (req.status === "completed" || req.status === "cancelled") throw conflict("Cannot reschedule a completed or cancelled training.");
  if (req.doctor_id !== null && actor.role === "doctor") {
    const doctor = await doctorsRepo.findDoctorByUserId(actor.id);
    if (!doctor || req.doctor_id !== doctor.id) throw forbidden("Not assigned.");
  }
  if (actor.role === "patient" && req.patient_id !== actor.id) throw forbidden("Not your training.");
  const d = days ?? req.preferred_days;
  if (d < 1 || d > 30) throw badRequest("Days must be between 1 and 30.");
  const start = new Date(newStartDate);
  if (Number.isNaN(start.getTime())) throw badRequest("Invalid date.");
  // remove unstarted sessions
  await prisma.trainingSession.deleteMany({ where: { training_request_id: id, status: { in: ["pending"] } } });
  // recreate if needed
  const existing = await prisma.trainingSession.count({ where: { training_request_id: id } });
  for (let i = existing; i < d; i++) {
    const dd = new Date(start); dd.setUTCDate(start.getUTCDate() + i);
    await prisma.trainingSession.create({ data: { training_request_id: id, session_number: i + 1, session_date: dd, status: "pending" } });
  }
  // update dates for existing sessions
  const sessions = await prisma.trainingSession.findMany({ where: { training_request_id: id }, orderBy: { session_number: "asc" } });
  for (let i = 0; i < sessions.length; i++) {
    const dd = new Date(start); dd.setUTCDate(start.getUTCDate() + i);
    await prisma.trainingSession.update({ where: { id: sessions[i].id }, data: { session_date: dd } });
  }
  const updated = await prisma.trainingRequest.update({
    where: { id },
    data: { preferred_start_date: start, preferred_days: d, status: req.status === "pending" ? "pending" : "accepted" },
  });
  await notify(req.patient_id, "appointment_request", `Your training "${req.training_topic}" has been rescheduled to ${start.toLocaleDateString()}.`, null, "Training rescheduled");
  broadcastPlatformDataUpdated("training");
  return updated;
}

export async function cancelTraining(actor: AuthUser, id: number) {
  const req = await prisma.trainingRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Training request not found.");
  if (req.status === "completed" || req.status === "cancelled") throw conflict("Cannot cancel this training.");
  if (actor.role === "patient" && req.patient_id !== actor.id) throw forbidden("Not your training.");
  if (actor.role === "doctor") {
    const doctor = await doctorsRepo.findDoctorByUserId(actor.id);
    if (!doctor || req.doctor_id !== doctor.id) throw forbidden("Not assigned.");
  }
  if (actor.role !== "patient" && actor.role !== "doctor" && actor.role !== "coordinator" && actor.role !== "admin") throw forbidden();
  const updated = await prisma.trainingRequest.update({ where: { id }, data: { status: "cancelled" } });
  await notify(req.patient_id, "appointment_request", `Your training "${req.training_topic}" has been cancelled.`, null, "Training cancelled");
  if (req.doctor_id) {
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctor_id }, include: { user: true } });
    if (doc) await notify(doc.user.id, "appointment_request", `Training "${req.training_topic}" has been cancelled.`, null, "Training cancelled");
  }
  broadcastPlatformDataUpdated("training");
  return updated;
}


export async function completeTraining(actor: AuthUser, trainingId: number, sessionId: number) {
  const doctor = actor.role === "doctor" ? await doctorsRepo.findDoctorByUserId(actor.id) : null;
  const doctorId = doctor?.id ?? null;
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, include: { training: { include: { sessions: true, patient: true } } } });
  if (!session || session.training_request_id !== trainingId) throw notFound("Session not found.");
  if (session.training.doctor_id !== doctorId && actor.role !== "admin") throw forbidden("Not assigned.");
  await prisma.trainingSession.update({ where: { id: sessionId }, data: { status: "completed", completed_at: new Date() } });
  await prisma.trainingRequest.update({ where: { id: trainingId }, data: { status: "completed" } });
  await notify(session.training.patient_id, "appointment_request", "Your training has been completed.", null, "Training completed");
  broadcastPlatformDataUpdated("training");
  return session.training;
}
