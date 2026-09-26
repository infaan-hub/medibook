/**
 * Doctor directory + schedule repository (profiles, availability windows,
 * breaks, schedule exceptions, M2M links).
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Everything doctorDto() needs in one include. */
export const DOCTOR_INCLUDE = {
  user: true,
  specialties: { include: { specialty: true } },
  hospitals: true,
} satisfies Prisma.DoctorInclude;

export type DoctorWithRelations = Prisma.DoctorGetPayload<{ include: typeof DOCTOR_INCLUDE }>;

export const findDoctorById = (id: number) =>
  prisma.doctor.findUnique({ where: { id }, include: DOCTOR_INCLUDE });

/** Django's DoctorViewSet.get_queryset(): only is_available=True doctors. */
export const findAvailableDoctorById = async (id: number) => {
  const doctor = await prisma.doctor.findUnique({ where: { id }, include: DOCTOR_INCLUDE });
  return doctor && doctor.is_available ? doctor : null;
};

export const findDoctorByUserId = (userId: number) =>
  prisma.doctor.findUnique({ where: { user_id: userId }, include: DOCTOR_INCLUDE });

export const createDoctor = (userId: number) =>
  prisma.doctor.create({ data: { user_id: userId }, include: DOCTOR_INCLUDE });

export const doctorExists = async (userId: number) =>
  (await prisma.doctor.findUnique({ where: { user_id: userId } })) !== null;

export interface DoctorListFilters {
  search?: string;
  specialty?: string;
  city?: string;
  hospital?: string;
  minRating?: string;
}

