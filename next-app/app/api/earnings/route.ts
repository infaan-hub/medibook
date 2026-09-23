/** Earnings dashboard (§24 earnings). */
import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { earningsDashboard } from "@/services/doctor.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  return ok(await earningsDashboard(user));
});
