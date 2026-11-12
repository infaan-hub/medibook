import { handler, ok } from "@/lib/route";
import { listDoctors } from "@/repositories/doctors.repo";
import { doctorDto } from "@/lib/serializers";
import { withAvailableToday } from "@/services/doctor.service";

/** GET /api/doctors/top/ — the four doctors with the most appointments. */
export const GET = handler(async ({ req }) => {
  const rows = await listDoctors({}, 0, Number.MAX_SAFE_INTEGER);
  const ranked = [...rows].sort(
    (a, b) => (b._count?.appointments ?? 0) - (a._count?.appointments ?? 0)
  );
  const top = ranked.slice(0, 4);
  const dtos = await withAvailableToday(req, top);
  return ok(dtos.filter(Boolean));
});
