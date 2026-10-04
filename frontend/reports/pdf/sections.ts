/**
 * Composed report sections (§34) — blocks that already know *what* a MediBook
 * report is made of, in terms of the primitives in `./components`.
 *
 * Renderers stay thin: they only pick which of these sections to draw, in
 * which order, from the data layer's typed payloads.
 */
import { palette, space, type as typeScale } from "../design/tokens";
import type { ReportDoc } from "./doc";
import { formatDateTime } from "../data/format";
import {
  doctorAttribution,
  emptyNote,
  eyebrow,
  fieldBlock,
  infoTable,
  paragraph,
  sectionTitle,
  summaryCards,
  type AttributionOptions,
  type GridField,
  type InfoRow,
  type SummaryCard,
} from "./components";

/* ============================= Cover block =============================== */

/** Identity of a generated document — everything the cover block prints. */
export interface ReportIdentity {
  /** Stable, reproducible document id, e.g. `MB-ADM-20261003-4821`. */
  reportId: string;
  /** Classification kicker, e.g. "Confidential — Administrative Report". */
  classification: string;
  /** Report title (H1 of the body). */
  title: string;
  /** One sentence explaining what the document contains. */
  subtitle?: string;
  /** Reporting period, already formatted. */
  period?: string;
  /** Who/what the report is about (patient, doctor, hospital …). */
  subject?: string;
  /** Recipient line, e.g. "MediBook Zanzibar Administration". */
  preparedFor: string;
  /** Author line, e.g. "MediBook Zanzibar Reporting Service". */
  preparedBy: string;
}

/**
 * The body cover block: classification kicker, title, standfirst and the
 * document metadata table (report id / period / subject / generated / parties).
 * The repeated page chrome above already carries the short header, so this
 * block only ever appears once, on page 1.
 */
export function reportHeaderBody(d: ReportDoc, identity: ReportIdentity): void {
  eyebrow(d, identity.classification);

  let cursor = d.y;
  const titleH = d.textAt(d.left, cursor, identity.title, {
    font: "semibold",
    size: typeScale.xl,
    color: palette.text,
    width: d.width,
    lineGap: 1.25,
  });
  cursor += titleH + space[1];

  if (identity.subtitle) {
    const subtitleH = d.textAt(d.left, cursor, identity.subtitle, {
      size: typeScale.sm,
      color: palette.textMuted,
      width: d.width,
      lineGap: 1.5,
    });
    cursor += subtitleH + space[2];
  }
  d.y = cursor;

  const rows: InfoRow[] = [
    { label: "Report ID", value: identity.reportId, strong: true },
    { label: "Generated", value: formatDateTime(d.generatedAt) },
  ];
  if (identity.period) rows.push({ label: "Reporting period", value: identity.period });
  if (identity.subject) rows.push({ label: "Subject", value: identity.subject });
  rows.push({ label: "Prepared for", value: identity.preparedFor });
  rows.push({ label: "Prepared by", value: identity.preparedBy });

  infoTable(d, rows, { labelRatio: 0.26 });
  d.moveDown(space[3]);
}

/* ============================ Metric blocks ============================== */

/** Draw a labelled group of summary cards (wraps at 3 per row by default). */
export function summarySection(d: ReportDoc, cards: SummaryCard[], title?: string): void {
  if (cards.length === 0) return;
  if (title) sectionTitle(d, { title, eyebrow: "At a glance" });
  summaryCards(d, cards);
  d.moveDown(space[2]);
}

/* ========================= Identity information ========================== */

export interface PatientSummary {
  /** Display id / username — never the raw database key. */
  reference: string;
  name: string;
  dateOfBirth: string;
  age: string;
  gender: string;
  bloodGroup: string;
  phone: string;
  email: string;
  emergencyContact: string;
  registeredOn: string;
  allergies: string;
  medicalHistory: string;
}

/**
 * "Patient information" — the demographics grid plus the two narrative medical
 * fields, which are always shown when the database carries them.
 */
