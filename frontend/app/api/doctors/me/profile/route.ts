import { handler, ok, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { doctorProfileOrCreate } from "@/lib/auth";
import { doctorDto } from "@/lib/serializers";
import { updateMyProfile } from "@/services/doctor.service";

/** GET/PATCH /api/doctors/me/profile/ — the signed-in doctor's profile. */
export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const doctor =
    (await import("@/repositories/doctors.repo")).findDoctorByUserId &&
    (await (await import("@/repositories/doctors.repo")).findDoctorByUserId(user.id));
  const profile = doctor ?? (await doctorProfileOrCreate(user.id));
  const full = await (await import("@/repositories/doctors.repo")).findDoctorById(profile.id);
  return ok(doctorDto(full!, req));
});

export const PATCH = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const body = await readJson(req);
  return ok(await updateMyProfile(req, user, body), "Doctor profile updated.");
});
