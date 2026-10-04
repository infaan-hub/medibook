/** Medical treatment API (§24). */
import { handler, ok, created, noContent, readJson, intParam, badRequest } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as treatments from "@/services/treatment.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const patient = qs.get("patient") ?? undefined;
  const result = await treatments.listTreatments(user, patient);
  return ok(result.data, result.message);
});

export const POST = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const body = await readJson(ctx.req);
  const result = await treatments.createTreatment(user, body);
  return created(result.data, result.message);
});

export const PATCH = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id"));
  if (id === null) throw badRequest("Missing treatment id.");
  const body = await readJson(ctx.req);
  const result = await treatments.patchTreatment(user, id, body);
  return ok(result.data, result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id"));
  if (id === null) throw badRequest("Missing treatment id.");
  const result = await treatments.destroyTreatment(user, id);
  if (result.data === null && result.message === "Treatment not found.") {
    return ok(result.data, result.message);
  }
  return noContent();
});