export function patientInformation(d: ReportDoc, patient: PatientSummary): void {
  sectionTitle(d, {
    title: "Patient information",
    subtitle: "Identity and contact details as held on the patient's MediBook record.",
    eyebrow: "Section 1",
  });

  infoTable(d, [
    { label: "Patient", value: patient.name, strong: true },
    { label: "Patient ID", value: patient.reference },
    { label: "Date of birth", value: patient.dateOfBirth },
    { label: "Age", value: patient.age },
    { label: "Gender", value: patient.gender },
    {
      label: "Blood group",
      value: patient.bloodGroup,
      strong: patient.bloodGroup !== "Not provided",
    },
    { label: "Phone", value: patient.phone },
    { label: "Email", value: patient.email },
    { label: "Emergency contact", value: patient.emergencyContact },
    { label: "Registered on", value: patient.registeredOn },
  ]);

  // Always shown — a chart that carries nothing still reads as a complete
  // document; the warning colour is reserved for allergies that exist.
  fieldBlock(d, {
    label: "Allergies",
    value: patient.allergies,
    labelColor: patient.allergies !== "Not provided" ? palette.warning : undefined,
  });
  fieldBlock(d, { label: "Medical history", value: patient.medicalHistory });
  d.moveDown(space[3]);
}

export interface DoctorSummary {
  reference: string;
  name: string;
  specialties: string;
  qualifications: string;
  experience: string;
  hospital: string;
  phone: string;
  email: string;
  rating: string;
  joinedOn: string;
}

/** "Doctor information" — the clinician attribution block for a report. */
export function doctorInformation(d: ReportDoc, doctor: DoctorSummary): void {
  sectionTitle(d, {
    title: "Doctor information",
    subtitle:
      "The clinician who prepared this report; every chart entry keeps its own recorded clinician.",
    eyebrow: "Section 2",
  });
  infoTable(d, [
    { label: "Doctor", value: doctor.name, strong: true },
    { label: "Doctor ID", value: doctor.reference },
    { label: "Specialties", value: doctor.specialties },
    { label: "Qualifications", value: doctor.qualifications },
    { label: "Experience", value: doctor.experience },
    { label: "Practising at", value: doctor.hospital },
    { label: "Phone", value: doctor.phone },
    { label: "Email", value: doctor.email },
    { label: "Rating", value: doctor.rating },
    { label: "Registered on", value: doctor.joinedOn },
  ]);
  d.moveDown(space[3]);
}

/* =========================== Clinical record ============================= */

export interface MedicalRecordSectionOptions {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Short key/value facts about the entry. */
  rows?: InfoRow[];
  /** Long-form narrative fields (diagnosis, notes …). */
  narratives?: GridField[];
  /** Bulleted supporting points. */
  bullets?: string[];
  /** Doctor attribution, printed only when the database carries it. */
  attribution?: AttributionOptions;
  /** Copy used when nothing exists for the section. */
  emptyText?: string;
}

/**
 * One clinical record section (treatment, prescription, lab order …).
 * Renders only an `emptyNote` when the section has no content, so a report for
 * a patient with no history still reads as a complete document.
 */
export function medicalRecordSection(
  d: ReportDoc,
  options: MedicalRecordSectionOptions
): void {
  const {
    title,
    eyebrow: kicker,
    subtitle,
    rows = [],
    narratives = [],
    bullets = [],
    attribution,
    emptyText,
  } = options;
  const hasContent = rows.length > 0 || narratives.length > 0 || bullets.length > 0;

  sectionTitle(d, { title, subtitle, ...(kicker ? { eyebrow: kicker } : {}) });

  if (!hasContent) {
    emptyNote(d, emptyText ?? "No entries recorded for this period.");
    d.moveDown(space[2]);
    return;
  }

  if (rows.length > 0) infoTable(d, rows);
  for (const narrative of narratives) fieldBlock(d, narrative);
  for (const item of bullets) {
    paragraph(d, `\u2022  ${item}`);
    d.moveDown(space[1]);
  }
  if (attribution) doctorAttribution(d, attribution);
  d.moveDown(space[3]);
}

/** Compact key/value strip used directly under a section title. */
export function sectionMeta(d: ReportDoc, rows: InfoRow[]): void {
  if (rows.length === 0) return;
  infoTable(d, rows, { labelRatio: 0.24 });
  d.moveDown(space[2]);
}


