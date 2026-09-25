/** GET/POST /api/admin/blog/articles/ — admin article list + create. */
import { handler, ok, created, readJson, readMultipart, requireAdmin } from "@/lib/route";
import { paginate } from "@/lib/pagination";
import * as content from "@/services/content.service";
import { articleListDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  return paginate({
    req: ctx.req,
    where: {},
    count: () => content.adminArticleCount(),
    fetch: ({ skip, take }) =>
      content.adminListArticles(skip, take).then((rows) => rows.map((a) => articleListDto(a, ctx.req))),
    fetchAll: async () =>
      content.adminListArticles(0, 1000).then((rows) => rows.map((a) => articleListDto(a, ctx.req))),
  });
});

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
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
  const article = await content.adminCreateArticle(ctx.req, actor, body, file);
  return created(article, "Article created.");
});
