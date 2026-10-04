/** GET/PATCH/PUT /api/patients/profile/ */
import { handler, ok, readJson, requirePatient } from "@/lib/route";
import * as patients from "@/services/patient.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  return ok(await patients.getProfile(user));
});

export const PATCH = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const body = await readJson(ctx.req);
  return ok(await patients.updateProfile(user, body), "Profile updated.");
});

export const PUT = PATCH;
