import { handler, ok, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { availabilityDto } from "@/lib/serializers";
import { getOwnWindows, createOwnWindow } from "@/services/schedule.service";

/** GET/POST /api/doctors/me/schedule/ — owner availability windows. */
export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const windows = await getOwnWindows(user);
  return ok(windows.map(availabilityDto));
});

export const POST = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const body = await readJson(req);
  const window = await createOwnWindow(user, body);
  return ok(availabilityDto(window), "Availability added.", 201);
});
