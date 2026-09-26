/**
 * Patient profile API (§27 — /api/patients/profile/, backend slice B2).
 */
import { apiGet, apiPatch } from "./client";
import type {
  Envelope,
  LinkedDoctor,
  PatientProfile,
  UpdatePatientProfilePayload,
} from "./types";

/** GET /api/patients/profile/ — the signed-in patient's extended profile. */
export function getPatientProfile(): Promise<Envelope<PatientProfile>> {
  return apiGet<PatientProfile>("/patients/profile/");
}

/** GET /api/patients/<userId>/ — view a patient's profile (doctors with appointments only). */
export function getPatientProfileById(userId: number): Promise<Envelope<PatientProfile>> {
  return apiGet<PatientProfile>(`/patients/${userId}/`);
}

/**
 * GET /api/patients/linked-doctors/ — doctors this patient has an appointment
 * with: the only ones a health record may be shared with.
 */
export function getLinkedDoctors(): Promise<Envelope<LinkedDoctor[]>> {
  return apiGet<LinkedDoctor[]>("/patients/linked-doctors/");
}

/** PATCH /api/patients/profile/ — update clinical/contact details. */
export function updatePatientProfile(
  patch: UpdatePatientProfilePayload
): Promise<Envelope<PatientProfile>> {
  return apiPatch<PatientProfile>("/patients/profile/", patch);
}
