/** GET/POST /api/blog/articles/ — public published articles (paginated). */
import { handler, ok, created, readJson, requireAdmin } from "@/lib/route";
import { paginate } from "@/lib/pagination";
import * as content from "@/services/content.service";
import { articleListDto, articleDetailDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  const qs = new URL(ctx.req.url).searchParams;
  const category = qs.get("category") ?? undefined;
  return paginate({
    req: ctx.req,
    where: { status: "published", ...(category ? { category } : {}) },
    count: () => content.publicArticleCount(category),
    fetch: ({ skip, take }) =>
      content.publicArticlePage(category, skip, take).then((rows) => rows.map((a) => articleListDto(a, ctx.req))),
    fetchAll: async () =>
      content.publicArticlePage(category, 0, 1000).then((rows) => rows.map((a) => articleListDto(a, ctx.req))),
  });
});

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const article = await content.adminCreateArticle(ctx.req, actor, body);
  return created(article, "Article created.");
});
