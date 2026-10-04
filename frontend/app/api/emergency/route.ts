/**
 * Emergency appointment API.
 *   POST /api/emergency/ — patient creates an emergency appointment.
 *   GET  /api/emergency/ — role-scoped emergency queue (patient's own /
 *        doctor's pending requests / admin's platform-wide pending list).
 */
import { handler, created, ok, readJson } from "@/lib/route";
import { requireAuth, requirePatient } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import { createEmergencyAppointment, listEmergencies } from "@/services/emergency.service";

export const POST = handler(async ({ req }) => {
  const user = await requirePatient(req);
  const body = await readJson(req);
  const appointment = await createEmergencyAppointment(req, user, body);
  return created(emergencyAppointmentDto(appointment), "Emergency appointment requested.");
});

export const GET = handler(async ({ req }) => {
  const user = await requireAuth(req);
  const rows = await listEmergencies(user);
  return ok(rows.map((row) => emergencyAppointmentDto(row)));
});
