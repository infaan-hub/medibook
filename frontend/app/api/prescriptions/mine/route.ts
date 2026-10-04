/** GET /api/prescriptions/mine/ — the signed-in patient's own prescriptions. */
import { handler, ok } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import * as prescriptions from "@/services/prescription.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const result = await prescriptions.myPrescriptions(user);
  return ok(result.data, result.message);
});
