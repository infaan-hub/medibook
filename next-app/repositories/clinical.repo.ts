/** Clinical repository — medical treatments + health records. */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/* ---------------------------- Medical treatments --------------------------- */

export const listTreatments = (where: Prisma.MedicalTreatmentWhereInput) =>
  prisma.medicalTreatment.findMany({ where, orderBy: { created_at: "desc" } });

export const findTreatmentOwned = (id: number, doctorId?: number) =>
  prisma.medicalTreatment.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
  });

export const createTreatment = (data: {
  doctor_id: number;
  patient_id: number;
  appointment_id?: number | null;
  diagnosis?: string;
  treatment_notes?: string;
  prescription?: string;
  follow_up_date?: string | null;
  follow_up_notes?: string;
}) =>
  prisma.medicalTreatment.create({
    data: {
      doctor_id: data.doctor_id,
      patient_id: data.patient_id,
      appointment_id: data.appointment_id ?? null,
      diagnosis: data.diagnosis ?? "",
      treatment_notes: data.treatment_notes ?? "",
      prescription: data.prescription ?? "",
      follow_up_date: data.follow_up_date ? new Date(`${data.follow_up_date}T00:00:00Z`) : null,
      follow_up_notes: data.follow_up_notes ?? "",
    },
  });

export const updateTreatment = (id: number, data: Prisma.MedicalTreatmentUncheckedUpdateInput) =>
  prisma.medicalTreatment.update({ where: { id }, data });

export const deleteTreatment = (id: number) => prisma.medicalTreatment.delete({ where: { id } });

/* ------------------------------ Health records ----------------------------- */

/**
 * Role scoping for GET /api/health-records/.
 *
 * - patient → their own chart ONLY. The `?patient=` query param is ignored on
 *   purpose: applying it here would let any signed-in patient swap in another
 *   patient's id and read that person's records.
 * - doctor  → records that doctor owns (uploads + shares), optionally narrowed
 *   to one patient they are looking at.
 * - admin   → empty set (Django: queryset.none()).
 */
export const healthRecordWhere = (
  role: string,
  userId: number,
  doctorId: number | null,
  patientFilter?: string
): Prisma.HealthRecordWhereInput => {
  if (role === "patient") return { patient_id: userId };
  if (role !== "doctor") return { id: -1 };

  const where: Prisma.HealthRecordWhereInput = { doctor_id: doctorId ?? -1 };
  if (patientFilter !== undefined && patientFilter !== "") {
    const parsed = Number(patientFilter);
    // Non-numeric filter matches nothing instead of quietly dropping the filter.
    where.patient_id = Number.isInteger(parsed) ? parsed : -1;
  }
  return where;
};

export const countHealthRecords = (where: Prisma.HealthRecordWhereInput) =>
  prisma.healthRecord.count({ where });

/**
 * Record list. Includes the doctor's user so the serializer can name the
 * doctor a record was shared with (patients see "Shared with Dr. …").
 */
export const listHealthRecords = (where: Prisma.HealthRecordWhereInput, skip: number, take: number) =>
  prisma.healthRecord.findMany({
    where,
    include: { doctor: { include: { user: true } } },
    orderBy: { created_at: "desc" },
    skip,
    take,
  });

export const findHealthRecord = (id: number, doctorId?: number) =>
  prisma.healthRecord.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
  });

export const createHealthRecord = (
  data: {
    patient_id: number;
    doctor_id: number;
    appointment_id?: number | null;
    file_id?: number | null;
    record_type?: string;
    title: string;
    description?: string;
  },
  tx?: Prisma.TransactionClient
) =>
  (tx ?? prisma).healthRecord.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      appointment_id: data.appointment_id ?? null,
      file_id: data.file_id ?? null,
      record_type: data.record_type ?? "other",
      title: data.title,
      description: data.description ?? "",
    },
  });

export const deleteHealthRecord = (id: number, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).healthRecord.delete({ where: { id } });

/* -------------------------- Doctor's patient lists -------------------------- */

export const listPatientUserIdsForDoctor = (doctorId: number) =>
  prisma.appointment.findMany({
    where: { doctor_id: doctorId },
    distinct: ["patient_id"],
    select: { patient_id: true },
  });

export const listVisitHistory = async (doctorId: number, patientId: number) => {
  const appointments = await prisma.appointment.findMany({
    where: { doctor_id: doctorId, patient_id: patientId },
    include: { doctor: { include: { user: true } } },
    orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
  });
  const treatments = await prisma.medicalTreatment.findMany({
    where: { doctor_id: doctorId, patient_id: patientId },
    orderBy: { created_at: "desc" },
  });
  return { appointments, treatments };
};
