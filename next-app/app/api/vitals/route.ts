/** GET/POST /api/vitals/ — vitals readings (doctor only, phase 2). */
import { handler, ok, created, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as vitals from "@/services/vital.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const patient = new URL(ctx.req.url).searchParams.get("patient") ?? undefined;
  const result = await vitals.listVitals(user, patient);
  return ok(result.data, result.message);
});

export const POST = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const body = await readJson(ctx.req);
  const result = await vitals.createVital(user, body);
  return created(result.data, result.message);
});
