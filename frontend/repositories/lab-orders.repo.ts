/**
 * Lab orders repository — tests ordered by a doctor for a patient (phase 3).
 *
 * `labOrderWhere` mirrors `prescriptionWhere` / `vitalWhere` so every clinical
 * list gates identically; it is pure so the scoping rules stay unit-testable.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Ordering doctor's user is loaded so the serializer can name who ordered it. */
export const LAB_INCLUDE = {
  doctor: { include: { user: true } },
} as const;

type LabOrderRow = Prisma.LabOrderGetPayload<{ include: typeof LAB_INCLUDE }>;

/**
 * Role scoping for GET /api/lab-orders/:
 *
 * - patient → their own orders ONLY, whatever `?patient=` says
 * - doctor  → orders that doctor placed, optionally one patient
 * - admin   → empty set
 */
export const labOrderWhere = (
  role: string,
  userId: number,
  doctorId: number | null,
  patientFilter?: string
): Prisma.LabOrderWhereInput => {
  if (role === "patient") return { patient_id: userId };
  if (role !== "doctor") return { id: -1 };

  const where: Prisma.LabOrderWhereInput = { doctor_id: doctorId ?? -1 };
  if (patientFilter !== undefined && patientFilter !== "") {
    const parsed = Number(patientFilter);
    where.patient_id = Number.isInteger(parsed) ? parsed : -1;
  }
  return where;
};

export const listLabOrders = (where: Prisma.LabOrderWhereInput) =>
  prisma.labOrder.findMany({
    where,
    include: LAB_INCLUDE,
    orderBy: { ordered_at: "desc" },
  });

export const findLabOrderOwned = (id: number, doctorId?: number) =>
  prisma.labOrder.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
    include: LAB_INCLUDE,
  });

export const countLabOrders = (where: Prisma.LabOrderWhereInput) =>
  prisma.labOrder.count({ where });

export const createLabOrder = (
  data: {
    doctor_id: number;
    patient_id: number;
    appointment_id?: number | null;
    test_name: string;
    result_due_date?: Date | null;
    unit?: string;
    reference_min?: number | null;
    reference_max?: number | null;
    notes?: string;
    ordered_at?: Date;
  },
  tx?: Prisma.TransactionClient
): Promise<LabOrderRow> =>
  (tx ?? prisma).labOrder.create({
    data: {
      doctor_id: data.doctor_id,
      patient_id: data.patient_id,
      appointment_id: data.appointment_id ?? null,
      test_name: data.test_name,
      result_due_date: data.result_due_date ?? null,
      unit: data.unit ?? "",
      reference_min: data.reference_min ?? null,
      reference_max: data.reference_max ?? null,
      notes: data.notes ?? "",
      ...(data.ordered_at ? { ordered_at: data.ordered_at } : {}),
    },
    include: LAB_INCLUDE,
  });

export const updateLabOrder = (
  id: number,
  data: Prisma.LabOrderUncheckedUpdateInput
): Promise<LabOrderRow> =>
  prisma.labOrder.update({ where: { id }, data, include: LAB_INCLUDE });

export const deleteLabOrder = (id: number) => prisma.labOrder.delete({ where: { id } });
