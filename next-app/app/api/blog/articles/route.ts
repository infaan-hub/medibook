/** GET/POST /api/blog/articles/ — public published articles (paginated). */
import { handler, ok, created, readJson, readMultipart, requireAdmin, requireAuth } from "@/lib/route";
import { paginate } from "@/lib/pagination";
import * as content from "@/services/content.service";
import { articleListDto, articleDetailDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  const qs = new URL(ctx.req.url).searchParams;

  if (qs.get("mine") === "1") {
    const user = await requireAuth(ctx.req);
    return paginate({
      req: ctx.req,
      where: { author_id: user.id },
      count: () => content.myArticleCount(user.id),
      fetch: ({ skip, take }) =>
        content
          .myArticlePage(user.id, skip, take)
          .then((rows) => rows.map((a) => articleDetailDto(a, ctx.req))),
      fetchAll: async () =>
        (await content.myArticlePage(user.id, 0, 1000)).map((a) => articleDetailDto(a, ctx.req)),
    });
  }

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
  const actor = await requireAuth(ctx.req);
  const isDoctor = actor.role === "doctor";
  if (!isDoctor) await requireAdmin(ctx.req);
  const contentType = ctx.req.headers.get("content-type") ?? "";
  let body: unknown;
  let file: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const multipart = await readMultipart(ctx.req);
    body = multipart.body;
    file = multipart.file;
  } else {
    body = await readJson(ctx.req);
  }
  const article = await content.adminCreateArticle(ctx.req, actor, body, file, {
    publish: isDoctor,
  });
  return created(article, "Article created.");
});
