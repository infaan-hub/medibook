import { handler, ok, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { paginationParams, paginate } from "@/lib/pagination";
import { doctorListWhere, countDoctors, listDoctors } from "@/repositories/doctors.repo";
import { doctorDto } from "@/lib/serializers";
import { hasLocation, haversineKm } from "@/lib/geo";
import { availableTodayIds, createOwnDoctorProfile } from "@/services/doctor.service";

/** Default "near me" circle, in km — patients usually want walking distance. */
const DEFAULT_RADIUS_KM = 5;

type DoctorRow = Awaited<ReturnType<typeof listDoctors>>[number];

/**
 * GET /api/doctors/ — public directory (search/specialty/city/hospital/
 * min_rating filters, paginated). Optional `latitude`+`longitude`[+`radius_km`]
 * switches the list into "near me": only doctors with a real fix inside the
 * circle are returned, ordered nearest-first, each with a `distance_km`.
 * Every doctor is listed — including suspended ones — so the UI can label each
 * card "Available" / "Not available"; pass `is_available=true|false` to ask
 * for one side only.
 * POST — authenticated profile creation.
 */
async function withAvailableToday(
  req: Request,
  rows: DoctorRow[],
  origin?: { latitude: number; longitude: number }
) {
  const todayIds = await availableTodayIds(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...doctorDto(row, req, origin),
    available_today: row.is_available && todayIds.has(row.id),
  }));
}

export const GET = handler(async ({ req }) => {
  const url = new URL(req.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const radiusParam = Number(url.searchParams.get("radius_km"));
  const isAvailableParam = url.searchParams.get("is_available");
  const hasOrigin =
    url.searchParams.get("latitude") !== null &&
    url.searchParams.get("longitude") !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const radiusKm =
    Number.isFinite(radiusParam) && radiusParam > 0 ? radiusParam : DEFAULT_RADIUS_KM;

  const where = doctorListWhere({
    search: url.searchParams.get("search") ?? undefined,
    specialty: url.searchParams.get("specialty") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    hospital: url.searchParams.get("hospital") ?? undefined,
    minRating: url.searchParams.get("min_rating") ?? undefined,
    isAvailable:
      isAvailableParam === null
        ? undefined
        : isAvailableParam === "true" || isAvailableParam === "1",
    latitude: hasOrigin ? latitude : undefined,
    longitude: hasOrigin ? longitude : undefined,
    radiusKm: hasOrigin ? radiusKm : undefined,
  });

  if (hasOrigin) {
    // Distance ordering must be global, not per-page, so the whole bounded
    // candidate set is resolved once and shared by count() and fetch().
    const origin = { latitude, longitude };
    const ranked = await listDoctors(where, 0, Number.MAX_SAFE_INTEGER).then((rows) =>
      rows
        .filter(hasLocation)
        .map((row) => ({ row, distance: haversineKm(origin, row) }))
        .filter((entry): entry is { row: DoctorRow; distance: number } => {
          const km = entry.distance;
          return km !== null && Number.isFinite(km) && km <= radiusKm;
        })
        .sort((a, b) => a.distance - b.distance)
    );
    const all = await withAvailableToday(
      req,
      ranked.map((entry) => entry.row),
      origin
    );

    return paginate({
      req,
      where,
      count: () => Promise.resolve(ranked.length),
      fetch: ({ skip, take }) => Promise.resolve(all.slice(skip, skip + take)),
      fetchAll: () => Promise.resolve(all),
    });
  }

  const { pageSize } = paginationParams(req);
  return paginate({
    req,
    where,
    count: () => countDoctors(where),
    fetch: async ({ skip, take }) =>
      withAvailableToday(
        req,
        await listDoctors(where, skip, pageSize === 0 ? Number.MAX_SAFE_INTEGER : take)
      ),
    fetchAll: async () =>
      withAvailableToday(req, await listDoctors(where, 0, Number.MAX_SAFE_INTEGER)),
  });
});

export const POST = handler(async ({ req }) => {
  const user = await requireAuth(req);
  const body = await readJson(req);
  const doctor = await createOwnDoctorProfile(user, body);
  const [dto] = doctor ? await withAvailableToday(req, [doctor]) : [null];
  return ok(dto, "Doctor profile created.", 201);
});
