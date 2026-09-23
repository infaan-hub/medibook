/**
 * Patient service — own profile GET/PATCH (patients/views.py) and the
 * doctor-facing patient detail view (treatments.views.PatientDetailView,
 * which only exposes patients the doctor has appointments with).
 */
import { getOrCreatePatient, updatePatient, findPatientsByUserIds } from "@/repositories/users.repo";
import { hasAppointmentsWithPatient } from "@/repositories/appointments.repo";
import { patientProfileSchema } from "@/validators/doctor";
import { parse } from "@/validators/base";
import { patientDto } from "@/lib/serializers";
import type { AuthUser } from "@/lib/auth";

/** GET /api/patients/profile/ — creates the profile row on first access. */
export async function getProfile(user: AuthUser) {
  const profile = await getOrCreatePatient(user.id);
  if (!profile) {
    const { notFound } = await import("@/lib/errors");
    throw notFound("Patient profile not found.");
  }
  return patientDto(profile);
}

/** PATCH/PUT /api/patients/profile/ — partial update of clinical details. */
export async function updateProfile(user: AuthUser, body: unknown) {
  const input = parse(patientProfileSchema, body);
  await getOrCreatePatient(user.id); // get_or_create before saving
  const data: Record<string, unknown> = {};
  const keys = [
    "date_of_birth", "gender", "address", "city", "emergency_contact_name",
    "emergency_contact_phone", "blood_group", "allergies", "medical_history",
    "reminder_preferences",
  ] as const;
  for (const key of keys) {
    if (input[key] !== undefined) {
      data[key] = key === "date_of_birth" && input[key] ? new Date(`${input[key]}T00:00:00Z`) : input[key];
    }
  }
  const profile = await updateProfileRow(user.id, data);
  return patientDto(profile);
}

async function updateProfileRow(userId: number, data: Record<string, unknown>) {
  const { updatePatient } = await import("@/repositories/users.repo");
  return updatePatient(userId, data);
}

/**
 * GET /api/patients/{user_id}/ — doctor view of a patient's profile.
 * Returns data:null with an explanatory message unless the doctor has at
 * least one appointment with that patient (Django parity).
 */
export async function getPatientDetail(user: AuthUser, targetUserId: number) {
  const { findDoctorByUserId } = await import("@/repositories/doctors.repo");
  const doctor = await findDoctorByUserId(user.id);
  if (!doctor) return { data: null, message: "Doctor profile not found." };

  const linked = await hasAppointmentsWithPatient(doctor.id, targetUserId);
  if (!linked) return { data: null, message: "Access denied. No appointment with this patient." };

  const { getPatientProfile } = await import("@/repositories/users.repo");
  const profile = await getPatientProfile(targetUserId);
  if (!profile) return { data: null, message: "Patient profile not found." };
  return { data: patientDto(profile) as unknown, message: "" };
}

export { findPatientsByUserIds, updatePatient, getOrCreatePatient };
