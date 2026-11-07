import type { Prisma } from "@prisma/client";
import { getPatientProfile } from "@/repositories/users.repo";

/** Patient details captured once when a visit is created (without device location). */
export async function patientSnapshotForAppointment(userId: number): Promise<Prisma.InputJsonValue> {
  const profile = await getPatientProfile(userId);
  const user = profile?.user;
  return {
    captured_at: new Date().toISOString(),
    patient_id: userId,
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    date_of_birth: profile?.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: profile?.gender ?? "",
    blood_group: profile?.blood_group ?? "",
    allergies: profile?.allergies ?? "",
    medical_history: profile?.medical_history ?? "",
    emergency_contact_name: profile?.emergency_contact_name ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
  };
}
