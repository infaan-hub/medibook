/**
 * GET /api/emergency/available-slots/?latitude=&longitude=&date= — the merged
 * slot grid for an emergency request: every free slot that day across the
 * doctors nearest the patient, deduped onto their closest provider.
 *
 * The patient picks a time here; who takes it is decided at submit time by
 * auto-dispatch, so the grid never asks them to choose a doctor.
 */
import { handler, ok, badRequest } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { listAvailableEmergencySlots } from "@/services/emergency.service";

export const GET = handler(async (ctx) => {
  await requirePatient(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;

  const latitude = parseFloat(qs.get("latitude") ?? "");
  const longitude = parseFloat(qs.get("longitude") ?? "");
  const date = qs.get("date") ?? "";
  const specialtyId = qs.get("specialty") ? parseInt(qs.get("specialty")!) : undefined;

  if (isNaN(latitude) || isNaN(longitude)) {
    throw badRequest("Latitude and longitude are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw badRequest("A date is required.", { appointment_date: ["Use the YYYY-MM-DD format."] });
  }

  const slots = await listAvailableEmergencySlots(latitude, longitude, date, specialtyId);
  return ok(slots);
});
