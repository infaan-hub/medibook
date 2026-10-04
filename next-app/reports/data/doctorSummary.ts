/**
 * Doctor PRACTICE SUMMARY report data (§34 family 2b) — the numbers behind the
 * doctor's own dashboard: how many patients they treat, how many appointments
 * and emergency requests they handled, and how those broke down.
 *
 * The practice-level companion to the per-patient chart in `./doctor`. It never
 * exposes another doctor's numbers, and the scope is ALWAYS the signed-in
 * doctor's own profile, resolved from the session — never from the query string.
 */
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { statusLabel } from "./format";
import { buildDoctorSummary, DOCTOR_SUMMARY_INCLUDE } from "./people";
import { dateColumnRange, resolvePeriod, type PeriodQuery, type ReportPeriod } from "./period";

/** Emergency lifecycle, in the order a clinician reads their own queue. */
const EMERGENCY_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "done",
  "rejected",
  "cancelled",
  "expired",
] as const;

/** Appointment lifecycle, same order as the app's status filters. */
const APPOINTMENT_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "done",
  "cancelled",
  "rejected",
  "expired",
] as const;

/** Patients listed in the PDF before a disclosure note takes over. */
const MAX_PATIENT_ROWS = 25;

export interface CountBreakdownRow {
  /** Raw enum value, used for the status pill tone. */
  status: string;
  label: string;
  count: string;
  share: string;
}

export interface PatientRow {
  name: string;
  reference: string;
  appointments: string;
  emergencies: string;
  lastSeen: string;
}

export interface DoctorSummaryTotals {
  /** Distinct patients this doctor has any record with, ever. */
  patients: string;
  /** Distinct patients seen inside the period. */
  periodPatients: string;
  appointments: string;
  periodAppointments: string;
  completed: string;
  emergencies: string;
  periodEmergencies: string;
  emergenciesCompleted: string;
  treatments: string;
  prescriptions: string;
  vitals: string;
  labs: string;
  records: string;
}

export interface DoctorSummaryData {
  period: ReportPeriod;
  doctor: ReturnType<typeof buildDoctorSummary>;
  totals: DoctorSummaryTotals;
  appointmentBreakdown: CountBreakdownRow[];
  emergencyBreakdown: CountBreakdownRow[];
  /** The busiest patients, so the document is not only totals. */
  patients: PatientRow[];
  /** True when `patients` was capped, so the PDF can say so honestly. */
  patientsTruncated: boolean;
}

const count = (value: number): string => value.toLocaleString("en-GB");

