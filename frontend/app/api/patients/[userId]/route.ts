/** PATCH /api/patients/<userId>/ �?" doctor updates a patient's medical details.
 *
 * Only doctors who have at least one appointment with the patient may update
 * their chart (gender, blood group, date of birth, allergies, medical history).
 */
import { handler, ok, readJson, requireDoctor, notFound, forbidden } from "@/lib/route";
import * as patients from "@/services/patient.service";
import * as appointments from "@/repositories/appointments.repo";
import { patientProfileSchema } from "@/validators/doctor";
import { parse } from "@/validators/base";
import { patientDto } from "@/lib/serializers";
import type { AuthUser } from "@/lib/auth";

/** GET /api/patients/<userId>/ — doctor reads a linked patient's profile. */
export const GET = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const targetUserId = Number(ctx.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw notFound("Patient not found.");
  const result = await patients.getPatientDetail(user, targetUserId);
  if (!result.data) throw forbidden(result.message || "Access denied.");
  return ok(result.data, result.message);
});

export const PATCH = handler(async (ctx) => {
  const user = await requireDoctor(ctx.req);
  const doctor = await import("@/repositories/doctors.repo").then((m) =>
    m.findDoctorByUserId(user.id)
  );
  if (!doctor) throw notFound("Doctor profile not found.");

  const targetUserId = Number(ctx.params.userId);
  if (!Number.isInteger(targetUserId)) throw notFound("Patient not found.");

  // Verify the doctor has at least one appointment with this patient.
  const linked = await appointments.hasAppointmentsWithPatient(
    doctor.id,
    targetUserId
  );
  if (!linked) throw forbidden("You have no appointment with this patient.");

  const body = await readJson(ctx.req);
  const input = parse(patientProfileSchema, body);

  const data: Record<string, unknown> = {};
  const keys = [
    "date_of_birth",
    "gender",
    "blood_group",
    "allergies",
    "medical_history",
  ] as const;
  for (const key of keys) {
    if (input[key] !== undefined) {
      data[key] =
        key === "date_of_birth" && input[key]
          ? new Date(`${input[key]}T00:00:00Z`)
          : input[key];
    }
  }

  const { updatePatient } = await import("@/repositories/users.repo");
  const profile = await updatePatient(targetUserId, data);
  return ok(patientDto(profile), "Patient details updated.");
});

export const PUT = PATCH;
