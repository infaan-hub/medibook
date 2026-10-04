/** GET/PATCH/DELETE /api/admin/blog/articles/{id}/ */
import {
  handler,
  ok,
  noContent,
  readJson,
  readMultipart,
  intParam,
  notFound,
  requireAdmin,
} from "@/lib/route";
import * as content from "@/services/content.service";

export const GET = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  return ok(await content.adminRetrieveArticle(ctx.req, id));
});

export const PATCH = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
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
  const article = await content.adminPatchArticle(ctx.req, actor, id, body, file);
  return ok(article, "Article updated.");
});

export const DELETE = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await content.adminDestroyArticle(id);
  return noContent();
});
