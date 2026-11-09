/**
 * Training report data — a view model of ONE training request, its delivery
 * schedule and every question/challenge captured by the assigned specialist.
 *
 * Authorization is enforced here, not in the route:
 *  - a patient may only print their own training;
 *  - a doctor may only print a training assigned to them;
 *  - coordinators and admins may print any training (operations record).
 */
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth";
import { branding } from "../design/tokens";
import {
  formatDateTime,
  formatIsoDate,
  notProvided,
  personName,
  titleCase,
} from "./format";
import { buildDoctorSummary, buildPatientSummary, type PatientUserRow } from "./people";
import type { DoctorSummary, PatientSummary } from "../pdf/sections";

export interface TrainingReportQuestion {
  question: string;
  challenge: string;
  recordedAt: string;
}

export interface TrainingReportSession {
  number: number;
  date: string;
  status: string;
  statusLabel: string;
  started: string;
  completed: string;
  questions: TrainingReportQuestion[];
}

export interface TrainingReportData {
  training: {
    id: number;
    reference: string;
    topic: string;
    status: string;
    statusLabel: string;
    audience: string;
    audienceLabel: string;
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    deliveryMode: string;
    deliveryLabel: string;
    location: string;
    coordinates: string;
    notes: string;
    requestedOn: string;
    startDate: string;
    endDate: string;
    days: number;
  };
  patient: PatientSummary;
  doctor: DoctorSummary | null;
  sessions: TrainingReportSession[];
  totals: {
    sessions: number;
    completedSessions: number;
    inProgressSessions: number;
    pendingSessions: number;
    questions: number;
    challenges: number;
    progress: string;
  };
  /** Who the document is addressed to (coordinator team or the patient). */
  preparedFor: string;
  /** Who produced the document. */
  preparedBy: string;
}

const trainingReference = (id: number): string => `TRN-${String(id).padStart(5, "0")}`;

const endDateOf = (start: Date, days: number): string => {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(1, days) - 1);
  return formatIsoDate(end);
};

const coordinatesOf = (latitude: number | null, longitude: number | null, accuracy: number | null): string => {
  if (latitude == null || longitude == null) return branding.notProvided;
  const point = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  return accuracy == null ? point : `${point} (±${Math.round(accuracy)} m)`;
};

const audienceLabel = (audience: string): string =>
  audience === "individual" ? "Individual" : audience === "company" ? "Company" : titleCase(audience);

const deliveryLabel = (mode: string): string =>
  mode === "onsite" ? "Onsite" : mode === "online" ? "Online" : titleCase(mode);

export async function collectTrainingReport(
  actor: AuthUser,
  trainingId: number
): Promise<TrainingReportData> {
  const training = await prisma.trainingRequest.findUnique({
    where: { id: trainingId },
    include: {
      patient: { include: { patient: true } },
      doctor: {
        include: {
          user: true,
          specialties: { include: { specialty: true } },
          hospitals: { include: { hospital: true } },
        },
      },
      sessions: {
        include: { questions: { orderBy: { created_at: "asc" } } },
        orderBy: { session_number: "asc" },
      },
    },
  });
  if (!training) throw notFound("Training request not found.");

  if (actor.role === "patient" && training.patient_id !== actor.id) {
    throw forbidden("You can only print your own training report.");
  }
  if (actor.role === "doctor") {
    const doctor = await prisma.doctor.findUnique({ where: { user_id: actor.id } });
    if (!doctor || training.doctor_id !== doctor.id) {
      throw forbidden("This training is not assigned to you.");
    }
  }
  if (!["patient", "doctor", "coordinator", "admin"].includes(actor.role)) {
    throw forbidden();
  }

  const sessions: TrainingReportSession[] = training.sessions.map((session) => ({
    number: session.session_number,
    date: formatIsoDate(session.session_date),
    status: session.status,
    statusLabel: titleCase(session.status),
    started: session.started_at ? formatDateTime(session.started_at) : branding.notProvided,
    completed: session.completed_at ? formatDateTime(session.completed_at) : branding.notProvided,
    questions: session.questions.map((entry) => ({
      question: entry.question,
      challenge: entry.challenge?.trim() ? entry.challenge : branding.notProvided,
      recordedAt: formatDateTime(entry.created_at),
    })),
  }));

  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const inProgressSessions = sessions.filter((session) => session.status === "in_progress").length;
  const pendingSessions = sessions.filter((session) => session.status === "pending").length;
  const questions = sessions.reduce((total, session) => total + session.questions.length, 0);
  const challenges = sessions.reduce(
    (total, session) =>
      total + session.questions.filter((entry) => entry.challenge !== branding.notProvided).length,
    0
  );
  const progress = sessions.length > 0 ? `${Math.round((completedSessions / sessions.length) * 100)}%` : "0%";

  const doctor = training.doctor ? buildDoctorSummary(training.doctor) : null;
  const patient = buildPatientSummary(training.patient as PatientUserRow);
  const preparedBy =
    doctor?.name ??
    (actor.role === "patient" ? personName(actor) : "MediBook Zanzibar Coordination Team");

  return {
    training: {
      id: training.id,
      reference: trainingReference(training.id),
      topic: training.training_topic,
      status: training.status,
      statusLabel: titleCase(training.status),
      audience: training.audience,
      audienceLabel: audienceLabel(training.audience),
      companyName: notProvided(training.company_name),
      contactName: notProvided(training.contact_name),
      contactEmail: notProvided(training.contact_email),
      contactPhone: notProvided(training.contact_phone),
      deliveryMode: training.delivery_mode,
      deliveryLabel: deliveryLabel(training.delivery_mode),
      location: notProvided(training.location),
      coordinates: coordinatesOf(training.latitude, training.longitude, training.location_accuracy),
      notes: notProvided(training.notes),
      requestedOn: formatDateTime(training.created_at),
      startDate: formatIsoDate(training.preferred_start_date),
      endDate: endDateOf(training.preferred_start_date, training.preferred_days),
      days: training.preferred_days,
    },
    patient,
    doctor,
    sessions,
    totals: {
      sessions: sessions.length,
      completedSessions,
      inProgressSessions,
      pendingSessions,
      questions,
      challenges,
      progress,
    },
    preparedFor:
      actor.role === "patient" ? patient.name : "MediBook Zanzibar Coordination Team",
    preparedBy,
  };
}
