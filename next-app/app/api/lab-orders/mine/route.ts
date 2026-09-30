/** GET /api/lab-orders/mine/ — the signed-in patient's own orders (phase 3). */
import { handler, ok } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import * as labs from "@/services/lab-order.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const result = await labs.myLabOrders(user);
  return ok(result.data, result.message);
});
