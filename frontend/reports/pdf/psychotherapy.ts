import {
  branding,
  palette,
  space,
  trainingStatusTone,
  type as typeScale,
} from "../design/tokens";
import type { PsychotherapyReportData } from "../data/psychotherapy";
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

export const PSYCHOTHERAPY_REPORT_TITLE = "Psychotherapy Report";

export function psychotherapyChrome(data: PsychotherapyReportData): ReportChrome {
  const request = (data.request ?? data.psychotherapy)!;
  return {
    title: PSYCHOTHERAPY_REPORT_TITLE,
    subtitle: `Psychology service \u2014 ${data.patient.name}`,
    periodLine: `${data.request.planStartDate} \u00b7 ${data.request.planSessionDuration}`,
    rightLine: data.doctor?.name ?? "Psychologist not yet assigned",
    footerNote: branding.confidentialPsychotherapy,
  };
}

function summaryCardsFor(data: PsychotherapyReportData): SummaryCard[] {
  const { totals } = data;
  const request = (data.request ?? data.psychotherapy)!;
  const complete = totals.sessions > 0 && totals.completed === totals.sessions;
  return [
    { label: "Sessions", value: String(totals.sessions), detail: `${totals.completed} completed`, tone: "primary" },
    { label: "Progress", value: totals.progress, detail: `${totals.completed} of ${totals.sessions} sessions delivered`, tone: complete ? "success" : "info" },
    { label: "Follow-up time", value: request.planFollowupTime, detail: "Sessions", tone: "violet" },
    { label: "Duration", value: request.planSessionDuration, detail: "Per session", tone: "neutral" },
    { label: "Status", value: request.statusLabel, detail: "Case status", tone: "info" },
  ];
}

const SESSION_COLUMNS: TableColumn[] = [
  { key: "numberLabel", label: "Session", weight: 0.8, align: "center" },
  { key: "date", label: "Date", weight: 1.3 },
  { key: "time", label: "Time", weight: 1.2 },
  { key: "statusLabel", label: "Status", weight: 1.1, tone: (_value, row) => trainingStatusTone(row.status) },
  { key: "started", label: "Started", weight: 1.5 },
  { key: "completed", label: "Completed", weight: 1.5 },
];

function requestRows(data: PsychotherapyReportData): InfoRow[] {
  const { request } = data;
  const rows: InfoRow[] = [
    { label: "Request ID", value: request.reference, strong: true },
    { label: "Status", value: request.statusLabel },
    { label: "Session mode", value: request.sessionMode },
    { label: "Urgency", value: request.urgency },
    { label: "Language", value: request.language },
    { label: "Gender preference", value: request.genderPreference },
    { label: "Preferred start", value: request.preferredStartDate },
    { label: "Requested on", value: request.requestedOn },
  ];
  rows.push(
    { label: "Goals", value: request.planGoals },
    { label: "Current session time", value: request.planStartTime },
    { label: "Follow-up session time", value: request.planFollowupTime },
    { label: "Session duration", value: request.planSessionDuration },
    { label: "Planned sessions", value: request.planTotalSessions },
    { label: "Plan start", value: request.planStartDate }
  );
  return rows;
}

function participantRows(data: PsychotherapyReportData): InfoRow[] {
  const { patient } = data;
  return [
    { label: "Patient", value: patient.name, strong: true },
    { label: "Patient ID", value: patient.reference },
    { label: "Phone", value: patient.phone },
    { label: "Email", value: patient.email },
    { label: "Registered on", value: patient.registeredOn },
  ];
}

function specialistRows(data: PsychotherapyReportData): InfoRow[] {
  const doctor = data.doctor;
  if (!doctor) return [];
  return [
    { label: "Psychologist", value: doctor.name, strong: true },
    { label: "ID", value: doctor.reference },
    { label: "Specialties", value: doctor.specialties },
    { label: "Qualifications", value: doctor.qualifications },
    { label: "Experience", value: doctor.experience },
    { label: "Practising at", value: doctor.hospital },
    { label: "Phone", value: doctor.phone },
    { label: "Email", value: doctor.email },
  ];
}

