/**
 * Admin API — dashboard stats, user directory, doctor management.
 * Backend: /api/admin/stats/, /api/admin/users/, /api/admin/doctors/{id}/approve/.
 */

import { apiGet, apiPost } from "./client";
import type { DoctorProfile, Envelope, Paginated, User } from "./types";

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
