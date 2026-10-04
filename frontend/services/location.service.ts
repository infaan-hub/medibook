/**
 * Booking location gate.
 *
 * Rule (product requirement): **no appointment without a real location**. The
 * frontend shows a guided modal, and this service is the backend half of the
 * same rule so it cannot be bypassed with a hand-rolled API call.
 *
 * The error is a 403 whose `errors.location` value tells the client whose
 * location is missing (`patient` | `doctor` | `both`), so the UI can open the
 * right prompt instead of showing a generic failure.
 */
import { ApiError } from "@/lib/errors";
import { hasLocation } from "@/lib/geo";
import { getPatientProfile } from "@/repositories/users.repo";
import { findDoctorById } from "@/repositories/doctors.repo";
import type { AuthUser } from "@/lib/auth";

/** Who still needs to set a location. */
export type MissingLocation = "patient" | "doctor" | "both";

export const LOCATION_REQUIRED_MESSAGE =
  "A real location is required before an appointment can be booked.";

/** 403 carrying `errors.location` — the client keys its modal off this. */
export function locationRequiredError(missing: MissingLocation): ApiError {
  return new ApiError(403, LOCATION_REQUIRED_MESSAGE, { location: [missing] });
}

/** True when the API error came from this gate (used by the booking screen). */
export function isLocationRequired(errors: Record<string, string[]>): boolean {
  return Array.isArray(errors.location);
}

/** Whose location is missing for a booking, or null when both are set. */
export async function missingBookingLocation(
  user: AuthUser,
  doctorId: number
): Promise<MissingLocation | null> {
  const [patient, doctor] = await Promise.all([
    getPatientProfile(user.id).catch(() => null),
    findDoctorById(doctorId).catch(() => null),
  ]);

  const patientMissing = !patient || !hasLocation(patient);
  const doctorMissing = !doctor || !hasLocation(doctor);

  if (patientMissing && doctorMissing) return "both";
  if (patientMissing) return "patient";
  if (doctorMissing) return "doctor";
  return null;
}

/**
 * POST /api/appointments/ — throws 403 `{ errors: { location: [...] } }`
 * unless both the patient and the selected doctor carry coordinates.
 */
export async function assertBookingLocation(user: AuthUser, doctorId: number): Promise<void> {
  const missing = await missingBookingLocation(user, doctorId);
  if (missing) throw locationRequiredError(missing);
}

/**
 * Emergency booking: the patient's own position arrives with the request as a
 * live GPS fix, so only the doctor's practice location has to be on file —
 * otherwise there is nowhere to send them.
 */
export async function assertDoctorLocation(doctorId: number): Promise<void> {
  const doctor = await findDoctorById(doctorId).catch(() => null);
  if (!doctor || !hasLocation(doctor)) throw locationRequiredError("doctor");
}
