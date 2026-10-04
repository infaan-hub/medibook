/** GET/PATCH/PUT /api/auth/me/ — current user profile. */
import { handler, ok, readJson, requireAuth, readMultipart } from "@/lib/route";
import { userPayload } from "@/lib/serializers";
import { updateMe } from "@/services/auth.service";
import * as users from "@/repositories/users.repo";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const row = await users.findUserById(user.id);
  if (!row) {
    const { notFound } = await import("@/lib/errors");
    throw notFound();
  }
  return ok(userPayload(row, ctx.req));
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const contentType = ctx.req.headers.get("content-type") ?? "";
  let file: File | null = null;
  let body: unknown;
  if (contentType.includes("multipart/form-data")) {
    const multipart = await readMultipart(ctx.req);
    body = multipart.body;
    file = multipart.file;
  } else {
    body = await readJson(ctx.req);
  }
  const result = await updateMe(user, body as Record<string, never>, file);
  return ok(userPayload(await users.findUserById(user.id) ?? result, ctx.req), "Profile updated.");
});

export const PUT = PATCH;
