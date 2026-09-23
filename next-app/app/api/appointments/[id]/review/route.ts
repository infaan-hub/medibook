/** POST /api/appointments/{id}/review/ — patient reviews a completed visit. */
import { handler, created, intParam, notFound, readJson } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { submitReview } from "@/services/review.service";

export const POST = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const review = await submitReview(ctx.req, user, id, body);
  return created(review, "Review submitted.");
});
