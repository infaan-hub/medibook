/** Clinical repository — medical treatments, health records, prescriptions. */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const RX_INCLUDE = {
  prescriptions: { include: { items: { orderBy: { sort_order: "asc" as const } } } },
} satisfies Prisma.MedicalTreatmentInclude;

/* ---------------------------- Medical treatments --------------------------- */

export const listTreatments = (where: Prisma.MedicalTreatmentWhereInput) =>
  prisma.medicalTreatment.findMany({
    where,
    include: RX_INCLUDE,
    orderBy: { created_at: "desc" },
  });

export const findTreatmentOwned = (id: number, doctorId?: number) =>
  prisma.medicalTreatment.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
    include: RX_INCLUDE,
  });

export const createTreatment = (
  data: {
    doctor_id: number;
    patient_id: number;
    appointment_id?: number | null;
    diagnosis?: string;
    treatment_notes?: string;
    prescription?: string;
    follow_up_date?: string | null;
    follow_up_notes?: string;
  },
  tx?: Prisma.TransactionClient
) =>
  (tx ?? prisma).medicalTreatment.create({
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
    include: RX_INCLUDE,
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
    include: { doctor: { include: { user: true } }, file: true },
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
    // File metadata is needed by healthRecordDto for Open/Download actions.
    include: { file: true },
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
    include: RX_INCLUDE,
    orderBy: { created_at: "desc" },
  });
  return { appointments, treatments };
};

/* ------------------------------- Prescriptions ----------------------------- */

export const RX_ITEM_INCLUDE = { items: { orderBy: { sort_order: "asc" as const } } } as const;

type PrescriptionRow = Prisma.PrescriptionGetPayload<{ include: typeof RX_ITEM_INCLUDE }>;

/**
 * Role scoping for GET /api/prescriptions/ (pure — no I/O, mirrored from
 * healthRecordWhere so the two clinical lists gate identically):
 *
 * - patient → their own prescriptions ONLY, whatever `?patient=` says
 * - doctor  → prescriptions that doctor issued, optionally one patient
 * - admin   → empty set
 */
export const prescriptionWhere = (
  role: string,
  userId: number,
  doctorId: number | null,
  patientFilter?: string
): Prisma.PrescriptionWhereInput => {
  if (role === "patient") return { patient_id: userId };
  if (role !== "doctor") return { id: -1 };

  const where: Prisma.PrescriptionWhereInput = { doctor_id: doctorId ?? -1 };
  if (patientFilter !== undefined && patientFilter !== "") {
    const parsed = Number(patientFilter);
    where.patient_id = Number.isInteger(parsed) ? parsed : -1;
  }
  return where;
};

export const listPrescriptions = (where: Prisma.PrescriptionWhereInput) =>
  prisma.prescription.findMany({
    where,
    include: RX_ITEM_INCLUDE,
    orderBy: { created_at: "desc" },
  });

export const findPrescriptionOwned = (id: number, doctorId?: number) =>
  prisma.prescription.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
    include: RX_ITEM_INCLUDE,
  });

export const countPrescriptions = (where: Prisma.PrescriptionWhereInput) =>
  prisma.prescription.count({ where });

/** Creates the prescription and its medication lines in one statement. */
export const createPrescription = (
  data: {
    doctor_id: number;
    patient_id: number;
    appointment_id?: number | null;
    treatment_id?: number | null;
    notes?: string;
    items: {
      medication: string;
      dosage?: string;
      frequency?: string;
      route?: string;
      duration_days?: number | null;
      refills?: number;
      instructions?: string;
    }[];
  },
  tx?: Prisma.TransactionClient
) =>
  (tx ?? prisma).prescription.create({
    data: {
      doctor_id: data.doctor_id,
      patient_id: data.patient_id,
      appointment_id: data.appointment_id ?? null,
      treatment_id: data.treatment_id ?? null,
      notes: data.notes ?? "",
      items: {
        create: data.items.map((item, index) => ({
          medication: item.medication,
          dosage: item.dosage ?? "",
          frequency: item.frequency ?? "",
          route: item.route ?? "",
          duration_days: item.duration_days ?? null,
          refills: item.refills ?? 0,
          instructions: item.instructions ?? "",
          sort_order: index,
        })),
      },
    },
    include: RX_ITEM_INCLUDE,
  });

/** Replaces the medication lines wholesale (delete + recreate, same order). */
export const updatePrescription = async (
  id: number,
  data: { notes?: string; items?: { medication: string; dosage?: string; frequency?: string; route?: string; duration_days?: number | null; refills?: number; instructions?: string }[] }
): Promise<PrescriptionRow> => {
  if (data.items === undefined) {
    return prisma.prescription.update({
      where: { id },
      data: { ...(data.notes !== undefined ? { notes: data.notes } : {}) },
      include: RX_ITEM_INCLUDE,
    });
  }
  return prisma.$transaction(async (tx) => {
    await tx.prescriptionItem.deleteMany({ where: { prescription_id: id } });
    return tx.prescription.update({
      where: { id },
      data: {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        items: {
          create: data.items!.map((item, index) => ({
            medication: item.medication,
            dosage: item.dosage ?? "",
            frequency: item.frequency ?? "",
            route: item.route ?? "",
            duration_days: item.duration_days ?? null,
            refills: item.refills ?? 0,
            instructions: item.instructions ?? "",
            sort_order: index,
          })),
        },
      },
      include: RX_ITEM_INCLUDE,
    });
  });
};

export const deletePrescription = (id: number) =>
  prisma.prescription.delete({ where: { id } });
