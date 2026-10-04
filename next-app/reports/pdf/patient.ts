/**
 * Patient medical report renderer (§34 family 3) — "my own record".
 *
 * The patient is both subject and recipient, so the cover addresses them
 * directly and no other party's details are printed.
 */
import { branding, palette, type as typeScale } from "../design/tokens";
import type { PatientReportData } from "../data/patient";
import { paragraph, type SummaryCard } from "./components";
import type { ReportChrome, ReportDoc } from "./doc";
import { clinicalSections } from "./clinical";
import { patientInformation, reportHeaderBody, summarySection } from "./sections";
import { footerNoteFor, renderReport, reportId } from "./render";

export const PATIENT_REPORT_TITLE = "My Medical Report";

export function patientChrome(data: PatientReportData): ReportChrome {
  return {
    title: PATIENT_REPORT_TITLE,
    subtitle: "Your health record, as held by MediBook Zanzibar",
    periodLine: data.period.label,
    rightLine: data.patient.name,
    footerNote: footerNoteFor("patient"),
  };
}

function summaryCardsFor(data: PatientReportData): SummaryCard[] {
  return [
    { label: "Appointments", value: data.counts.appointments, detail: data.period.name, tone: "info" },
    { label: "Treatments", value: data.counts.treatments, detail: "Diagnoses recorded", tone: "primary" },
    { label: "Prescriptions", value: data.counts.prescriptions, detail: "Issued to you", tone: "primary" },
    { label: "Vital records", value: data.counts.vitals, detail: "Observations", tone: "success" },
    { label: "Lab tests", value: data.counts.labs, detail: "Ordered for you", tone: "warning" },
    { label: "Documents", value: data.counts.records, detail: "Health records", tone: "neutral" },
  ];
}

function drawBody(d: ReportDoc, data: PatientReportData, id: string): void {
  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialMedical,
    title: PATIENT_REPORT_TITLE,
    subtitle:
      "A copy of the medical information MediBook Zanzibar holds for you, generated on request for your own use.",
    period: data.period.label,
    subject: `${data.patient.name} \u2014 ${data.patient.reference}`,
    preparedFor: data.patient.name,
    preparedBy: "MediBook Zanzibar Reporting Service",
  });

  summarySection(d, summaryCardsFor(data), "Record summary");
  patientInformation(d, data.patient);
  clinicalSections(d, data.history);

  paragraph(
    d,
    `Scope: everything on your record between ${data.period.label}. Missing values are shown as ` +
      "\"Not provided\" — nothing in this document is inferred. If a detail is wrong, update it in " +
      "Medical Details or raise it with your doctor.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

export async function renderPatientReport(
  data: PatientReportData,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const id = reportId(
    "patient",
    generatedAt,
    `${data.patient.reference}:${data.period.start}:${data.period.end}`
  );
  return await renderReport(patientChrome(data), (d) => drawBody(d, data, id), generatedAt);
}
