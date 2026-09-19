/** Specialty & Hospital catalog API (§27 — /api/specialties/*, /api/hospitals/*, PHASE 8).

Public endpoints:
 - GET /api/specialties/              — paginated specialty list
 - GET /api/specialties/:id/          — single specialty detail
 - GET /api/hospitals/               — paginated hospital list (+ city filter)
 - GET /api/hospitals/:id/           — single hospital detail
 */

import { apiGet } from "./client";
import type { Envelope, Paginated, Specialty, Hospital } from "./types";

/** GET /api/specialties/ — paginated specialty list. */
export function listSpecialties(
  page = 1,
  pageSize = 10
): Promise<Envelope<Paginated<Specialty>>> {
  return apiGet<Paginated<Specialty>>("/specialties/", {
    page,
    page_size: pageSize,
  });
}

/** GET /api/specialties/:id/ — single specialty detail. */
export function getSpecialty(id: number): Promise<Envelope<Specialty>> {
  return apiGet<Specialty>(`/specialties/${id}/`);
}

/** GET /api/hospitals/ — paginated hospital list with optional city filter. */
export function listHospitals(
  city?: string,
  page = 1,
  pageSize = 10
): Promise<Envelope<Paginated<Hospital>>> {
  const params: Record<string, unknown> = { page, page_size: pageSize };
  if (city) params.city = city;
  return apiGet<Paginated<Hospital>>("/hospitals/", params);
}

/** GET /api/hospitals/:id/ — single hospital detail. */
export function getHospital(id: number): Promise<Envelope<Hospital>> {
  return apiGet<Hospital>(`/hospitals/${id}/`);
}