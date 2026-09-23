/** GET/PATCH /api/doctors/me/ — alias of /doctors/me/profile/ (dashboard refresh). */
import { handler, ok, readJson } from "@/lib/route";
import { requireDoctor, doctorProfileOrCreate } from "@/lib/auth";
import { doctorDto } from "@/lib/serializers";
import { updateMyProfile } from "@/services/doctor.service";
import * as doctorsRepo from "@/repositories/doctors.repo";

export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const doctor = await doctorsRepo.findDoctorByUserId(user.id);
  const profile = doctor ?? (await doctorProfileOrCreate(user.id));
  const full = await doctorsRepo.findDoctorById(profile.id);
  return ok(doctorDto(full!, req));
});

export const PATCH = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const body = await readJson(req);
  return ok(await updateMyProfile(req, user, body), "Doctor profile updated.");
});
