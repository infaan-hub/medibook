/**
 * Reviews API — submit, list, delete.
 * Backend: /api/appointments/{id}/review/, /api/doctors/{id}/reviews/, /api/reviews/.
 */

import { apiDelete, apiGet, apiPost } from "./client";
import type { Envelope, Paginated, Review } from "./types";

/** POST /api/appointments/:id/review/ — submit a review for a completed appointment. */
export function submitReview(
  appointmentId: number,
  payload: { rating: number; comment?: string }
): Promise<Envelope<Review>> {
  return apiPost<Review>(`/appointments/${appointmentId}/review/`, payload);
}

/** GET /api/doctors/:id/reviews/ — public visible reviews for a doctor. */
export function getDoctorReviews(doctorId: number): Promise<Envelope<Review[]>> {
  return apiGet<Review[]>(`/doctors/${doctorId}/reviews/`);
}

/** GET /api/reviews/ — the signed-in patient's own reviews (paginated). */
export function listMyReviews(): Promise<Envelope<Paginated<Review>>> {
  return apiGet<Paginated<Review>>("/reviews/");
}

/** DELETE /api/reviews/:id/ — delete a review. */
export function deleteReview(id: number): Promise<void> {
  return apiDelete(`/reviews/${id}/`).then(() => undefined);
}
