/**
 * Doctor service — public directory (list/retrieve with Django filters),
 * owner/admin writes, my-profile PATCH and admin approval
 * (port of doctors/views.py). Earnings live in earnings below.
 */
import { ValidationError, notFound, forbidden } from "@/lib/errors";
import { doctorDto } from "@/lib/serializers";
import { doctorWriteSchema } from "@/validators/doctor";
import { parse } from "@/validators/base";
import * as doctors from "@/repositories/doctors.repo";
import * as admin from "@/repositories/admin.repo";
import type { AuthUser } from "@/lib/auth";

type DoctorWriteInput = ReturnType<typeof parseDoctorWrite>;

const ownershipForbidden = () => forbidden("You do not have permission to perform this action.");

const checkOwner = (user: AuthUser, doctorUserId: number): boolean =>
  user.is_superuser || user.role === "admin" || doctorUserId === user.id;

export function parseDoctorWrite(body: unknown) {
  return parse(doctorWriteSchema, body);
}

/** Validates FK id arrays exactly like DRF PrimaryKeyRelatedField(many). */
async function validateRelationIds(input: DoctorWriteInput) {
  const errors: Record<string, string[]> = {};
  if (input.specialties !== undefined) {
    const { findSpecialty } = await import("@/repositories/content.repo");
    for (const raw of input.specialties) {
      const id = Number(raw);
      if (!Number.isInteger(id) || !(await findSpecialty(id))) {
        (errors.specialties ??= []).push(`Invalid pk "${raw}" - object does not exist.`);
      }
    }
  }
  if (input.hospitals !== undefined) {
    const { findHospital } = await import("@/repositories/content.repo");
    for (const raw of input.hospitals) {
      const id = Number(raw);
      if (!Number.isInteger(id) || !(await findHospital(id))) {
        (errors.hospitals ??= []).push(`Invalid pk "${raw}" - object does not exist.`);
      }
    }
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
}

/** Applies DoctorWriteSerializer fields (including M2M replacement). */
export async function applyDoctorWrite(doctorId: number, input: DoctorWriteInput) {
  await validateRelationIds(input);
  const data: Record<string, unknown> = {};
  for (const key of [
    "qualifications", "experience_years", "consultation_fee", "bio", "city",
    "office_address", "is_available",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  // Explicit join models (compound PK) — replace the set: clear then recreate.
  if (input.specialties !== undefined) {
    data.specialties = {
      deleteMany: {},
      create: input.specialties.map((id) => ({ specialty_id: Number(id) })),
    };
  }
  if (input.hospitals !== undefined) {
    data.hospitals = {
      deleteMany: {},
      create: input.hospitals.map((id) => ({ hospital_id: Number(id) })),
    };
  }
  if (Object.keys(data).length > 0) {
    const { prisma } = await import("@/lib/db");
    await prisma.doctor.update({ where: { id: doctorId }, data: data as never });
  }
}

/** GET /api/doctors/{id}/ — only is_available doctors are publicly visible. */
export async function retrieveDoctor(req: Request, id: number) {
  const doctor = await doctors.findAvailableDoctorById(id);
  if (!doctor) throw notFound();
  return doctorDto(doctor, req);
}

/** PUT/PATCH /api/doctors/{id}/ — owner or admin only. */
export async function updateDoctor(req: Request, user: AuthUser, id: number, body: unknown) {
  const doctor = await doctors.findDoctorById(id);
  if (!doctor || !doctor.is_available) throw notFound();
  if (!checkOwner(user, doctor.user_id)) throw ownershipForbidden();
  await applyDoctorWrite(doctor.id, parseDoctorWrite(body));
  const refreshed = await doctors.findDoctorById(id);
  return doctorDto(refreshed!, req);
}

/** DELETE /api/doctors/{id}/ — profile row only (user account survives). */
export async function destroyDoctor(user: AuthUser, id: number): Promise<void> {
  const doctor = await doctors.findDoctorById(id);
  if (!doctor || !doctor.is_available) throw notFound();
  if (!checkOwner(user, doctor.user_id)) throw ownershipForbidden();
  const { prisma } = await import("@/lib/db");
  await prisma.doctor.delete({ where: { id } });
}

/** POST /api/doctors/ — create own profile (Django's route crashed; documented). */
export async function createOwnDoctorProfile(user: AuthUser, body: unknown) {
  const existing = await doctors.findDoctorByUserId(user.id);
  if (existing) {
    throw new ValidationError({ non_field_errors: ["You already have a doctor profile."] });
  }
  const doctor = await doctors.createDoctor(user.id);
  await applyDoctorWrite(doctor.id, parseDoctorWrite(body));
  return doctors.findDoctorById(doctor.id);
}

/**
 * PATCH /api/doctors/me/profile/ — display name lives on User, professional
 * fields on Doctor (MyDoctorProfileView).
 */
export async function updateMyProfile(req: Request, user: AuthUser, body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const { first_name, last_name, ...rest } = raw;

  if (first_name !== undefined || last_name !== undefined) {
    const { updateUser } = await import("@/repositories/users.repo");
    await updateUser(user.id, {
      ...(first_name !== undefined ? { first_name: String(first_name).trim() } : {}),
      ...(last_name !== undefined ? { last_name: String(last_name).trim() } : {}),
    });
  }

  let doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) doctor = await doctors.createDoctor(user.id); // get_or_create
  await applyDoctorWrite(doctor.id, parseDoctorWrite(rest));
  doctor = await doctors.findDoctorById(doctor.id);
  return doctorDto(doctor!, req);
}

/** GET /api/doctors/me/earnings/ — EarningsDashboardView (exact shapes). */
export async function earningsDashboard(user: AuthUser) {
  const doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) return null; // Django: data=None + "Doctor profile not found."

  const fee = Number(doctor.consultation_fee ?? 0);
  const money = (value: number) => Math.round(value * 100) / 100;
  const { todayIso, addDaysIso, EN_WEEKDAYS } = await import("@/lib/dates");
  const today = todayIso();
  const jsDay = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun
  const weekStart = addDaysIso(today, -((jsDay + 6) % 7)); // Monday
  const monthStart = `${today.slice(0, 7)}-01`;
  const thirtyStart = addDaysIso(today, -29);

  const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
  const countOn = (date: string) =>
    admin.earningsCounts(doctor.id, { from: toDate(date), to: toDate(date) });
  const [todayCount, weekCount, monthCount, daily] = await Promise.all([
    countOn(today),
    admin.earningsCounts(doctor.id, { from: toDate(weekStart), to: toDate(today) }),
    admin.earningsCounts(doctor.id, { from: toDate(monthStart), to: toDate(today) }),
    admin.earningsDaily(doctor.id, toDate(thirtyStart), toDate(today)),
  ]);

  const dailyMap = new Map<string, number>(
    daily.map((row) => [row.appointment_date.toISOString().slice(0, 10), row._count._all])
  );
  const dailyBreakdown: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 30; i += 1) {
    const date = addDaysIso(thirtyStart, i);
    const count = dailyMap.get(date) ?? 0;
    dailyBreakdown.push({ date, appointments: count, earnings: money(count * fee) });
  }

  const weekDaily: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDaysIso(weekStart, i);
    if (date > today) break;
    const count = await countOn(date);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    weekDaily.push({
      date,
      day: EN_WEEKDAYS[(weekday + 6) % 7],
      appointments: count,
      earnings: money(count * fee),
    });
  }

  return {
    consultation_fee: fee,
    today: { appointments: todayCount, earnings: money(todayCount * fee) },
    this_week: { appointments: weekCount, earnings: money(weekCount * fee) },
    this_month: { appointments: monthCount, earnings: money(monthCount * fee) },
    daily_30_days: dailyBreakdown,
    week_daily: weekDaily,
  };
}

