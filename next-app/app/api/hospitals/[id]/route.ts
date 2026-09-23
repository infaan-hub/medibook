/** GET/PUT/PATCH/DELETE /api/hospitals/{id}/ */
import { handler, ok, noContent, readJson, intParam, notFound, requireAdmin } from "@/lib/route";
import * as content from "@/services/content.service";

export const GET = handler(async (ctx) => {
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  return ok(await content.retrieveHospital(id));
});

const update = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const hospital = await content.updateHospital(id, body, false);
  return ok(hospital, "Hospital updated.");
});

export const PUT = update;
export const PATCH = update;

export const DELETE = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await content.destroyHospital(id);
  return noContent();
});