function share(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** Tally `{ status }` rows into a lookup. */
function tallyStatuses(rows: { status: string }[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const row of rows) tally.set(row.status, (tally.get(row.status) ?? 0) + 1);
  return tally;
}

/** Turn a `status → n` tally into printable rows, in the given order. */
function breakdown(
  tally: Map<string, number>,
  order: readonly string[],
  total: number
): CountBreakdownRow[] {
  return order.map((status) => {
    const value = tally.get(status) ?? 0;
    return { status, label: statusLabel(status), count: count(value), share: share(value, total) };
  });
}

/** Count the appointments scoped to this doctor, optionally narrowed by period. */
async function countAppointments(
  doctorId: number,
  extra: Record<string, unknown> = {}
): Promise<number> {
  return prisma.appointment.count({ where: { doctor_id: doctorId, ...extra } });
}

/**
 * Build the doctor's practice summary.
 *
 * Every figure is the doctor's OWN — the profile is resolved from the signed-in
 * user id, so there is no parameter through which one doctor could read another
 * doctor's numbers.
 */
export async function collectDoctorSummaryReport(
  doctorUserId: number,
  query: PeriodQuery = {}
): Promise<DoctorSummaryData> {
  const doctor = await prisma.doctor.findUnique({
    where: { user_id: doctorUserId },
    include: DOCTOR_SUMMARY_INCLUDE,
  });
  if (!doctor) throw notFound();

  const doctorId = doctor.id;
  const period = resolvePeriod(query);
  const inPeriod = { appointment_date: dateColumnRange(period) };
  const emergency = { appointment_type: "EMERGENCY" as const };

  const [patients, periodPatients, appointments, periodAppointments, completed, emergencies, periodEmergencies, emergenciesCompleted, treatments, prescriptions, vitals, labs, records] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { doctor_id: doctorId },
        distinct: ["patient_id"],
        select: { patient_id: true },
      }),
      prisma.appointment.findMany({
        where: { doctor_id: doctorId, ...inPeriod },
        distinct: ["patient_id"],
        select: { patient_id: true },
      }),
      countAppointments(doctorId),
      countAppointments(doctorId, inPeriod),
      countAppointments(doctorId, { status: "done" }),
      countAppointments(doctorId, emergency),
      countAppointments(doctorId, { ...emergency, ...inPeriod }),
      countAppointments(doctorId, { ...emergency, status: "done" }),
      prisma.medicalTreatment.count({ where: { doctor_id: doctorId } }),
      prisma.prescription.count({ where: { doctor_id: doctorId } }),
      prisma.vital.count({ where: { doctor_id: doctorId } }),
      prisma.labOrder.count({ where: { doctor_id: doctorId } }),
      prisma.healthRecord.count({ where: { doctor_id: doctorId } }),
    ]);

  const [appointmentRows, emergencyRows] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctor_id: doctorId, ...inPeriod },
      select: { status: true },
    }),
    prisma.appointment.findMany({
      where: { doctor_id: doctorId, ...emergency, ...inPeriod },
      select: { status: true },
    }),
  ]);

  const busiest = await prisma.appointment.groupBy({
    by: ["patient_id"],
    where: { doctor_id: doctorId },
    _count: { _all: true },
    orderBy: { _count: { patient_id: "desc" } },
    take: MAX_PATIENT_ROWS,
  });

  const ids = busiest.map((row) => row.patient_id);
  const [users, rows, emergencyForPatients] = await Promise.all([
    ids.length
      ? prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, username: true, first_name: true, last_name: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.appointment.findMany({
          where: { doctor_id: doctorId, patient_id: { in: ids } },
          select: { patient_id: true, appointment_date: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.appointment.findMany({
          where: { doctor_id: doctorId, patient_id: { in: ids }, ...emergency },
          select: { patient_id: true },
        })
      : Promise.resolve([]),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const seen = new Map<number, number>();
  const lastSeen = new Map<number, string>();
  for (const row of rows) {
    seen.set(row.patient_id, (seen.get(row.patient_id) ?? 0) + 1);
    const day = row.appointment_date.toISOString().slice(0, 10);
    const previous = lastSeen.get(row.patient_id);
    if (!previous || day > previous) lastSeen.set(row.patient_id, day);
  }
  const emergencySeen = new Map<number, number>();
  for (const row of emergencyForPatients) {
    emergencySeen.set(row.patient_id, (emergencySeen.get(row.patient_id) ?? 0) + 1);
  }

  return {
    period,
    doctor: buildDoctorSummary(doctor),
    totals: {
      patients: count(patients.length),
      periodPatients: count(periodPatients.length),
      appointments: count(appointments),
      periodAppointments: count(periodAppointments),
      completed: count(completed),
      emergencies: count(emergencies),
      periodEmergencies: count(periodEmergencies),
      emergenciesCompleted: count(emergenciesCompleted),
      treatments: count(treatments),
      prescriptions: count(prescriptions),
      vitals: count(vitals),
      labs: count(labs),
      records: count(records),
    },
    appointmentBreakdown: breakdown(tallyStatuses(appointmentRows), APPOINTMENT_STATUSES, periodAppointments),
    emergencyBreakdown: breakdown(tallyStatuses(emergencyRows), EMERGENCY_STATUSES, periodEmergencies),
    patients: busiest.map((row) => {
      const user = userById.get(row.patient_id);
      const name =
        [user?.first_name, user?.last_name]
          .map((part) => (part ?? "").trim())
          .filter(Boolean)
          .join(" ") || "Unnamed patient";
      return {
        name,
        reference: (user?.username ?? "").trim() || `Patient #${row.patient_id}`,
        appointments: count(seen.get(row.patient_id) ?? row._count._all),
        emergencies: count(emergencySeen.get(row.patient_id) ?? 0),
        lastSeen: lastSeen.get(row.patient_id) ?? "Not recorded",
      };
    }),
    patientsTruncated: patients.length > MAX_PATIENT_ROWS,
  };
}