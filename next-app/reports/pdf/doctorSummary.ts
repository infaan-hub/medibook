/**
 * Doctor PRACTICE SUMMARY renderer (§34 family 2b) — the PDF behind the doctor's
 * "Generate doctor report" button: how many patients, appointments and emergency
 * requests they handled, with the two lifecycle breakdowns and their busiest
 * patients.
 *
 * Reuses the same chrome, summary cards and data tables as the other report
 * families so the document reads identically to the admin and patient reports.
 */
import { branding, palette, type as typeScale } from "../design/tokens";
import type { DoctorSummaryData } from "../data/doctorSummary";
import { dataTable, paragraph, sectionTitle, type SummaryCard, type TableColumn, type TableRow } from "./components";
import type { ReportDoc } from "./doc";
import { doctorInformation, reportHeaderBody, summarySection } from "./sections";
import { footerNoteFor, renderReport, reportId } from "./render";

export const DOCTOR_SUMMARY_TITLE = "Practice Summary";

export function doctorSummaryChrome(data: DoctorSummaryData) {
  return {
    title: DOCTOR_SUMMARY_TITLE,
    subtitle: `${data.doctor.name} \u2014 ${data.doctor.specialties}`,
    periodLine: data.period.label,
    rightLine: `Patients: ${data.totals.patients}`,
    footerNote: footerNoteFor("doctor"),
  };
}

function summaryCardsFor(data: DoctorSummaryData): SummaryCard[] {
  return [
    { label: "Patients", value: data.totals.patients, detail: `${data.totals.periodPatients} in period`, tone: "primary" },
    { label: "Appointments", value: data.totals.appointments, detail: `${data.totals.periodAppointments} in period`, tone: "info" },
    { label: "Emergencies", value: data.totals.emergencies, detail: `${data.totals.periodEmergencies} in period`, tone: "warning" },
    { label: "Completed visits", value: data.totals.completed, detail: "Appointments closed as done", tone: "success" },
    { label: "Treatments", value: data.totals.treatments, detail: "Diagnoses recorded", tone: "primary" },
    { label: "Prescriptions", value: data.totals.prescriptions, detail: "Issued to patients", tone: "primary" },
    { label: "Vital records", value: data.totals.vitals, detail: "Observations", tone: "success" },
    { label: "Lab tests", value: data.totals.labs, detail: "Ordered", tone: "warning" },
    { label: "Documents", value: data.totals.records, detail: "Health records", tone: "neutral" },
  ];
}

const BREAKDOWN_COLUMNS: TableColumn[] = [
  { key: "label", label: "Status", weight: 2 },
  { key: "count", label: "Count", weight: 1, align: "right" },
  { key: "share", label: "Share", weight: 1, align: "right" },
];

const PATIENT_COLUMNS: TableColumn[] = [
  { key: "name", label: "Patient", weight: 3 },
  { key: "reference", label: "Reference", weight: 2 },
  { key: "appointments", label: "Appointments", weight: 1, align: "right" },
  { key: "emergencies", label: "Emergencies", weight: 1, align: "right" },
  { key: "lastSeen", label: "Last seen", weight: 2, align: "right" },
];

/** `dataTable` takes plain string rows, so the view models are flattened here. */
const breakdownRows = (rows: DoctorSummaryData["appointmentBreakdown"]): TableRow[] =>
  rows.map((row) => ({ label: row.label, count: row.count, share: row.share }));

function drawBody(d: ReportDoc, data: DoctorSummaryData, id: string): void {
  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialMedical,
    title: DOCTOR_SUMMARY_TITLE,
    subtitle:
      "Practice activity summary for the reporting period: patients treated, appointments handled and emergency requests received.",
    period: data.period.label,
    subject: data.doctor.name,
    preparedFor: data.doctor.name,
    preparedBy: data.doctor.name,
  });

  summarySection(d, summaryCardsFor(data), "Practice summary");
  doctorInformation(d, data.doctor);

  sectionTitle(d, {
    title: "Appointments by status",
    eyebrow: "Section 1",
    subtitle: `Lifecycle status of the ${data.totals.periodAppointments} appointments dated inside the period.`,
  });
  dataTable(d, {
    columns: BREAKDOWN_COLUMNS,
    rows: breakdownRows(data.appointmentBreakdown),
    zebra: true,
    emptyText: "No appointments dated inside this period.",
  });

  sectionTitle(d, {
    title: "Emergency requests",
    eyebrow: "Section 2",
    subtitle: `${data.totals.periodEmergencies} emergency appointments dated inside the period, by lifecycle status.`,
  });
  dataTable(d, {
    columns: BREAKDOWN_COLUMNS,
    rows: breakdownRows(data.emergencyBreakdown),
    zebra: true,
    emptyText: "No emergency requests dated inside this period.",
  });

  sectionTitle(d, {
    title: "Patients by activity",
    eyebrow: "Section 3",
    subtitle: `The ${data.totals.patients} patients recorded for this doctor, busiest first.`,
  });
  dataTable(d, {
    columns: PATIENT_COLUMNS,
    rows: data.patients.map((row) => ({
      name: row.name,
      reference: row.reference,
      appointments: row.appointments,
      emergencies: row.emergencies,
      lastSeen: row.lastSeen,
    })),
    zebra: true,
    emptyText: "No patients recorded for this doctor yet.",
  });
  if (data.patientsTruncated) {
    paragraph(
      d,
      `Only the busiest ${data.patients.length} patients are listed; the totals above cover all ${data.totals.patients}.`,
      { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
    );
  }

  paragraph(
    d,
    "Scope: this document summarises the signed-in doctor's own practice only, between " +
      `${data.period.label}. Lifetime totals cover everything recorded to date. Generated by ` +
      `${data.doctor.name}. This document contains confidential medical information and must ` +
      "be handled accordingly.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

export async function renderDoctorSummaryReport(
  data: DoctorSummaryData,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const id = reportId(
    "doctor",
    generatedAt,
    `summary:${data.doctor.reference}:${data.period.start}:${data.period.end}`
  );
  return await renderReport(doctorSummaryChrome(data), (d) => drawBody(d, data, id), generatedAt);
}