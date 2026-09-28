/** GET /api/emergency/nearby-doctors/ — find nearby available doctors for emergency. */
import { handler, ok, badRequest, requireAuth } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { doctorDto } from "@/lib/serializers";
import {
  findNearbyDoctors,
  MAX_EMERGENCY_RADIUS_KM,
} from "@/services/emergency.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;

  const latitude = parseFloat(qs.get("latitude") ?? "");
  const longitude = parseFloat(qs.get("longitude") ?? "");
  const radiusKm = parseFloat(qs.get("radius") ?? "5");
  const specialtyId = qs.get("specialty") ? parseInt(qs.get("specialty")!) : undefined;

  if (isNaN(latitude) || isNaN(longitude)) {
    throw badRequest("Latitude and longitude are required.");
  }

  // The query string is the only place the radius is bounded — internal
  // callers scan wider on purpose.
  const doctors = await findNearbyDoctors(
    latitude,
    longitude,
    Math.min(radiusKm > 0 ? radiusKm : 5, MAX_EMERGENCY_RADIUS_KM),
    specialtyId
  );

  const origin = { latitude, longitude };
  const result = doctors.map((d) => ({
    doctor: doctorDto(d.doctor, ctx.req, origin),
    distance: d.distance,
  }));

  return ok(result);
});