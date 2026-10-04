/** GET/PATCH/DELETE /api/blog/articles/{slug}/ — public detail; author-owned edit/delete. */
import {
  handler,
  ok,
  noContent,
  notFound,
  readJson,
  readMultipart,
  requireAuth,
} from "@/lib/route";
import * as content from "@/services/content.service";

export const GET = handler(async (ctx) => {
  const slug = ctx.params.slug;
  if (!slug) throw notFound();
  return ok(await content.publicArticleDetail(ctx.req, slug));
});

export const PATCH = handler(async (ctx) => {
  const actor = await requireAuth(ctx.req);
  const slug = ctx.params.slug;
  if (!slug) throw notFound();
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
  const article = await content.authorPatchArticle(ctx.req, actor, slug, body, file);
  return ok(article, "Article updated.");
});

export const DELETE = handler(async (ctx) => {
  const actor = await requireAuth(ctx.req);
  const slug = ctx.params.slug;
  if (!slug) throw notFound();
  await content.authorDestroyArticle(actor, slug);
  return noContent();
});
