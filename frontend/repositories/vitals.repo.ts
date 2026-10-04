/**
 * Vitals repository — one reading per encounter (phase 2).
 *
 * The scoping helper is pure so the list gate can be unit-tested the same way
 * `prescriptionWhere` / `healthRecordWhere` are.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Doctor user is loaded so the serializer can name who took the reading. */
export const VITAL_INCLUDE = {
  doctor: { include: { user: true } },
} as const;

type VitalRow = Prisma.VitalGetPayload<{ include: typeof VITAL_INCLUDE }>;

/**
 * Role scoping for GET /api/vitals/ (mirrors prescriptionWhere):
 *
 * - patient → their own readings ONLY, whatever `?patient=` says
 * - doctor  → readings that doctor took, optionally one patient
 * - admin   → empty set
 */
export const vitalWhere = (
  role: string,
  userId: number,
  doctorId: number | null,
  patientFilter?: string
): Prisma.VitalWhereInput => {
  if (role === "patient") return { patient_id: userId };
  if (role !== "doctor") return { id: -1 };

  const where: Prisma.VitalWhereInput = { doctor_id: doctorId ?? -1 };
  if (patientFilter !== undefined && patientFilter !== "") {
    const parsed = Number(patientFilter);
    where.patient_id = Number.isInteger(parsed) ? parsed : -1;
  }
  return where;
};

export const listVitals = (where: Prisma.VitalWhereInput) =>
  prisma.vital.findMany({
    where,
    include: VITAL_INCLUDE,
    orderBy: { recorded_at: "desc" },
  });

export const findVitalOwned = (id: number, doctorId?: number) =>
  prisma.vital.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
    include: VITAL_INCLUDE,
  });

export const countVitals = (where: Prisma.VitalWhereInput) =>
  prisma.vital.count({ where });

export const createVital = (
  data: {
    doctor_id: number;
    patient_id: number;
    appointment_id?: number | null;
    recorded_at?: Date;
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    pulse_bpm?: number | null;
    temperature_c?: number | null;
    glucose_mg_dl?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    bmi?: number | null;
    spo2_percent?: number | null;
    notes?: string;
  },
  tx?: Prisma.TransactionClient
): Promise<VitalRow> =>
  (tx ?? prisma).vital.create({
    data: {
      doctor_id: data.doctor_id,
      patient_id: data.patient_id,
      appointment_id: data.appointment_id ?? null,
      ...(data.recorded_at ? { recorded_at: data.recorded_at } : {}),
      systolic_bp: data.systolic_bp ?? null,
      diastolic_bp: data.diastolic_bp ?? null,
      pulse_bpm: data.pulse_bpm ?? null,
      temperature_c: data.temperature_c ?? null,
      glucose_mg_dl: data.glucose_mg_dl ?? null,
      weight_kg: data.weight_kg ?? null,
      height_cm: data.height_cm ?? null,
      bmi: data.bmi ?? null,
      spo2_percent: data.spo2_percent ?? null,
      notes: data.notes ?? "",
    },
    include: VITAL_INCLUDE,
  });

export const deleteVital = (id: number) => prisma.vital.delete({ where: { id } });
