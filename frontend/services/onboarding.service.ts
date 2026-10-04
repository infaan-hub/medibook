/**
 * Doctor first-login onboarding — the server-side source of truth.
 *
 * A freshly registered doctor account is NOT ready to work: the account exists
 * (registered = true) while `User.doctor_onboarding_completed` stays false
 * until every required step has been verified HERE, on the server:
 *
 *   1. notifications — at least one ACTIVE Web Push subscription
 *                      (`PushSubscription`), i.e. the existing notification
 *                      system accepted this account's device;
 *   2. location      — a valid WGS84 coordinate pair on `Doctor` (the same
 *                      columns the directory, booking gate and emergency
 *                      nearby search already read);
 *   3. profile_image — an uploaded `MediaFile` referenced by
 *                      `User.profile_image_id` (the row must still exist);
 *   4. doctor_profile— the My Doctor information the card is built from:
 *                      professional name + at least one specialty.
 *
 * The completion flag is written only by `completeDoctorOnboarding()` after
 * those checks pass. A client payload claiming `onboardingCompleted: true` is
 * never accepted — POST /api/doctors/me/onboarding/ takes no body at all.
 *
 * Everything persistent lives in the existing tables: no duplicate user row,
 * no second subscription store, no client-only state.
 */
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ValidationError, type FieldErrors } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth";

/** Ordered required steps — the onboarding screen renders them in this order. */
export const DOCTOR_ONBOARDING_STEPS = [
  "notifications",
  "location",
  "profile_image",
  "doctor_profile",
] as const;

export type DoctorOnboardingStep = (typeof DOCTOR_ONBOARDING_STEPS)[number];

/** Per-step requirements, evaluated from the database on every read. */
export interface OnboardingRequirements {
  notifications: boolean;
  location: boolean;
  profile_image: boolean;
  doctor_profile: boolean;
}

export interface DoctorOnboardingStatus {
  /** The server-verified completion flag (never a client-supplied value). */
  completed: boolean;
  steps: OnboardingRequirements;
  /** First incomplete required step, or null when nothing is outstanding. */
  next_step: DoctorOnboardingStep | null;
}

/**
 * Coordinates count only inside the WGS84 ranges — a stored 91° latitude or a
 * NaN is "not set", so an invalid fix can never satisfy the requirement (and
 * never reaches emergency distance maths).
 */
export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * "My Doctor information is complete": the professional name the card shows
 * plus at least one specialty (what a patient searches by). Both come from the
 * existing `/doctor/personal` form — no new fields.
 */
export function doctorProfileComplete(
  user: Pick<User, "first_name" | "last_name">,
  specialtyCount: number
): boolean {
  return (
    user.first_name.trim() !== "" && user.last_name.trim() !== "" && specialtyCount > 0
  );
}

/** First required step that is still outstanding, in display order. */
export function nextIncompleteStep(
  steps: OnboardingRequirements
): DoctorOnboardingStep | null {
  return DOCTOR_ONBOARDING_STEPS.find((step) => !steps[step]) ?? null;
}

/** Shape handed to the client by GET/POST /api/doctors/me/onboarding/. */
export function buildOnboardingStatus(
  completed: boolean,
  steps: OnboardingRequirements
): DoctorOnboardingStatus {
  // A doctor already marked complete is never dragged back into setup — the
  // steps are still reported so the UI can explain where things stand.
  return { completed, steps, next_step: completed ? null : nextIncompleteStep(steps) };
}

/**
 * Evaluate every requirement for a signed-in doctor. Read-only: this never
 * writes the completion flag.
 */
export async function readOnboardingRequirements(
  user: AuthUser
): Promise<OnboardingRequirements> {
  const [doctor, subscriptions, media] = await Promise.all([
    prisma.doctor.findUnique({
      where: { user_id: user.id },
      select: {
        latitude: true,
        longitude: true,
        specialties: { select: { specialty_id: true } },
      },
    }),
    prisma.pushSubscription.count({ where: { user_id: user.id, is_active: true } }),
    user.profile_image_id
      ? prisma.mediaFile.findUnique({ where: { id: user.profile_image_id }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return {
    // A subscription row is the server-side proof the existing push flow ran
    // (permission granted + backend stored it). Browser permission alone is
    // never trusted: it is invisible to the server and device-local.
    notifications: subscriptions > 0,
    location: doctor !== null && validCoordinates(doctor.latitude, doctor.longitude),
    // Non-null id AND a live MediaFile row — a deleted/missing object is
    // reported as incomplete instead of being papered over.
    profile_image: user.profile_image_id !== null && media !== null,
    doctor_profile: doctorProfileComplete(user, doctor?.specialties.length ?? 0),
  };
}

/** Full status for GET /api/doctors/me/onboarding/. */
export async function doctorOnboardingStatus(user: AuthUser): Promise<DoctorOnboardingStatus> {
  return buildOnboardingStatus(
    user.doctor_onboarding_completed === true,
    await readOnboardingRequirements(user)
  );
}

/**
 * POST /api/doctors/me/onboarding/complete/ — validate EVERY requirement and
 * only then flip the persistent flag. Throws a §28 field-error envelope naming
 * exactly which steps are still outstanding, so the UI stays on the failing
 * step instead of showing a fake success.
 */
export async function completeDoctorOnboarding(
  user: AuthUser
): Promise<{ status: DoctorOnboardingStatus; user: User }> {
  const steps = await readOnboardingRequirements(user);

  const errors: FieldErrors = {};
  if (!steps.notifications) {
    errors.notifications = ["Allow notifications so MediBook can reach this device."];
  }
  if (!steps.location) {
    errors.location = ["Set your practice location before finishing setup."];
  }
  if (!steps.profile_image) {
    errors.profile_image = ["Upload a profile picture before finishing setup."];
  }
  if (!steps.doctor_profile) {
    errors.doctor_profile = ["Complete your My Doctor information before finishing setup."];
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(
      errors,
      "Finish every required setup step before completing onboarding."
    );
  }

  const updated =
    user.doctor_onboarding_completed === true
      ? user
      : await prisma.user.update({
          where: { id: user.id },
          data: { doctor_onboarding_completed: true },
        });

  return { status: buildOnboardingStatus(true, steps), user: updated };
}
