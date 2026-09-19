/**
 * Doctor discovery API (§27 — /api/doctors/*, backend slice B3).
 *
 * Public endpoints:
 *  - GET /api/doctors/              — paginated list + search + filters
 *  - GET /api/doctors/:id/         — single doctor profile
 *  - GET /api/doctors/:id/availability/?date=YYYY-MM-DD — available slots
 *  - GET /api/doctors/me/schedule/ — doctor's own schedule (doctor role)
 *  - GET /api/doctors/me/schedule/:id/ — single schedule window
 */

import { apiGet, apiPatch } from "./client";
import type {
  Envelope,
  Paginated,
  DoctorProfile,
  DoctorAvailability,
  ScheduleItem,
} from "./types";

/** Query parameters accepted by GET /api/doctors/. */
export interface ListDoctorsParams {
  search?: string;
  specialty?: number;
  city?: string;
  hospital?: number;
  min_rating?: number;
  page?: number;
  page_size?: number;
}

/** GET /api/doctors/ — paginated doctor directory with search + filters. */
export function listDoctors(params: ListDoctorsParams = {}): Promise<
  Envelope<Paginated<DoctorProfile>>
> {
  return apiGet<Paginated<DoctorProfile>>("/doctors/", params as Record<string, unknown>);
}

/** GET /api/doctors/:id/ — a single doctor's public professional profile. */
export function getDoctor(id: number): Promise<Envelope<DoctorProfile>> {
  return apiGet<DoctorProfile>(`/doctors/${id}/`);
}

/** GET /api/doctors/:id/availability/?date=YYYY-MM-DD — available slots. */
export function getDoctorAvailability(
  id: number,
  date?: string
): Promise<Envelope<DoctorAvailability>> {
  const params: Record<string, unknown> = {};
  if (date) params.date = date;
  return apiGet<DoctorAvailability>(`/doctors/${id}/availability/`, params);
}

/** GET /api/doctors/me/schedule/ — the signed-in doctor's schedule windows. */
export function getMySchedule(): Promise<Envelope<Paginated<ScheduleItem>>> {
  return apiGet<Paginated<ScheduleItem>>("/doctors/me/schedule/");
}

/** GET /api/doctors/me/schedule/:id/ — a single schedule window. */
export function getMyScheduleItem(id: number): Promise<Envelope<ScheduleItem>> {
  return apiGet<ScheduleItem>(`/doctors/me/schedule/${id}/`);
}

export function getMyDoctorProfile(): Promise<Envelope<DoctorProfile>> {
  return apiGet<DoctorProfile>("/doctors/me/profile/");
}

export function updateMyDoctorProfile(
  payload: Partial<Pick<DoctorProfile, "specialties" | "hospitals" | "qualifications" | "experience_years" | "consultation_fee" | "bio" | "is_available">>
): Promise<Envelope<DoctorProfile>> {
  return apiPatch<DoctorProfile>("/doctors/me/profile/", payload);
}
