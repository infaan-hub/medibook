/**
 * Media read authorization (Phase 19) — one shared gate for every endpoint
 * that returns stored bytes (/media/{id} and /api/images/{id}).
 *
 * Public:  profile images and article images (intentionally public media).
 * Private: any file referenced by a health record — a medical document that
 *          the treating doctors, the patient it belongs to, or an admin
 *          may read (401 when anonymous, 403 for anyone else).
 *
 * "Treating doctor" mirrors healthRecordWhere() in repositories/clinical.repo:
 * the doctor the record was addressed to, plus any doctor with an appointment
 * for that patient — otherwise a chart opened by a colleague showed the record
 * but 403'd the View/Download actions.
 */
import { ApiError, forbidden, unauthorized } from "@/lib/errors";
import { isSuperAdmin, type AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function assertMediaReadable(
  user: AuthUser | null,
  mediaId: number
): Promise<void> {
  const record = await prisma.healthRecord.findFirst({
    where: { file_id: mediaId },
    select: { doctor_id: true, patient_id: true },
  });
  if (!record) return;
  if (!user) throw unauthorized();
  if (isSuperAdmin(user)) return;
  if (user.id === record.patient_id) return;
  if (user.role === "doctor") {
    const doctor = await prisma.doctor.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });
    if (doctor) {
      if (doctor.id === record.doctor_id) return;
      const linked = await prisma.appointment.findFirst({
        where: { doctor_id: doctor.id, patient_id: record.patient_id },
        select: { id: true },
      });
      if (linked) return;
    }
  }
  throw new ApiError(403, "You do not have permission to access this file.");
}
