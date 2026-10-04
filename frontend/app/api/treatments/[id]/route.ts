/** GET/PATCH/DELETE /api/treatments/{id}/ — single treatment record. */
import { handler, ok, noContent, readJson, intParam, notFound } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as treatments from "@/services/treatment.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await treatments.retrieveTreatment(user, id);
  return ok(result.data, result.message);
});

export const PATCH = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const result = await treatments.patchTreatment(user, id, body);
  return ok(result.data, result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const result = await treatments.destroyTreatment(user, id);
  if (result.message === "Treatment not found.") return ok(null, result.message);
  return noContent();
});
