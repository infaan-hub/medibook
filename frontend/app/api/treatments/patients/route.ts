/** GET /api/treatments/patients/ — bare list of patients for the signed-in doctor. */
import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { listDoctorPatients } from "@/services/treatment.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const result = await listDoctorPatients(user);
  return ok(result.data, result.message);
});
