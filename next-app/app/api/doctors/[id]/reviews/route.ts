import { handler, ok } from "@/lib/route";
import { publicDoctorReviews } from "@/services/review.service";

/** GET /api/doctors/{id}/reviews/ — public visible reviews (unpaginated). */
export const GET = handler(async ({ req, params }) => {
  return ok(await publicDoctorReviews(req, Number(params.id)));
});
