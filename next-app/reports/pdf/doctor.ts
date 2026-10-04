/**
 * Doctor's patient medical report renderer (§34 family 2).
 *
 * The document always shows BOTH parties: the patient whose chart it is and
 * the clinician who requested it, so a printed copy is self-attributing.
 */
import { branding, palette, type as typeScale } from "../design/tokens";
import type { DoctorReportData } from "../data/doctor";
import { paragraph, type SummaryCard } from "./components";
import type { ReportChrome, ReportDoc } from "./doc";
import { clinicalSections } from "./clinical";
import { doctorInformation, patientInformation, reportHeaderBody, summarySection } from "./sections";
import { footerNoteFor, renderReport, reportId } from "./render";

export const DOCTOR_REPORT_TITLE = "Patient Medical Report";

export function doctorChrome(data: DoctorReportData): ReportChrome {
  return {
    title: DOCTOR_REPORT_TITLE,
    subtitle: `${data.doctor.name} \u2014 ${data.doctor.specialties}`,
    periodLine: data.period.label,
    rightLine: data.patient.name,
    footerNote: footerNoteFor("doctor"),
  };
}

function summaryCardsFor(data: DoctorReportData): SummaryCard[] {
  return [
    { label: "Appointments", value: data.counts.appointments, detail: data.period.name, tone: "info" },
    { label: "Treatments", value: data.counts.treatments, detail: "Diagnoses recorded", tone: "primary" },
    { label: "Prescriptions", value: data.counts.prescriptions, detail: "Issued in period", tone: "primary" },
    { label: "Vital records", value: data.counts.vitals, detail: "Observations", tone: "success" },
    { label: "Lab tests", value: data.counts.labs, detail: "Ordered in period", tone: "warning" },
    { label: "Documents", value: data.counts.records, detail: "Health records", tone: "neutral" },
  ];
}

function drawBody(d: ReportDoc, data: DoctorReportData, id: string): void {
  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialMedical,
    title: DOCTOR_REPORT_TITLE,
    subtitle:
      "Confidential medical summary compiled from the patient's MediBook record by the treating doctor.",
    period: data.period.label,
    subject: `${data.patient.name} \u2014 ${data.patient.reference}`,
    preparedFor: data.patient.name,
    preparedBy: data.doctor.name,
  });

  summarySection(d, summaryCardsFor(data), "Record summary");
  patientInformation(d, data.patient);
  doctorInformation(d, data.doctor);
  clinicalSections(d, data.history);

  paragraph(
    d,
    `Scope: entries recorded by ${data.doctor.name} for ${data.patient.name} between ` +
      `${data.period.label}. Missing values are shown as "Not provided" and are never inferred. ` +
      "This document contains confidential medical information and must be handled accordingly.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

export async function renderDoctorReport(
  data: DoctorReportData,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const id = reportId(
    "doctor",
    generatedAt,
    `${data.patient.reference}:${data.doctor.reference}:${data.period.start}:${data.period.end}`
  );
  return await renderReport(doctorChrome(data), (d) => drawBody(d, data, id), generatedAt);
}
