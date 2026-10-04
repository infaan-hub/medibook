/**
 * Clinical sections shared by the doctor and patient report renderers.
 *
 * Every section draws the same shapes for the same records, so a chart looks
 * identical whether the clinician or the patient is reading it — only the
 * cover and the surrounding identity blocks differ.
 */
import { labFlagTone, labStatusTone, palette, space, statusTone, type as typeScale } from "../design/tokens";
import type {
  AppointmentEntry,
  ClinicalHistory,
  LabEntry,
  PrescriptionEntry,
  RecordEntry,
  TreatmentEntry,
  VitalEntry,
} from "../data/clinical";
import {
  dataTable,
  doctorAttribution,
  divider,
  emptyNote,
  fieldBlock,
  infoTable,
  paragraph,
  sectionTitle,
  subsectionTitle,
  type TableColumn,
} from "./components";
import type { ReportDoc } from "./doc";

/* ============================== Appointments ============================= */

export function appointmentsSection(d: ReportDoc, rows: AppointmentEntry[]): void {
  sectionTitle(d, {
    title: "Appointments",
    eyebrow: "Appointments",
    subtitle: "Every appointment booked in the reporting period.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No appointments were booked in this period.");
    d.moveDown(space[3]);
    return;
  }
  const columns: TableColumn[] = [
    { key: "date", label: "Date", weight: 1.35 },
    { key: "bookedAt", label: "Booked", weight: 1.35 },
    { key: "time", label: "Time", weight: 1.05 },
    { key: "type", label: "Type", weight: 0.8 },
    {
      key: "status",
      label: "Status",
      weight: 1.05,
      tone: (_value, row) => statusTone(row.statusKey ?? ""),
    },
    { key: "reason", label: "Reason", weight: 1.9 },
    { key: "doctor", label: "Clinician", weight: 1.7 },
  ];
  dataTable(d, {
    columns,
    rows: rows.map((row) => ({ ...row })),
    emptyText: "No appointments were booked in this period.",
  });

  // Booking/cancellation/emergency context — every extra stamp the database
  // carries for the rows above, so nothing recorded is left off the printout.
  const withDetails = rows.filter((row) => row.details);
  if (withDetails.length > 0) {
    d.moveDown(space[1]);
    for (const row of withDetails) {
      paragraph(d, `${row.date}, ${row.time} — ${row.details}`, {
        size: typeScale.micro,
        color: palette.textMuted,
      });
    }
  }
  d.moveDown(space[3]);
}

/* =============================== Treatments ============================== */

export function treatmentsSection(d: ReportDoc, rows: TreatmentEntry[]): void {
  sectionTitle(d, {
    title: "Medical treatments",
    eyebrow: "Treatments",
    subtitle: "Diagnoses and treatment notes entered by the treating doctor.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No treatments were recorded in this period.");
    d.moveDown(space[3]);
    return;
  }

  rows.forEach((row, index) => {
    subsectionTitle(d, `${index + 1}. ${row.diagnosis}`);
    infoTable(d, [
      { label: "Recorded", value: row.date },
      { label: "Appointment", value: row.appointmentDate },
      { label: "Follow-up", value: row.followUp, strong: row.followUp !== "Not scheduled" },
    ]);
    fieldBlock(d, { label: "Treatment notes", value: row.treatmentNotes });
    if (row.prescriptionNotes) {
      fieldBlock(d, { label: "Prescription (free text)", value: row.prescriptionNotes });
    }
    if (row.followUpNotes) {
      fieldBlock(d, { label: "Follow-up notes", value: row.followUpNotes });
    }
    if (row.attribution) doctorAttribution(d, row.attribution);
    if (index < rows.length - 1) divider(d, space[4]);
  });
  d.moveDown(space[3]);
}

/* ============================== Prescriptions ============================ */

export function prescriptionsSection(d: ReportDoc, rows: PrescriptionEntry[]): void {
  sectionTitle(d, {
    title: "Prescriptions",
    eyebrow: "Medication",
    subtitle: "Structured e-prescriptions issued in the reporting period.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No prescriptions were issued in this period.");
    d.moveDown(space[3]);
    return;
  }

  const columns: TableColumn[] = [
    { key: "medication", label: "Medication", weight: 1.9, font: "semibold" },
    { key: "dosage", label: "Dosage", weight: 0.95 },
    { key: "frequency", label: "Frequency", weight: 1.15 },
    { key: "route", label: "Route", weight: 0.85 },
    { key: "duration", label: "Duration", weight: 0.95 },
    { key: "refills", label: "Refills", weight: 0.7 },
    { key: "instructions", label: "Instructions", weight: 1.9 },
  ];

  rows.forEach((row, index) => {
    subsectionTitle(d, `${index + 1}. Issued ${row.date}`);
    const items = row.items.map((item) => ({ ...item }));
    dataTable(d, {
      columns,
      rows: items,
      emptyText: "This prescription carries no medication lines.",
      rowMinHeight: 20,
    });
    d.moveDown(space[1]);
    if (row.notes) paragraph(d, `Notes: ${row.notes}`, { size: typeScale.sm, color: palette.textMuted });
    if (row.attribution) doctorAttribution(d, row.attribution);
    if (index < rows.length - 1) divider(d, space[4]);
  });
  d.moveDown(space[3]);
}

