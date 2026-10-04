/** GET /api/vitals/mine/ — the signed-in patient's own readings (phase 2). */
import { handler, ok } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import * as vitals from "@/services/vital.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const result = await vitals.myVitals(user);
  return ok(result.data, result.message);
});
