import type { Prisma } from "@prisma/client";
import { getPatientProfile } from "@/repositories/users.repo";

/** Patient details captured once when a visit is created (without device location). */
export async function patientSnapshotForAppointment(
  userId: number,
  identity?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }
): Promise<Prisma.InputJsonValue> {
  // Snapshot capture must not make booking itself fail if profile lookup is
  // temporarily unavailable; the immutable core identity still gets stored.
  let profile: Awaited<ReturnType<typeof getPatientProfile>> = null;
  try {
    profile = await getPatientProfile(userId);
  } catch {
    // Keep the booking identity snapshot even if the optional profile is absent.
  }
  const user = profile?.user;
  return {
    captured_at: new Date().toISOString(),
    patient_id: userId,
    first_name: user?.first_name ?? identity?.first_name ?? "",
    last_name: user?.last_name ?? identity?.last_name ?? "",
    email: user?.email ?? identity?.email ?? "",
    phone: user?.phone ?? identity?.phone ?? "",
    date_of_birth: profile?.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: profile?.gender ?? "",
    blood_group: profile?.blood_group ?? "",
    allergies: profile?.allergies ?? "",
    medical_history: profile?.medical_history ?? "",
    emergency_contact_name: profile?.emergency_contact_name ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
  };
}