/* ================================= Vitals ================================ */

export function vitalsSection(d: ReportDoc, rows: VitalEntry[]): void {
  sectionTitle(d, {
    title: "Vital signs",
    eyebrow: "Observations",
    subtitle: "Measurements recorded during the reporting period.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No vital signs were recorded in this period.");
    d.moveDown(space[3]);
    return;
  }

  const columns: TableColumn[] = [
    { key: "recordedAt", label: "Recorded", weight: 1.4 },
    { key: "bloodPressure", label: "Blood pressure", weight: 1.05 },
    { key: "pulse", label: "Pulse", weight: 0.7 },
    { key: "temperature", label: "Temperature", weight: 1.3 },
    { key: "glucose", label: "Glucose", weight: 1.0 },
    { key: "weight", label: "Weight", weight: 0.75 },
    { key: "height", label: "Height", weight: 0.7 },
    { key: "bmi", label: "BMI", weight: 0.6 },
    { key: "spo2", label: "SpO\u2082", weight: 0.6 },
    // Per-row clinician: only ever the doctor the database records for that
    // reading (§13) — "Not provided" when the row carries none.
    { key: "doctor", label: "Clinician", weight: 1.45 },
  ];
  dataTable(d, { columns, rows: rows.map((row) => ({ ...row })) });
  d.moveDown(space[3]);
}

/* ================================ Lab orders ============================= */

export function labsSection(d: ReportDoc, rows: LabEntry[]): void {
  sectionTitle(d, {
    title: "Laboratory tests",
    eyebrow: "Diagnostics",
    subtitle: "Orders placed in the reporting period and their results.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No laboratory tests were ordered in this period.");
    d.moveDown(space[3]);
    return;
  }

  const columns: TableColumn[] = [
    { key: "orderedAt", label: "Ordered", weight: 1.3 },
    { key: "testName", label: "Test", weight: 1.6, font: "semibold" },
    {
      key: "status",
      label: "Status",
      weight: 1.15,
      tone: (_value, row) => labStatusTone(row.statusKey ?? ""),
    },
    { key: "result", label: "Result", weight: 1 },
    { key: "reference", label: "Reference", weight: 1 },
    {
      key: "flag",
      label: "Flag",
      weight: 1,
      tone: (value) => labFlagTone(value.toLowerCase()),
    },
    { key: "dueDate", label: "Due", weight: 0.9 },
    { key: "resultedAt", label: "Resulted", weight: 1.35 },
    // Per-test ordering clinician (§17) — exactly as the database records it.
    { key: "doctor", label: "Ordered by", weight: 1.4 },
  ];
  dataTable(d, { columns, rows: rows.map((row) => ({ ...row })) });

  const notes = rows.filter((row) => row.notes);
  if (notes.length > 0) {
    d.moveDown(space[1]);
    for (const row of notes) {
      paragraph(d, `${row.testName} \u2014 ${row.notes}`, {
        size: typeScale.micro,
        color: palette.textMuted,
      });
    }
  }
  d.moveDown(space[3]);
}

/* ============================== Health records =========================== */

export function recordsSection(d: ReportDoc, rows: RecordEntry[]): void {
  sectionTitle(d, {
    title: "Health records",
    eyebrow: "Documents",
    subtitle: "Documents uploaded to the patient's chart in this period.",
  });
  if (rows.length === 0) {
    emptyNote(d, "No documents were uploaded in this period.");
    d.moveDown(space[3]);
    return;
  }

  const columns: TableColumn[] = [
    { key: "createdAt", label: "Uploaded", weight: 1.45 },
    { key: "type", label: "Type", weight: 0.9 },
    { key: "title", label: "Title", weight: 1.6, font: "semibold" },
    { key: "fileName", label: "File", weight: 1.5 },
    { key: "description", label: "Description", weight: 2 },
    { key: "doctor", label: "Uploaded by", weight: 1.55 },
  ];
  dataTable(d, { columns, rows: rows.map((row) => ({ ...row })) });
  d.moveDown(space[3]);
}

/** Draw every clinical section in the canonical order. */
export function clinicalSections(d: ReportDoc, history: ClinicalHistory): void {
  appointmentsSection(d, history.appointments);
  treatmentsSection(d, history.treatments);
  prescriptionsSection(d, history.prescriptions);
  vitalsSection(d, history.vitals);
  labsSection(d, history.labs);
  recordsSection(d, history.records);
}