function drawBody(d: ReportDoc, data: PsychotherapyReportData, id: string): void {
  const request = (data.request ?? data.psychotherapy)!;
  const { totals, doctor } = data;

  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialPsychotherapy,
    title: PSYCHOTHERAPY_REPORT_TITLE,
    subtitle: "A complete record of this psychotherapy case, its planned sessions and clinical notes.",
    period: `${request.planStartDate} \u2014 ${request.planStartTime}`,
    subject: `Psychology service \u2014 ${data.patient.name}`,
    preparedFor: data.preparedFor,
    preparedBy: data.preparedBy,
  });

  summarySection(d, summaryCardsFor(data), "Case summary");

  sectionTitle(d, { title: "Request details", eyebrow: "Section 1", subtitle: "The request as submitted and the agreed treatment plan." });
  infoTable(d, requestRows(data), { labelRatio: 0.29 });
  if (request.notes !== branding.notProvided) {
    fieldBlock(d, { label: "Request notes", value: request.notes });
  }
  d.moveDown(space[3]);

  sectionTitle(d, { title: "Patient information", eyebrow: "Section 2" });
  infoTable(d, participantRows(data), { labelRatio: 0.29 });
  d.moveDown(space[3]);

  sectionTitle(d, { title: "Psychologist information", eyebrow: "Section 3" });
  if (doctor) infoTable(d, specialistRows(data), { labelRatio: 0.29 });
  else emptyNote(d, "No psychologist has been assigned to this case yet.");
  d.moveDown(space[3]);

  sectionTitle(d, { title: "Session schedule", eyebrow: "Section 4" });
  dataTable(d, {
    columns: SESSION_COLUMNS,
    rows: data.sessions.map((s) => ({
      numberLabel: `#${s.number}`,
      date: s.date,
      time: `${s.startTime} \u2013 ${s.endTime}`,
      status: s.status,
      statusLabel: s.statusLabel,
      started: s.started,
      completed: s.completed,
    })),
    emptyText: "No sessions have been scheduled for this case yet.",
    rowMinHeight: 26,
  });
  d.moveDown(space[3]);

  if (data.clinical) {
    sectionTitle(d, { title: "Confidential clinical notes", eyebrow: "Section 5", subtitle: "Visible only to the assigned psychologist." });
    const noted = data.sessions.filter((s) => s.confidentialNotes !== branding.notProvided && s.confidentialNotes !== "Confidential — not disclosed");
    if (noted.length === 0) {
      emptyNote(d, "No confidential notes have been recorded.");
    } else {
      noted.forEach((s, i) => {
        subsectionTitle(d, `Session ${s.number} \u00b7 ${s.date}`);
        fieldBlock(d, { label: "Confidential notes", value: s.confidentialNotes });
        if (s.medication !== branding.notProvided) {
          fieldBlock(d, { label: "Medication", value: s.medication });
        }
        if (i < noted.length - 1) divider(d, space[3]);
      });
    }
    d.moveDown(space[3]);
  }

  sectionTitle(d, { title: "Outcome", eyebrow: data.clinical ? "Section 6" : "Section 5" });
  infoTable(d, [
    { label: "Sessions delivered", value: `${totals.completed} of ${totals.sessions}`, strong: true },
    { label: "Final status", value: request.statusLabel, strong: true },
  ], { labelRatio: 0.31 });
  d.moveDown(space[3]);

  paragraph(
    d,
    "Scope: this document records one psychotherapy case held by MediBook Zanzibar. Confidential notes and medication " +
      "are included only for the assigned psychologist; all other viewers receive the schedule and plan only. " +
      "Missing values are shown as \"Not provided\" and are never inferred.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

export async function renderPsychotherapyReport(data: PsychotherapyReportData, generatedAt: Date = new Date()): Promise<Buffer> {
  const id = reportId("psychotherapy", generatedAt, `${data.request.reference}:${data.request.status}`);
  return await renderReport(psychotherapyChrome(data), (d) => drawBody(d, data, id), generatedAt);
}