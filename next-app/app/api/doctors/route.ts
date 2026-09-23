import { handler, ok, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { paginationParams, paginate } from "@/lib/pagination";
import { doctorListWhere, countDoctors, listDoctors } from "@/repositories/doctors.repo";
import { doctorDto } from "@/lib/serializers";
import { createOwnDoctorProfile } from "@/services/doctor.service";

/**
 * GET /api/doctors/ — public directory (search/specialty/city/hospital/
 * min_rating filters, paginated). POST — authenticated profile creation.
 */
export const GET = handler(async ({ req }) => {
  const url = new URL(req.url);
  const where = doctorListWhere({
    search: url.searchParams.get("search") ?? undefined,
    specialty: url.searchParams.get("specialty") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    hospital: url.searchParams.get("hospital") ?? undefined,
    minRating: url.searchParams.get("min_rating") ?? undefined,
  });
  const { pageSize } = paginationParams(req);
  return paginate({
    req,
    where,
    count: () => countDoctors(where),
    fetch: ({ skip, take }) =>
      listDoctors(where, skip, pageSize === 0 ? Number.MAX_SAFE_INTEGER : take).then((rows) =>
        rows.map((row) => doctorDto(row, req))
      ),
    fetchAll: () =>
      listDoctors(where, 0, Number.MAX_SAFE_INTEGER).then((rows) =>
        rows.map((row) => doctorDto(row, req))
      ),
  });
});

export const POST = handler(async ({ req }) => {
  const user = await requireAuth(req);
  const body = await readJson(req);
  const doctor = await createOwnDoctorProfile(user, body);
  return ok(doctor ? doctorDto(doctor, req) : null, "Doctor profile created.", 201);
});
