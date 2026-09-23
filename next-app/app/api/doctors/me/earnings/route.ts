import { handler, ok } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { earningsDashboard } from "@/services/doctor.service";

/** GET /api/doctors/me/earnings/ — doctor earnings dashboard. */
export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const data = await earningsDashboard(user);
  if (data === null) return ok(null, "Doctor profile not found.");
  return ok(data);
});
