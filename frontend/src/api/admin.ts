/**
 * Admin API — dashboard stats, user directory, doctor management.
 * Backend: /api/admin/stats/, /api/admin/users/, /api/admin/doctors/{id}/approve/.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { AuditEvent, DoctorProfile, Envelope, Paginated, User } from "./types";

/** Admin dashboard statistics. */
export interface AdminStats {
  users: number;
  patients: number;
  doctors: number;
  appointments: number;
  appointments_by_status: Record<string, number>;
}

export function getAdminStats(): Promise<Envelope<AdminStats>> {
  return apiGet<AdminStats>("/admin/stats/");
}

/** Paginated user directory with optional role filter. */
export function listAdminUsers(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<User>>> {
  return apiGet<Paginated<User>>("/admin/users/", params);
}

/** Approve or suspend a doctor (toggle is_available). */
export function approveDoctor(
  doctorId: number,
  isAvailable: boolean
): Promise<Envelope<DoctorProfile>> {
  return apiPost<DoctorProfile>(`/admin/doctors/${doctorId}/approve/`, {
    is_available: isAvailable,
  });
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: "patient" | "doctor" | "coordinator";
}

export interface DoctorFeePayload {
  appointment_fee?: string;
  home_service_fee?: string;
  psychotherapy_fee?: string;
  training_fee?: string;
}

export interface CreateDoctorPayload extends DoctorFeePayload {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  qualifications?: string;
  experience_years?: number;
  /** Legacy single fee; the admin form now sends `appointment_fee`. */
  consultation_fee?: string;
  bio?: string;
}

/** GET /api/admin/doctors/{id}/ — full profile for the admin detail page. */
export function getAdminDoctor(doctorId: number): Promise<Envelope<DoctorProfile>> {
  return apiGet<DoctorProfile>(`/admin/doctors/${doctorId}/`);
}

/**
 * PATCH /api/admin/doctors/{id}/ — the only path that can change service fees.
 * Doctor-facing profile endpoints ignore these fields.
 */
export function updateAdminDoctorFees(
  doctorId: number,
  fees: DoctorFeePayload
): Promise<Envelope<DoctorProfile>> {
  return apiPatch<DoctorProfile>(`/admin/doctors/${doctorId}/`, fees);
}

export function createAdminUser(payload: CreateUserPayload): Promise<Envelope<User>> {
  return apiPost<User>("/admin/users/create/", payload);
}

export function createAdminDoctor(payload: CreateDoctorPayload): Promise<Envelope<DoctorProfile>> {
  return apiPost<DoctorProfile>("/admin/doctors/create/", payload);
}

/** DELETE /api/admin/users/{id}/ — remove a patient or doctor account. */
export function deleteAdminUser(userId: number): Promise<Envelope<null> | undefined> {
  return apiDelete<null>(`/admin/users/${userId}/`);
}

/** POST /api/admin/users/{id}/unlock/ — lift a lock + reset its attempt counter. */
export function unlockAdminUser(userId: number): Promise<Envelope<User>> {
  return apiPost<User>(`/admin/users/${userId}/unlock/`);
}

/** DELETE /api/admin/doctors/{id}/ — remove a doctor profile and their account. */
export function deleteAdminDoctor(doctorId: number): Promise<Envelope<null> | undefined> {
  return apiDelete<null>(`/admin/doctors/${doctorId}/`);
}

export function listAuditEvents(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<AuditEvent>>> {
  return apiGet<Paginated<AuditEvent>>("/admin/audit/", params);
}

/** DELETE /api/admin/audit/ — clear the trail (rows also expire after 72h). */
export function clearAuditEvents(): Promise<Envelope<{ deleted: number }> | undefined> {
  return apiDelete<{ deleted: number }>("/admin/audit/");
}
