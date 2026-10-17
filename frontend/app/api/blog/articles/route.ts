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
      fetch: async ({ skip, take }) => {
        const rows = await content.myArticlePage(user.id, skip, take);
        const likes = await content.articleLikeState(
          user.id,
          rows.map((a) => a.id)
        );
        return rows.map((a) => articleDetailDto(a, ctx.req, likes.get(a.id)));
      },
      fetchAll: async () => {
        const rows = await content.myArticlePage(user.id, 0, 1000);
        const likes = await content.articleLikeState(
          user.id,
          rows.map((a) => a.id)
        );
        return rows.map((a) => articleDetailDto(a, ctx.req, likes.get(a.id)));
      },
    });
  }

  const category = qs.get("category") ?? undefined;
  return paginate({
    req: ctx.req,
    where: { status: "published", ...(category ? { category } : {}) },
    count: () => content.publicArticleCount(category),
    fetch: async ({ skip, take }) => {
      const rows = await content.publicArticlePage(category, skip, take);
      const likes = await content.articleLikeState(
        ctx.user?.id ?? null,
        rows.map((a) => a.id)
      );
      return rows.map((a) => articleListDto(a, ctx.req, likes.get(a.id)));
    },
    fetchAll: async () => {
      const rows = await content.publicArticlePage(category, 0, 1000);
      const likes = await content.articleLikeState(
        ctx.user?.id ?? null,
        rows.map((a) => a.id)
      );
      return rows.map((a) => articleListDto(a, ctx.req, likes.get(a.id)));
    },
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
