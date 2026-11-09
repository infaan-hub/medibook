import { prisma } from "@/lib/db";
import { forbidden, notFound, conflict } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth";
import { branding } from "../design/tokens";
import { formatDateTime, formatIsoDate, notProvided, personName, titleCase } from "./format";
import { buildDoctorSummary, buildPatientSummary, type PatientUserRow } from "./people";
import type { DoctorSummary, PatientSummary } from "../pdf/sections";

export interface PsychotherapyReportSession {
  number: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  statusLabel: string;
  started: string;
  completed: string;
  confidentialNotes: string;
  medication: string;
}

export interface PsychotherapyReportData {
  request: {
    id: number;
    reference: string;
    status: string;
    statusLabel: string;
    sessionMode: string;
    urgency: string;
    language: string;
    genderPreference: string;
    notes: string;
    requestedOn: string;
    preferredStartDate: string;
    planGoals: string;
    planSessionDuration: string;
    planTotalSessions: string;
    planStartDate: string;
    planStartTime: string;
    planFollowupDate: string;
    planFollowupTime: string;
  };
  /** Alias kept for compatibility with report fixtures/tests. */
  psychotherapy?: PsychotherapyReportData["request"];
  patient: PatientSummary;
  doctor: DoctorSummary | null;
  sessions: PsychotherapyReportSession[];
  totals: { sessions: number; completed: number; progress: string };
  preparedFor: string;
  preparedBy: string;
  /** Whether the viewer may see confidential clinical content. */
  clinical: boolean;
}

const reference = (id: number): string => `PSY-${String(id).padStart(5, "0")}`;

export async function collectPsychotherapyReport(actor: AuthUser, requestId: number): Promise<PsychotherapyReportData> {
  const req = await prisma.psychotherapyRequest.findUnique({
    where: { id: requestId },
    include: {
      patient: { include: { patient: true } },
      doctor: { include: { user: true, specialties: { include: { specialty: true } }, hospitals: { include: { hospital: true } } } },
      sessions: {
        include: {
          medication_record: true,
          treatment: { include: { prescriptions: { include: { items: true } } } },
        },
        orderBy: { session_number: "asc" },
      },
    },
  });
  if (!req) throw notFound("Psychotherapy request not found.");

  if (actor.role === "patient" && req.patient_id !== actor.id) {
    throw forbidden("You can only print your own psychotherapy report.");
  }
  let clinical = false;
  if (actor.role === "doctor") {
    const doctor = await prisma.doctor.findUnique({ where: { user_id: actor.id } });
    if (!doctor || req.doctor_id !== doctor.id) throw forbidden("This psychotherapy case is not assigned to you.");
    clinical = true;
  } else if (actor.role === "coordinator" || actor.role === "admin") {
    clinical = false;
  } else if (actor.role !== "patient") {
    throw forbidden();
  }
  if (req.status !== "completed") throw conflict("The psychotherapy report is available after all sessions are marked Done.");

  const sessions: PsychotherapyReportSession[] = req.sessions.map((s) => {
    let medication: string = branding.notProvided;
    if (clinical && s.medication_record) {
      const record = s.medication_record;
      const items = Array.isArray(record.items)
        ? record.items.map((item: any) => [item.medication, item.dosage, item.frequency].filter(Boolean).join(" — ")).filter(Boolean).join("; ")
        : "";
      medication = [record.diagnosis, record.treatment_notes, items].filter(Boolean).join(". ") || branding.notProvided;
    } else if (clinical && s.treatment) {
      const rx = s.treatment.prescriptions?.[0];
      const items = rx?.items?.map((i) => `${i.medication} ${i.dosage}`).join(", ") ?? "";
      medication = items || s.treatment.prescription || branding.notProvided;
    }
    return {
      number: s.session_number,
      date: formatIsoDate(s.scheduled_date),
      startTime: s.start_time?.slice(0, 5) ?? branding.notProvided,
      endTime: s.end_time?.slice(0, 5) ?? branding.notProvided,
      status: s.status,
      statusLabel: titleCase(s.status),
      started: s.started_at ? formatDateTime(s.started_at) : branding.notProvided,
      completed: s.completed_at ? formatDateTime(s.completed_at) : branding.notProvided,
      confidentialNotes: clinical ? notProvided(s.confidential_notes) : "Confidential — not disclosed",
      medication: clinical ? medication : branding.notProvided,
    };
  });

  const completed = sessions.filter((s) => s.status === "completed").length;
  const progress = sessions.length > 0 ? `${Math.round((completed / sessions.length) * 100)}%` : "0%";

  const doctor = req.doctor ? buildDoctorSummary(req.doctor) : null;
  const patient = buildPatientSummary(req.patient as PatientUserRow);
  const preparedBy = doctor?.name ?? (actor.role === "patient" ? personName(actor) : "MediBook Zanzibar Coordination Team");

  const result = {
    request: {
      id: req.id,
      reference: reference(req.id),
      status: req.status,
      statusLabel: titleCase(req.status),
      sessionMode: req.session_mode === "in_person" ? "In person" : "Online",
      urgency: titleCase(req.urgency),
      language: titleCase(req.language_preference),
      genderPreference: titleCase(req.gender_preference),
      notes: notProvided(req.notes),
      requestedOn: formatDateTime(req.created_at),
      preferredStartDate: formatIsoDate(req.preferred_start_date),
      planGoals: notProvided(req.plan_goals),
      planSessionDuration: req.plan_session_duration ? `${req.plan_session_duration} min` : branding.notProvided,
      planTotalSessions: req.plan_total_sessions ? String(req.plan_total_sessions) : branding.notProvided,
      planStartDate: formatIsoDate(req.plan_start_date),
      planStartTime: req.plan_start_time ? req.plan_start_time.slice(0, 5) : branding.notProvided,
      planFollowupDate: formatIsoDate(req.plan_followup_date),
      planFollowupTime: req.plan_followup_time ? req.plan_followup_time.slice(0, 5) : branding.notProvided,
    },
    patient,
    doctor,
    sessions,
    totals: { sessions: sessions.length, completed, progress },
    preparedFor: actor.role === "patient" ? patient.name : "MediBook Zanzibar Coordination Team",
    preparedBy,
    clinical,
  };
  // alias
  (result as any).psychotherapy = result.request;
  return result;
}
