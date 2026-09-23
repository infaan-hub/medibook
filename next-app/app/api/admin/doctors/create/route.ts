/** POST /api/admin/doctors/create/ — admin creates a doctor account + profile. */
import { handler, created, readJson, requireAdmin } from "@/lib/route";
import * as admin from "@/services/admin.service";

export const POST = handler(async (ctx) => {
  const actor = await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const doctor = await admin.createDoctorAdmin(ctx.req, actor, body);
  return created(doctor, "Doctor created.");
});
