/** GET/POST /api/reviews/ — patient's own reviews (paginated). */
import { handler, ok, created, readJson, requireAuth, requirePatient, badRequest } from "@/lib/route";
import { reviewDto } from "@/lib/serializers";
import { paginate } from "@/lib/pagination";
import * as reviews from "@/services/review.service";
import * as repo from "@/repositories/notifications.repo";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const isAdmin = user.is_superuser || user.role === "admin";
  return paginate({
    req: ctx.req,
    where: { patient_id: user.id },
    count: () => repo.countReviewsForUser(user.id, isAdmin),
    fetch: ({ skip, take }) =>
      repo.listReviewsForUser(user.id, isAdmin, skip, take).then((rows) => rows.map(reviewDto)),
    fetchAll: async () =>
      repo.listReviewsForUser(user.id, isAdmin, 0, 1000).then((rows) => rows.map(reviewDto)),
  });
});

export const POST = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const body = (await readJson(ctx.req)) as { appointment?: number; appointment_id?: number };
  const appointmentId = body.appointment ?? body.appointment_id;
  if (!appointmentId) throw badRequest("appointment is required.");
  const review = await reviews.submitReview(ctx.req, user, appointmentId, body);
  return created(review, "Review submitted.");
});
