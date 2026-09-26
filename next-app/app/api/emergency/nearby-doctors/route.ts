/** GET /api/emergency/nearby-doctors/ — find nearby available doctors for emergency. */
import { handler, ok, badRequest, requireAuth } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { doctorDto } from "@/lib/serializers";
import { findNearbyDoctors } from "@/services/emergency.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  
  const latitude = parseFloat(qs.get("latitude") ?? "");
  const longitude = parseFloat(qs.get("longitude") ?? "");
  const radiusKm = parseFloat(qs.get("radius") ?? "25");
  const specialtyId = qs.get("specialty") ? parseInt(qs.get("specialty")!) : undefined;

  if (isNaN(latitude) || isNaN(longitude)) {
    throw badRequest("Latitude and longitude are required.");
  }

  const doctors = await findNearbyDoctors(latitude, longitude, radiusKm);
  
  return ok(doctors.map(d => ({
    doctor: doctorDto(d.doctor),
    distance: d.distance,
  }));
});