/** Port of DoctorViewSet.get_queryset() filtering (icontains + distinct). */
export function doctorListWhere(filters: DoctorListFilters): Prisma.DoctorWhereInput {
  const where: Prisma.DoctorWhereInput = { is_available: true };
  const AND: Prisma.DoctorWhereInput[] = [];

  if (filters.search) {
    AND.push({
      OR: [
        { user: { first_name: { contains: filters.search, mode: "insensitive" } } },
        { user: { last_name: { contains: filters.search, mode: "insensitive" } } },
        { office_address: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  if (filters.specialty) {
    AND.push({ specialties: { some: { specialty_id: Number(filters.specialty) } } });
  }
  if (filters.city) {
    AND.push({
      OR: [
        { city: { contains: filters.city, mode: "insensitive" } },
        { hospitals: { some: { hospital: { city: { contains: filters.city, mode: "insensitive" } } } } },
      ],
    });
  }
  if (filters.hospital) {
    AND.push({ hospitals: { some: { hospital_id: Number(filters.hospital) } } });
  }
  if (filters.minRating) {
    const rating = Number(filters.minRating);
    if (Number.isFinite(rating)) where.average_rating = { gte: rating };
  }
  if (AND.length > 0) where.AND = AND;
  return where;
}

export const countDoctors = (where: Prisma.DoctorWhereInput) => prisma.doctor.count({ where });

export const listDoctors = (where: Prisma.DoctorWhereInput, skip: number, take: number) =>
  prisma.doctor.findMany({
    where,
    include: DOCTOR_INCLUDE,
    orderBy: { created_at: "desc" },
    skip,
    take,
  });

/**
 * Doctors a patient can share health records with — every doctor the patient
 * has (or had) an appointment with. Sharing outside this set is rejected
 * server-side by treatment.service.createHealthRecord().
 */
export const listDoctorsForPatient = (patientUserId: number) =>
  prisma.doctor.findMany({
    where: { appointments: { some: { patient_id: patientUserId } } },
    include: DOCTOR_INCLUDE,
    orderBy: { id: "asc" },
  });

/* --------------------------- Availability windows -------------------------- */

export const listWindows = (doctorId: number) =>
  prisma.availability.findMany({
    where: { doctor_id: doctorId },
    orderBy: [{ weekday: "asc" }, { start_time: "asc" }],
  });

export const listActiveWindowsForWeekday = (doctorId: number, weekday: number) =>
  prisma.availability.findMany({
    where: { doctor_id: doctorId, weekday, is_active: true },
    orderBy: { start_time: "asc" },
    include: { breaks: { orderBy: { start_time: "asc" } } },
  });

export const findWindow = (id: number, doctorId?: number) =>
  prisma.availability.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
    include: { breaks: true },
  });

export const createWindow = (doctorId: number, data: { weekday: number; start_time: string; end_time: string; slot_duration_minutes?: number; is_active?: boolean }) =>
  prisma.availability.create({
    data: {
      doctor_id: doctorId,
      weekday: data.weekday,
      start_time: data.start_time,
      end_time: data.end_time,
      slot_duration_minutes: data.slot_duration_minutes ?? 30,
      is_active: data.is_active ?? true,
    },
  });

export const updateWindow = (id: number, data: Prisma.AvailabilityUncheckedUpdateInput) =>
  prisma.availability.update({ where: { id }, data });

export const deleteWindow = (id: number) => prisma.availability.delete({ where: { id } });

/* --------------------------------- Breaks ---------------------------------- */

export const listBreaks = (windowId: number) =>
  prisma.availabilityBreak.findMany({
    where: { availability_id: windowId },
    orderBy: { start_time: "asc" },
  });

export const findBreakOwned = (id: number, doctorId: number) =>
  prisma.availabilityBreak.findFirst({
    where: { id, availability: { doctor_id: doctorId } },
    include: { availability: true },
  });

export const overlappingBreakExists = async (
  windowId: number,
  start: string,
  end: string,
  excludeId?: number
) =>
  (await prisma.availabilityBreak.findFirst({
    where: {
      availability_id: windowId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      start_time: { lt: end },
      end_time: { gt: start },
    },
  })) !== null;

export const createBreak = (windowId: number, start: string, end: string) =>
  prisma.availabilityBreak.create({
    data: { availability_id: windowId, start_time: start, end_time: end },
  });

export const updateBreak = (id: number, data: Prisma.AvailabilityBreakUncheckedUpdateInput) =>
  prisma.availabilityBreak.update({ where: { id }, data });

export const deleteBreak = (id: number) => prisma.availabilityBreak.delete({ where: { id } });

/* -------------------------- Schedule exceptions ---------------------------- */

export const listExceptions = (doctorId: number) =>
  prisma.scheduleException.findMany({
    where: { doctor_id: doctorId },
    orderBy: [{ date: "asc" }, { start_time: "asc" }],
  });

export const listExceptionsForDate = (doctorId: number, date: string) =>
  prisma.scheduleException.findMany({
    where: { doctor_id: doctorId, date: new Date(`${date}T00:00:00Z`) },
  });

export const findExceptionOwned = (id: number, doctorId?: number) =>
  prisma.scheduleException.findFirst({
    where: doctorId === undefined ? { id } : { id, doctor_id: doctorId },
  });

export const createException = (
  doctorId: number,
  data: { date: string; start_time?: string | null; end_time?: string | null; reason?: string }
) =>
  prisma.scheduleException.create({
    data: {
      doctor_id: doctorId,
      date: new Date(`${data.date}T00:00:00Z`),
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      reason: data.reason ?? "",
    },
  });

export const updateException = (id: number, data: Prisma.ScheduleExceptionUncheckedUpdateInput) =>
  prisma.scheduleException.update({ where: { id }, data });

export const deleteException = (id: number) => prisma.scheduleException.delete({ where: { id } });

/* --------------------------------- Ratings --------------------------------- */

export const ratingAggregate = (doctorId: number) =>
  prisma.review.aggregate({
    where: { doctor_id: doctorId, is_visible: true },
    _avg: { rating: true },
    _count: { id: true },
  });

export const saveDoctorRating = (doctorId: number, average: number, total: number) =>
  prisma.doctor.update({
    where: { id: doctorId },
    data: { average_rating: average, total_reviews: total },
  });

/** Raw professional-field update (admin doctor creation path). */
export const applyDoctorFields = (
  doctorId: number,
  data: {
    qualifications?: string;
    experience_years?: number;
    consultation_fee?: number;
    bio?: string;
    city?: string;
    office_address?: string;
  }
) =>
  prisma.doctor.update({
    where: { id: doctorId },
    data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
  });


