/**
 * Clinical history for one patient (optionally narrowed to the doctor asking).
 *
 * Everything is scoped by BOTH the reporting period and the caller's
 * authorization scope, so a report can never leak another clinician's notes.
 * Rows are returned as already-formatted view models: the PDF layer never
 * touches Prisma types.
 */
import { prisma } from "@/lib/db";
import { hhmm } from "@/lib/dates";
import {
  formatDateTime,
  formatIsoDate,
  notProvided,
  statusLabel,
} from "./format";
import { dateColumnRange, timestampRange, type ReportPeriod } from "./period";

export interface Attribution {
  name: string;
  context: string;
  dateText: string;
  timeText: string;
}

export interface TreatmentEntry {
  date: string;
  diagnosis: string;
  treatmentNotes: string;
  prescriptionNotes: string;
  followUp: string;
  followUpNotes: string;
  appointmentDate: string;
  attribution: Attribution | null;
}

export interface PrescriptionItemEntry {
  medication: string;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  instructions: string;
}

export interface PrescriptionEntry {
  date: string;
  notes: string;
  items: PrescriptionItemEntry[];
  attribution: Attribution | null;
}

export interface VitalEntry {
  recordedAt: string;
  bloodPressure: string;
  pulse: string;
  temperature: string;
  glucose: string;
  bmi: string;
  spo2: string;
  notes: string;
  doctor: string;
}

export interface LabEntry {
  orderedAt: string;
  testName: string;
  /** Display label, e.g. "In Progress". */
  status: string;
  /** Raw enum value, used for the pill tone. */
  statusKey: string;
  result: string;
  reference: string;
  dueDate: string;
  notes: string;
  doctor: string;
  flag: string;
}

export interface RecordEntry {
  createdAt: string;
  type: string;
  title: string;
  description: string;
  doctor: string;
}

export interface AppointmentEntry {
  date: string;
  time: string;
  /** Display label, e.g. "In Progress". */
  status: string;
  /** Raw enum value, used for the pill tone. */
  statusKey: string;
  type: string;
  reason: string;
  doctor: string;
  patient: string;
  hospital: string;
}

export interface ClinicalHistory {
  appointments: AppointmentEntry[];
  treatments: TreatmentEntry[];
  prescriptions: PrescriptionEntry[];
  vitals: VitalEntry[];
  labs: LabEntry[];
  records: RecordEntry[];
}

/* ------------------------------- helpers -------------------------------- */

const DOCTOR_CARD = {
  user: true,
  specialties: { include: { specialty: true } },
} as const;

type DoctorCard = {
  user: { first_name: string; last_name: string; username: string; email: string };
  specialties: { specialty: { name: string } }[];
};

/** Split "15 September 2026, 10:42 AM" into its date and time halves. */
function stampParts(when: Date | null | undefined): { dateText: string; timeText: string } {
  if (!when) return { dateText: "", timeText: "" };
  const [dateText = "", timeText = ""] = formatDateTime(when).split(", ");
  return { dateText, timeText };
}

/** Attribution block for a doctor-entered entry; null when the row has none. */
function attribution(doctor: DoctorCard | null | undefined, when: Date | null | undefined): Attribution | null {
  if (!doctor) return null;
  const stamp = stampParts(when);
  return {
    name: doctor.user.first_name || doctor.user.last_name
      ? `Dr. ${[doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(" ")}`
      : doctor.user.username || doctor.user.email,
    context: doctor.specialties.map((entry) => entry.specialty.name).join(", "),
    ...stamp,
  };
}

/** Same attribution but as a single "Dr. X · Specialty" label for a table. */
function doctorLabel(doctor: DoctorCard | null | undefined): string {
  if (!doctor) return notProvided(null);
  const name =
    doctor.user.first_name || doctor.user.last_name
      ? `Dr. ${[doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(" ")}`
      : doctor.user.username || doctor.user.email;
  const specialty = doctor.specialties.map((entry) => entry.specialty.name).join(", ");
  return specialty ? `${name} · ${specialty}` : name;
}

const orMissing = (value: string | null | undefined): string => notProvided(value ?? null);

const optional = (value: string | null | undefined): string => (value ?? "").trim();

/* ------------------------------ collection ------------------------------ */

export interface ClinicalScope {
  period: ReportPeriod;
  /** Patient whose chart is being reported on. */
  patientId: number;
  /** When set, only this doctor's entries are included. */
  doctorId?: number;
}

