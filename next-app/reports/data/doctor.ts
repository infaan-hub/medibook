/**
 * Doctor medical report data (§34 family 2) — a clinician's report on ONE of
 * their patients.
 *
 * Authorization is enforced here, not in the route: the doctor must be the
 * signed-in doctor AND must actually be linked to the requested patient
 * (appointment, treatment, prescription, vital, lab order or shared health
 * record). A doctor can never assemble a chart for a stranger.
 */
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { collectClinicalHistory, type ClinicalHistory } from "./clinical";
import { isoDayInTimezone } from "./format";
import {
  buildDoctorSummary,
  buildPatientSummary,
  DOCTOR_SUMMARY_INCLUDE,
  type PatientUserRow,
} from "./people";
import {
  fullRecordPeriod,
  hasExplicitPeriod,
  resolvePeriod,
  type PeriodQuery,
  type ReportPeriod,
} from "./period";

export interface DoctorReportData {
  period: ReportPeriod;
  doctor: ReturnType<typeof buildDoctorSummary>;
  patient: ReturnType<typeof buildPatientSummary>;
  history: ClinicalHistory;
  counts: {
    appointments: string;
    treatments: string;
    prescriptions: string;
    vitals: string;
    labs: string;
    records: string;
  };
}

const count = (value: number): string => value.toLocaleString("en-GB");

/** True when the doctor has any clinical relationship with the patient. */
async function isLinked(doctorId: number, patientId: number): Promise<boolean> {
  const [appointments, treatments, prescriptions, vitals, labs, records] = await Promise.all([
    prisma.appointment.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
    prisma.medicalTreatment.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
    prisma.prescription.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
    prisma.vital.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
    prisma.labOrder.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
    prisma.healthRecord.count({ where: { doctor_id: doctorId, patient_id: patientId } }),
  ]);
  return (
    appointments + treatments + prescriptions + vitals + labs + records > 0
  );
}

export interface DoctorReportQuery extends PeriodQuery {
  /** Patient **user** id — the id the app already uses everywhere. */
  patient?: string | number | null | undefined;
}

export async function collectDoctorReport(
  doctorUserId: number,
  query: DoctorReportQuery = {}
): Promise<DoctorReportData> {
  const doctor = await prisma.doctor.findUnique({
    where: { user_id: doctorUserId },
    include: DOCTOR_SUMMARY_INCLUDE,
  });
  if (!doctor) throw notFound();

  const rawPatient = query.patient;
  const patientId =
    typeof rawPatient === "number" ? rawPatient : Number.parseInt(String(rawPatient ?? ""), 10);
  if (!Number.isInteger(patientId)) {
    throw badRequest("Select a patient before generating a medical report.");
  }

  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    include: { patient: true },
  });
  if (!patient || patient.role !== "patient") throw notFound();

  if (!(await isLinked(doctor.id, patient.id))) {
    throw forbidden("You do not have any recorded activity with this patient.");
  }

  const period = hasExplicitPeriod(query)
    ? resolvePeriod(query)
    : fullRecordPeriod(isoDayInTimezone(patient.created_at));

  const history = await collectClinicalHistory({
    period,
    patientId: patient.id,
    doctorId: doctor.id,
  });

  return {
    period,
    doctor: buildDoctorSummary(doctor),
    patient: buildPatientSummary(patient as PatientUserRow),
    history,
    counts: {
      appointments: count(history.appointments.length),
      treatments: count(history.treatments.length),
      prescriptions: count(history.prescriptions.length),
      vitals: count(history.vitals.length),
      labs: count(history.labs.length),
      records: count(history.records.length),
    },
  };
}
