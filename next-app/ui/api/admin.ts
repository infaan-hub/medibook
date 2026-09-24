/**
 * Admin API — dashboard stats, user directory, doctor management.
 * Backend: /api/admin/stats/, /api/admin/users/, /api/admin/doctors/{id}/approve/.
 */

import { apiDelete, apiGet, apiPost } from "./client";
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
  role: "patient" | "doctor";
}

export interface CreateDoctorPayload {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  qualifications?: string;
  experience_years?: number;
  consultation_fee?: string;
  bio?: string;
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

/** DELETE /api/admin/doctors/{id}/ — remove a doctor profile and their account. */
export function deleteAdminDoctor(doctorId: number): Promise<Envelope<null> | undefined> {
  return apiDelete<null>(`/admin/doctors/${doctorId}/`);
}

export function listAuditEvents(): Promise<Envelope<AuditEvent[]>> {
  return apiGet<AuditEvent[]>("/admin/audit/");
}
