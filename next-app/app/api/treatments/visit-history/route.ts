/** GET /api/treatments/visit-history/ — bare visit history for the signed-in doctor. */
import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { visitHistory } from "@/services/treatment.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const patient = qs.get("patient") ?? undefined;
  const result = await visitHistory(user, patient);
  return ok(result.data, result.message);
});
