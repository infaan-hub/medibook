/**
 * Doctor medical report data (§34 family 2) — a clinician's report on ONE of
 * their patients, containing the patient's full information.
 *
 * Authorization is enforced here, not in the route: the doctor must be the
 * signed-in doctor AND must have an accepted, in-progress, or completed
 * appointment with the requested patient. Pending requests do not expose the
 * patient's prior chart.
 */
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { hasAcceptedAppointmentWithPatient } from "@/repositories/appointments.repo";
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

export interface DoctorReportQuery extends PeriodQuery {
  /** Patient **user** id — the id the app already uses everywhere. */
  patient?: string | number | null | undefined;
  appointmentId?: string | number | null | undefined;
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

  if (!(await hasAcceptedAppointmentWithPatient(doctor.id, patient.id))) {
    throw forbidden("Accept an appointment with this patient before viewing their history.");
  }

  const appointmentId = query.appointmentId == null ? undefined : Number(query.appointmentId);
  if (appointmentId !== undefined) {
    if (!Number.isInteger(appointmentId)) throw badRequest("Select a valid appointment for this report.");
    const visit = await prisma.appointment.findFirst({
      where: { id: appointmentId, doctor_id: doctor.id, patient_id: patient.id },
      select: { id: true },
    });
    if (!visit) throw forbidden("This appointment is not part of your patient visits.");
  }

  const period = hasExplicitPeriod(query)
    ? resolvePeriod(query)
    : fullRecordPeriod(isoDayInTimezone(patient.created_at));

  // The doctor must be linked to the patient (checked above), but the report
  // itself is the patient's FULL chart — every clinician's entries, exactly as
  // the patient's own report shows them — so a printed copy never hides part
  // of the record.
  const history = await collectClinicalHistory({
    period,
    patientId: patient.id,
    appointmentId,
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
      records: count(history.treatments.filter((row) => row.doctorDescription).length),
    },
  };
}
