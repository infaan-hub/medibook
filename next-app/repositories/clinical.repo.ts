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

export const healthRecordWhere = (
  role: string,
  userId: number,
  doctorId: number | null,
  patientFilter?: string
): Prisma.HealthRecordWhereInput => {
  const where: Prisma.HealthRecordWhereInput =
    role === "patient"
      ? { patient_id: userId }
      : role === "doctor"
        ? { doctor_id: doctorId ?? -1 }
        : { id: -1 }; // admins see an empty set (Django: queryset.none())
  if (patientFilter) where.patient_id = Number(patientFilter);
  return where;
};

export const countHealthRecords = (where: Prisma.HealthRecordWhereInput) =>
  prisma.healthRecord.count({ where });

export const listHealthRecords = (where: Prisma.HealthRecordWhereInput, skip: number, take: number) =>
  prisma.healthRecord.findMany({ where, orderBy: { created_at: "desc" }, skip, take });

export const findHealthRecord = (id: number, doctorId?: number) =>
  prisma.healthRecord.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
  });

export const createHealthRecord = (data: {
  patient_id: number;
  doctor_id: number;
  appointment_id?: number | null;
  file?: string | null;
  record_type?: string;
  title: string;
  description?: string;
}) =>
  prisma.healthRecord.create({
    data: {
      patient_id: data.patient_id,
      doctor_id: data.doctor_id,
      appointment_id: data.appointment_id ?? null,
      file: data.file ?? null,
      record_type: data.record_type ?? "other",
      title: data.title,
      description: data.description ?? "",
    },
  });

export const deleteHealthRecord = (id: number) => prisma.healthRecord.delete({ where: { id } });

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
