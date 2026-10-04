/** GET/POST /api/hospitals/ — paginated hospital catalog (+ city filter). */
import { handler, ok, created, readJson, requireAdmin } from "@/lib/route";
import { paginate } from "@/lib/pagination";
import * as content from "@/services/content.service";
import { hospitalDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  const qs = new URL(ctx.req.url).searchParams;
  const city = qs.get("city") ?? undefined;
  return paginate({
    req: ctx.req,
    where: { ...(city ? { city } : {}) },
    count: () => content.countHospitalRows(city),
    fetch: ({ skip, take }) =>
      content.listHospitalPage(city, skip, take).then((rows) => rows.map(hospitalDto)),
    fetchAll: async () =>
      content.listHospitalPage(city, 0, 1000).then((rows) => rows.map(hospitalDto)),
  });
});

export const POST = handler(async (ctx) => {
  await requireAdmin(ctx.req);
  const body = await readJson(ctx.req);
  const hospital = await content.createHospital(body);
  return created(hospital, "Hospital created.");
});
