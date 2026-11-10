/**
 * Training report renderer — the PDF behind the doctor's and coordinator's
 * "Training report" action.
 *
 * Reuses the shared MediBook chrome, summary cards, information tables and
 * section headings so the training document reads exactly like the other
 * report families. The content is training-specific: request details, the
 * participant and specialist, the day-by-day schedule and every question /
 * challenge captured during the sessions.
 */
import {
  branding,
  palette,
  space,
  trainingStatusTone,
  type as typeScale,
} from "../design/tokens";
import type { TrainingReportData } from "../data/training";
import {
  dataTable,
  divider,
  emptyNote,
  fieldBlock,
  infoTable,
  paragraph,
  sectionTitle,
  subsectionTitle,
  type InfoRow,
  type SummaryCard,
  type TableColumn,
} from "./components";
import type { ReportChrome, ReportDoc } from "./doc";
import { reportHeaderBody, summarySection } from "./sections";
import { renderReport, reportId } from "./render";

export const TRAINING_REPORT_TITLE = "Training Report";

export function trainingChrome(data: TrainingReportData): ReportChrome {
  const dayLabel = `${data.training.days} day${data.training.days === 1 ? "" : "s"}`;
  return {
    title: TRAINING_REPORT_TITLE,
    subtitle: `${data.training.topic} \u2014 ${data.patient.name}`,
    periodLine: `${data.training.startDate} \u00b7 ${dayLabel} \u00b7 ${data.training.deliveryLabel}`,
    rightLine: data.doctor?.name ?? "Specialist not yet assigned",
    footerNote: branding.confidentialTraining,
  };
}

function summaryCardsFor(data: TrainingReportData): SummaryCard[] {
  const { totals, training } = data;
  const complete = totals.sessions > 0 && totals.completedSessions === totals.sessions;
  return [
    {
      label: "Sessions",
      value: String(totals.sessions),
      detail: `${totals.completedSessions} completed`,
      tone: "primary",
    },
    {
      label: "Progress",
      value: totals.progress,
      detail: `${totals.completedSessions} of ${totals.sessions} sessions delivered`,
      tone: complete ? "success" : "info",
    },
    {
      label: "Questions captured",
      value: String(totals.questions),
      detail: "Across all sessions",
      tone: "info",
    },
    {
      label: "Challenges",
      value: String(totals.challenges),
      detail: "Recorded by the specialist",
      tone: "warning",
    },
    {
      label: "Delivery",
      value: training.deliveryLabel,
      detail:
        training.deliveryMode === "onsite" && training.location !== branding.notProvided
          ? training.location
          : "Remote delivery",
      tone: "neutral",
    },
    {
      label: "Audience",
      value: training.audienceLabel,
      detail:
        training.audience === "company" && training.companyName !== branding.notProvided
          ? training.companyName
          : "Patient request",
      tone: "violet",
    },
  ];
}

const SESSION_COLUMNS: TableColumn[] = [
  { key: "numberLabel", label: "Session", weight: 0.8, align: "center" },
  { key: "date", label: "Date", weight: 1.5 },
  {
    key: "statusLabel",
    label: "Status",
    weight: 1.2,
    tone: (_value, row) => trainingStatusTone(row.status),
  },
  { key: "started", label: "Started", weight: 1.7 },
  { key: "completed", label: "Completed", weight: 1.7 },
  { key: "questions", label: "Questions", weight: 0.9, align: "right" },
];

function requestRows(data: TrainingReportData): InfoRow[] {
  const { training } = data;
  const dayLabel = `${training.days} day${training.days === 1 ? "" : "s"}`;
  const rows: InfoRow[] = [
    { label: "Training ID", value: training.reference, strong: true },
    { label: "Training topic", value: training.topic, strong: true },
    { label: "Status", value: training.statusLabel },
    { label: "Audience", value: training.audienceLabel },
  ];
  if (training.audience === "company") {
    rows.push({ label: "Company", value: training.companyName });
  }
  rows.push(
    { label: "Delivery mode", value: training.deliveryLabel }
  );
  if (training.deliveryMode === "onsite") {
    rows.push(
      { label: "Training location", value: training.location },
      { label: "Coordinates", value: training.coordinates }
    );
  }
  rows.push(
    { label: "Preferred start", value: training.startDate },
    { label: "Duration", value: dayLabel },
    { label: "Planned end", value: training.endDate },
    { label: "Requested on", value: training.requestedOn },
    { label: "Assigned specialist", value: data.doctor?.name ?? "Not yet assigned" }
  );
  return rows;
}

function participantRows(data: TrainingReportData): InfoRow[] {
  const { patient, training } = data;
  const rows: InfoRow[] = [
    { label: "Patient", value: patient.name, strong: true },
    { label: "Patient ID", value: patient.reference },
    { label: "Phone", value: patient.phone },
    { label: "Email", value: patient.email },
    { label: "Registered on", value: patient.registeredOn },
  ];
  if (training.audience === "company") {
    rows.push(
      { label: "Company", value: training.companyName },
      { label: "Contact name", value: training.contactName },
      { label: "Contact email", value: training.contactEmail },
      { label: "Contact phone", value: training.contactPhone }
    );
  }
  return rows;
}

function specialistRows(data: TrainingReportData): InfoRow[] {
  const doctor = data.doctor;
  if (!doctor) return [];
  return [
    { label: "Specialist", value: doctor.name, strong: true },
    { label: "Specialist ID", value: doctor.reference },
    { label: "Specialties", value: doctor.specialties },
    { label: "Qualifications", value: doctor.qualifications },
    { label: "Experience", value: doctor.experience },
    { label: "Practising at", value: doctor.hospital },
    { label: "Phone", value: doctor.phone },
    { label: "Email", value: doctor.email },
    { label: "Registered on", value: doctor.joinedOn },
  ];
}

