/** Emergency appointment API (POST /api/emergency/ — create emergency appointment). */
import { handler, created, badRequest, readJson } from "@/lib/route";
import { requirePatient } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import { createEmergencyAppointment } from "@/services/emergency.service";

export const POST = handler(async ({ req }) => {
  const user = await requirePatient(req);
  const body = await readJson(req);
  const appointment = await createEmergencyAppointment(req, user, body);
  return created(emergencyAppointmentDto(appointment), "Emergency appointment requested.");
});