export async function collectClinicalHistory(scope: ClinicalScope): Promise<ClinicalHistory> {
  const { period, patientId, doctorId } = scope;
  const timestampWindow = timestampRange(period);
  const doctorScope = doctorId ? { doctor_id: doctorId } : {};

  const [appointments, treatments, prescriptions, vitals, labs, records] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        patient_id: patientId,
        appointment_date: dateColumnRange(period),
        ...doctorScope,
      },
      orderBy: [{ appointment_date: "desc" }, { start_time: "asc" }],
      include: { doctor: { include: DOCTOR_CARD }, patient: true, hospital: true },
    }),
    prisma.medicalTreatment.findMany({
      where: { patient_id: patientId, created_at: timestampWindow, ...doctorScope },
      orderBy: { created_at: "desc" },
      include: {
        doctor: { include: DOCTOR_CARD },
        appointment: { select: { appointment_date: true } },
      },
    }),
    prisma.prescription.findMany({
      where: { patient_id: patientId, created_at: timestampWindow, ...doctorScope },
      orderBy: { created_at: "desc" },
      include: {
        doctor: { include: DOCTOR_CARD },
        items: { orderBy: { sort_order: "asc" } },
      },
    }),
    prisma.vital.findMany({
      where: { patient_id: patientId, recorded_at: timestampWindow, ...doctorScope },
      orderBy: { recorded_at: "desc" },
      include: { doctor: { include: DOCTOR_CARD } },
    }),
    prisma.labOrder.findMany({
      where: { patient_id: patientId, ordered_at: timestampWindow, ...doctorScope },
      orderBy: { ordered_at: "desc" },
      include: { doctor: { include: DOCTOR_CARD } },
    }),
    prisma.healthRecord.findMany({
      where: { patient_id: patientId, created_at: timestampWindow, ...doctorScope },
      orderBy: { created_at: "desc" },
      include: { doctor: { include: DOCTOR_CARD } },
    }),
  ]);

  const appointmentRows: AppointmentEntry[] = appointments.map((appointment) => ({
    date: formatIsoDate(appointment.appointment_date),
    time: `${hhmm(appointment.start_time)} – ${hhmm(appointment.end_time)}`,
    status: statusLabel(appointment.status),
    statusKey: appointment.status,
    type: appointment.appointment_type === "EMERGENCY" ? "Emergency" : "Normal",
    reason: orMissing(appointment.reason),
    doctor: doctorLabel(appointment.doctor),
    patient:
      [appointment.patient.first_name, appointment.patient.last_name].filter(Boolean).join(" ") ||
      appointment.patient.username,
    hospital: appointment.hospital ? appointment.hospital.name : "Not applicable",
  }));

  const treatmentRows: TreatmentEntry[] = treatments.map((treatment) => ({
    date: formatDateTime(treatment.created_at),
    diagnosis: orMissing(treatment.diagnosis),
    treatmentNotes: orMissing(treatment.treatment_notes),
    prescriptionNotes: optional(treatment.prescription),
    followUp: treatment.follow_up_date ? formatIsoDate(treatment.follow_up_date) : "Not scheduled",
    followUpNotes: optional(treatment.follow_up_notes),
    appointmentDate: treatment.appointment
      ? formatIsoDate(treatment.appointment.appointment_date)
      : "Not linked",
    attribution: attribution(treatment.doctor, treatment.created_at),
  }));

  const prescriptionRows: PrescriptionEntry[] = prescriptions.map((prescription) => ({
    date: formatDateTime(prescription.created_at),
    notes: optional(prescription.notes),
    items: prescription.items.map((item) => ({
      medication: item.medication,
      dosage: optional(item.dosage),
      frequency: optional(item.frequency),
      route: optional(item.route),
      duration: item.duration_days ? `${item.duration_days} days` : "",
      instructions: optional(item.instructions),
    })),
    attribution: attribution(prescription.doctor, prescription.created_at),
  }));

  const vitalRows: VitalEntry[] = vitals.map((vital) => ({
    recordedAt: formatDateTime(vital.recorded_at),
    bloodPressure:
      vital.systolic_bp !== null && vital.diastolic_bp !== null
        ? `${vital.systolic_bp}/${vital.diastolic_bp} mmHg`
        : notProvided(null),
    pulse: vital.pulse_bpm !== null ? `${vital.pulse_bpm} bpm` : notProvided(null),
    temperature: vital.temperature_c !== null ? `${vital.temperature_c} °C` : notProvided(null),
    glucose: vital.glucose_mg_dl !== null ? `${vital.glucose_mg_dl} mg/dL` : notProvided(null),
    bmi: vital.bmi !== null ? vital.bmi.toFixed(1) : notProvided(null),
    spo2: vital.spo2_percent !== null ? `${vital.spo2_percent}%` : notProvided(null),
    notes: optional(vital.notes),
    doctor: doctorLabel(vital.doctor),
  }));

  const labRows: LabEntry[] = labs.map((lab) => ({
    orderedAt: formatDateTime(lab.ordered_at),
    testName: lab.test_name,
    status: statusLabel(lab.status),
    statusKey: lab.status,
    result: optional(lab.result_value) || (lab.status === "resulted" ? orMissing(null) : "Pending"),
    reference: referenceRange(lab.reference_min, lab.reference_max, lab.unit),
    dueDate: lab.result_due_date ? formatIsoDate(lab.result_due_date) : "Not set",
    notes: optional(lab.notes),
    doctor: doctorLabel(lab.doctor),
    flag: labFlag(lab.status, lab.result_value, lab.reference_min, lab.reference_max),
  }));

  const recordRows: RecordEntry[] = records.map((record) => ({
    createdAt: formatDateTime(record.created_at),
    type: statusLabel(record.record_type),
    title: record.title,
    description: optional(record.description),
    doctor: doctorLabel(record.doctor),
  }));

  return {
    appointments: appointmentRows,
    treatments: treatmentRows,
    prescriptions: prescriptionRows,
    vitals: vitalRows,
    labs: labRows,
    records: recordRows,
  };
}

function referenceRange(min: number | null, max: number | null, unit: string): string {
  const suffix = unit ? ` ${unit}` : "";
  if (min !== null && max !== null) return `${min} – ${max}${suffix}`;
  if (min !== null) return `≥ ${min}${suffix}`;
  if (max !== null) return `≤ ${max}${suffix}`;
  return notProvided(null);
}

/** High / low / normal against the order's own stored reference range. */
function labFlag(status: string, result: string, min: number | null, max: number | null): string {
  if (status === "cancelled") return "Cancelled";
  const value = Number.parseFloat(result);
  if (!result.trim() || Number.isNaN(value)) {
    return status === "resulted" ? "Resulted" : "Awaiting result";
  }
  if (min !== null && value < min) return "Low";
  if (max !== null && value > max) return "High";
  return "Normal";
}


