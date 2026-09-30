/** GET/POST /api/prescriptions/ — structured e-prescriptions (doctor only). */
import { handler, ok, created, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as prescriptions from "@/services/prescription.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const patient = new URL(ctx.req.url).searchParams.get("patient") ?? undefined;
  const result = await prescriptions.listPrescriptions(user, patient);
  return ok(result.data, result.message);
});

export const POST = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const body = await readJson(ctx.req);
  const result = await prescriptions.createPrescription(user, body);
  return created(result.data, result.message);
});
