/**
 * Doctor service — public directory (list/retrieve with Django filters),
 * owner/admin writes, my-profile PATCH and admin approval
 * (port of doctors/views.py).
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
  const { first_name, last_name, phone, ...rest } = raw;

  // Display name AND contact number live on User (card fields doctors edit).
  const account: { first_name?: string; last_name?: string; phone?: string } = {};
  if (first_name !== undefined) account.first_name = String(first_name).trim();
  if (last_name !== undefined) account.last_name = String(last_name).trim();
  if (phone !== undefined) {
    const value = String(phone).trim();
    if (value.length > 16) {
      throw new ValidationError({ phone: ["Ensure this string has at most 16 characters."] });
    }
    account.phone = value;
  }
  if (Object.keys(account).length > 0) {
    const { updateUser } = await import("@/repositories/users.repo");
    await updateUser(user.id, account);
  }

  let doctor = await doctors.findDoctorByUserId(user.id);
  if (!doctor) doctor = await doctors.createDoctor(user.id); // get_or_create
  await applyDoctorWrite(doctor.id, parseDoctorWrite(rest));
  doctor = await doctors.findDoctorById(doctor.id);
  return doctorDto(doctor!, req);
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
