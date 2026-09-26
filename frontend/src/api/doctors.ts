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

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  Envelope,
  Paginated,
  DoctorProfile,
  DoctorAvailability,
  DoctorAvailableDays,
  AvailabilityBreak,
  ScheduleException,
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

/** GET /api/doctors/:id/available-days/?year=YYYY&month=MM — days with slots in a month. */
export function getDoctorAvailableDays(
  id: number,
  year: number,
  month: number
): Promise<Envelope<DoctorAvailableDays>> {
  return apiGet<DoctorAvailableDays>(`/doctors/${id}/available-days/`, { year, month });
}

/** GET /api/doctors/me/schedule/ — the signed-in doctor's schedule windows. */
export function getMySchedule(): Promise<Envelope<ScheduleItem[]>> {
  return apiGet<ScheduleItem[]>("/doctors/me/schedule/");
}

export function getMyDoctorProfile(): Promise<Envelope<DoctorProfile>> {
  return apiGet<DoctorProfile>("/doctors/me/profile/");
}

export function updateMyDoctorProfile(
  payload: Partial<
    Pick<
      DoctorProfile,
      | "first_name"
      | "last_name"
      | "hospitals"
      | "qualifications"
      | "experience_years"
      | "consultation_fee"
      | "bio"
      | "city"
      | "office_address"
      | "is_available"
    >
  > & {
    /** Specialty ids (backend replaces the M2M set with these ids). */
    specialties?: number[];
  }
): Promise<Envelope<DoctorProfile>> {
  return apiPatch<DoctorProfile>("/doctors/me/profile/", payload);
}
/** POST /api/doctors/me/schedule/ - add a new availability window. */
export function createScheduleItem(
  payload: Omit<ScheduleItem, "id" | "date_created" | "date_updated">
): Promise<Envelope<ScheduleItem>> {
  return apiPost<ScheduleItem>("/doctors/me/schedule/", payload);
}

/** PATCH /api/doctors/me/schedule/:id/ - update an existing window. */
export function updateScheduleItem(
  id: number,
  payload: Partial<ScheduleItem>
): Promise<Envelope<ScheduleItem>> {
  return apiPatch<ScheduleItem>("/doctors/me/schedule/" + id + "/", payload);
}

/** DELETE /api/doctors/me/schedule/:id/ - remove a window. */
export function deleteScheduleItem(id: number): Promise<void> {
  return apiDelete("/doctors/me/schedule/" + id + "/").then(() => undefined);
}

export function listAvailabilityBreaks(scheduleId: number): Promise<Envelope<AvailabilityBreak[]>> {
  return apiGet<AvailabilityBreak[]>(`/doctors/me/schedule/${scheduleId}/breaks/`);
}

export function createAvailabilityBreak(scheduleId: number, payload: Omit<AvailabilityBreak, "id">): Promise<Envelope<AvailabilityBreak>> {
  return apiPost<AvailabilityBreak>(`/doctors/me/schedule/${scheduleId}/breaks/`, payload);
}

export function deleteAvailabilityBreak(id: number): Promise<void> {
  return apiDelete(`/doctors/me/schedule/breaks/${id}/`).then(() => undefined);
}

export function listScheduleExceptions(): Promise<Envelope<ScheduleException[]>> {
  return apiGet<ScheduleException[]>("/doctors/me/schedule/exceptions/");
}

export function createScheduleException(payload: Omit<ScheduleException, "id">): Promise<Envelope<ScheduleException>> {
  return apiPost<ScheduleException>("/doctors/me/schedule/exceptions/", payload);
}

export function deleteScheduleException(id: number): Promise<void> {
  return apiDelete(`/doctors/me/schedule/exceptions/${id}/`).then(() => undefined);
}