function outcomeText(data: TrainingReportData): string {
  switch (data.training.status) {
    case "completed":
      return `This training has been completed. ${data.totals.completedSessions} of ${data.totals.sessions} planned sessions were delivered, and every question and challenge captured by the specialist is reproduced in this document.`;
    case "cancelled":
      return "This training was cancelled. This document is the final record of the request and any sessions delivered before cancellation.";
    case "expired":
      return "This training expired because a session was not started before its scheduled time. This document is the final record of the request and any sessions delivered before expiry.";
    case "in_progress":
      return `This training is currently in progress. ${data.totals.completedSessions} of ${data.totals.sessions} sessions are complete; this document is a snapshot of the record at the time of generation.`;
    case "accepted":
      return "A specialist has been assigned to this training. No session has started yet; the schedule above reflects the planned delivery dates.";
    default:
      return "This training request has not yet been accepted by the coordination team. The schedule above reflects the requested delivery dates.";
  }
}

function drawBody(d: ReportDoc, data: TrainingReportData, id: string): void {
  const { training, totals, doctor } = data;
  const dayLabel = `${training.days} day${training.days === 1 ? "" : "s"}`;

  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialTraining,
    title: TRAINING_REPORT_TITLE,
    subtitle:
      "A complete record of this training request, its delivery schedule and the questions and challenges captured during each session.",
    period: `${training.startDate} \u2014 ${training.endDate}`,
    subject: `${training.topic} \u2014 ${data.patient.name}`,
    preparedFor: data.preparedFor,
    preparedBy: data.preparedBy,
  });

  summarySection(d, summaryCardsFor(data), "Training summary");

  sectionTitle(d, {
    title: "Training request",
    eyebrow: "Section 1",
    subtitle: "The request as submitted, including its audience, delivery mode and timing.",
  });
  infoTable(d, requestRows(data), { labelRatio: 0.29 });
  if (training.notes !== branding.notProvided) {
    fieldBlock(d, { label: "Request notes", value: training.notes });
  }
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Participant information",
    eyebrow: "Section 2",
    subtitle: "The patient this training is for and, for company requests, the booking contact.",
  });
  infoTable(d, participantRows(data), { labelRatio: 0.29 });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Specialist information",
    eyebrow: "Section 3",
    subtitle: "The clinician assigned by the coordination team to deliver the training.",
  });
  if (doctor) {
    infoTable(d, specialistRows(data), { labelRatio: 0.29 });
  } else {
    emptyNote(d, "No specialist has been assigned to this training yet.");
  }
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Session schedule",
    eyebrow: "Section 4",
    subtitle: `${dayLabel} planned from ${training.startDate}. Each session's status, start and completion times are recorded below.`,
  });
  dataTable(d, {
    columns: SESSION_COLUMNS,
    rows: data.sessions.map((session) => ({
      numberLabel: `#${session.number}`,
      date: session.date,
      status: session.status,
      statusLabel: session.statusLabel,
      started: session.started,
      completed: session.completed,
      questions: String(session.questions.length),
    })),
    emptyText: "No sessions have been scheduled for this training yet.",
    rowMinHeight: 26,
  });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Questions and challenges",
    eyebrow: "Section 5",
    subtitle: "Every question asked during the training and the challenge or note the specialist recorded against it.",
  });
  const logged = data.sessions.filter((session) => session.questions.length > 0);
  if (logged.length === 0) {
    emptyNote(d, "No questions or challenges have been recorded for this training yet.");
  } else {
    logged.forEach((session, index) => {
      subsectionTitle(d, `Session ${session.number} \u00b7 ${session.date} \u00b7 ${session.statusLabel}`);
      session.questions.forEach((entry, questionIndex) => {
        fieldBlock(d, {
          label: `Question ${questionIndex + 1}`,
          value: entry.question,
          meta: `Recorded ${entry.recordedAt}`,
        });
        if (entry.challenge !== branding.notProvided) {
          fieldBlock(d, {
            label: "Challenge / notes",
            value: entry.challenge,
          });
        }
      });
      if (index < logged.length - 1) divider(d, space[3]);
    });
  }
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Training outcome",
    eyebrow: "Section 6",
    subtitle: "Delivery totals and the final status of this training record.",
  });
  infoTable(d, [
    { label: "Sessions delivered", value: `${totals.completedSessions} of ${totals.sessions}`, strong: true },
    { label: "Sessions in progress", value: String(totals.inProgressSessions) },
    { label: "Sessions pending", value: String(totals.pendingSessions) },
    { label: "Questions captured", value: String(totals.questions) },
    { label: "Challenges recorded", value: String(totals.challenges) },
    { label: "Final status", value: training.statusLabel, strong: true },
  ], { labelRatio: 0.31 });
  paragraph(d, outcomeText(data), {
    size: typeScale.sm,
    color: palette.text,
    accent: true,
    background: palette.surfaceAlt,
  });
  d.moveDown(space[3]);

  paragraph(
    d,
    "Scope: this document records one training request held by MediBook Zanzibar, its planned sessions " +
      "and the questions and challenges captured by the assigned specialist. Missing values are shown as " +
      "\"Not provided\" and are never inferred. This document contains confidential training information " +
      "and must be handled accordingly.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

export async function renderTrainingReport(
  data: TrainingReportData,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const id = reportId("training", generatedAt, `${data.training.reference}:${data.training.status}`);
  return await renderReport(trainingChrome(data), (d) => drawBody(d, data, id), generatedAt);
}
