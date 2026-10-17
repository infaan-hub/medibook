/** POST /api/blog/articles/{slug}/like/ — toggle the caller's like. */
import { handler, ok, notFound, requireAuth } from "@/lib/route";
import * as content from "@/services/content.service";

export const POST = handler(async (ctx) => {
  const actor = await requireAuth(ctx.req);
  const slug = ctx.params.slug;
  if (!slug) throw notFound();
  return ok(await content.toggleArticleLike(actor, slug), "Like updated.");
});