/** POST /api/admin/doctors/{id}/approve/ — availability toggle + recalc. */
export async function adminApprove(req: Request, actor: AuthUser, doctorId: number, isAvailable: boolean) {
  const doctor = await doctors.findDoctorById(doctorId);
  if (!doctor) throw notFound();
  const { prisma } = await import("@/lib/db");
  await prisma.doctor.update({ where: { id: doctorId }, data: { is_available: isAvailable } });
  const aggregate = await doctors.ratingAggregate(doctorId);
  if (aggregate._avg.rating !== null) {
    await doctors.saveDoctorRating(doctorId, aggregate._avg.rating, aggregate._count.id);
  }
  await admin.recordAudit(actor.id, "doctor.approved", String(doctorId), "Doctor availability updated");
  const refreshed = await doctors.findDoctorById(doctorId);
  return doctorDto(refreshed!, req);
}

/** POST /api/admin/doctors/{id}/delete/ — remove doctor profile + user account (admin only). */
export async function adminDeleteDoctor(user: AuthUser, id: number): Promise<void> {
  const actor = user;
  const doctor = await doctors.findDoctorById(id);
  if (!doctor) throw notFound("Doctor not found.");
  const userRow = doctor.user;
  if (userRow.is_superuser || userRow.role === "admin") {
    throw forbidden("Admin accounts cannot be deleted here.");
  }
  const fullName = [userRow.first_name, userRow.last_name].filter(Boolean).join(" ") || userRow.username;
  const { prisma } = await import("@/lib/db");
  await prisma.user.delete({ where: { id: userRow.id } });
  await admin.recordAudit(
    actor.id,
    "doctor.deleted",
    String(id),
    `Deleted Dr. ${fullName} and their account`,
  );
}
