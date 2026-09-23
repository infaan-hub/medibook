/** GET/DELETE /api/reviews/{id}/ */
import { handler, ok, noContent, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as reviews from "@/services/review.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  return ok(await reviews.retrieveReview(user, id));
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await reviews.destroyReview(user, id);
  return noContent();
});
