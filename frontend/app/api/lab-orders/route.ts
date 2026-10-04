/** GET/POST /api/lab-orders/ — lab orders (doctor only, phase 3). */
import { handler, ok, created, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import * as labs from "@/services/lab-order.service";

export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const patient = new URL(ctx.req.url).searchParams.get("patient") ?? undefined;
  const result = await labs.listLabOrders(user, patient);
  return ok(result.data, result.message);
});

export const POST = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const body = await readJson(ctx.req);
  const result = await labs.createLabOrder(user, body);
  return created(result.data, result.message);
});
