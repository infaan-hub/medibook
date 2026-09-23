/** GET /api/blog/articles/{slug}/ — public article detail by slug. */
import { handler, ok, notFound } from "@/lib/route";
import * as content from "@/services/content.service";

export const GET = handler(async (ctx) => {
  const slug = ctx.params.slug;
  if (!slug) throw notFound();
  return ok(await content.publicArticleDetail(ctx.req, slug));
});
