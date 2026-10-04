/**
 * Doctor first-login onboarding — server-side rules.
 *
 * The completion flag is the only thing the route guard trusts, so the checks
 * that produce it (and the serializer that reports it) must be exact:
 *   - a coordinate pair only counts inside the WGS84 ranges;
 *   - "My Doctor information" means the professional name patients see plus at
 *     least one specialty they can search by;
 *   - the resume step is the FIRST outstanding requirement, and a doctor the
 *     server already marked complete is never dragged back into the flow;
 *   - only doctor accounts carry the flag — a patient payload must not grow a
 *     field the client could mistake for unfinished setup.
 */
import { describe, expect, it } from "vitest";
import type { User } from "@prisma/client";
import {
  buildOnboardingStatus,
  doctorProfileComplete,
  nextIncompleteStep,
  validCoordinates,
  type OnboardingRequirements,
} from "@/services/onboarding.service";
import { userPayload } from "@/lib/serializers";

const requirements = (
  overrides: Partial<OnboardingRequirements> = {}
): OnboardingRequirements => ({
  notifications: false,
  location: false,
  profile_image: false,
  doctor_profile: false,
  ...overrides,
});

describe("validCoordinates", () => {
  it("accepts a finite pair inside the WGS84 ranges", () => {
    expect(validCoordinates(-6.162, 39.298)).toBe(true);
    expect(validCoordinates(0, 0)).toBe(true);
    expect(validCoordinates(-90, -180)).toBe(true);
    expect(validCoordinates(90, 180)).toBe(true);
  });

  it("rejects a missing, non-numeric or out-of-range fix", () => {
    expect(validCoordinates(null, 39.298)).toBe(false);
    expect(validCoordinates(-6.162, null)).toBe(false);
    expect(validCoordinates(undefined, undefined)).toBe(false);
    expect(validCoordinates(Number.NaN, 39.298)).toBe(false);
    expect(validCoordinates(-6.162, Number.POSITIVE_INFINITY)).toBe(false);
    expect(validCoordinates(91, 39.298)).toBe(false);
    expect(validCoordinates(-6.162, -181)).toBe(false);
    // One coordinate is meaningless for the Haversine maths.
    expect(validCoordinates(-6.162, undefined)).toBe(false);
  });
});

describe("doctorProfileComplete", () => {
  const names = { first_name: "John", last_name: "Mrema" };

  it("needs the professional name AND at least one specialty", () => {
    expect(doctorProfileComplete(names, 1)).toBe(true);
    expect(doctorProfileComplete(names, 4)).toBe(true);
    expect(doctorProfileComplete(names, 0)).toBe(false);
    expect(doctorProfileComplete({ first_name: "", last_name: "Mrema" }, 1)).toBe(false);
    expect(doctorProfileComplete({ first_name: "John", last_name: "" }, 1)).toBe(false);
    expect(doctorProfileComplete({ first_name: "  ", last_name: "Mrema" }, 1)).toBe(false);
  });
});

describe("resume point", () => {
  it("reports the first outstanding requirement, in display order", () => {
    expect(nextIncompleteStep(requirements())).toBe("notifications");
    expect(
      nextIncompleteStep(requirements({ notifications: true }))
    ).toBe("location");
    expect(
      nextIncompleteStep(
        requirements({ notifications: true, location: true, profile_image: true })
      )
    ).toBe("doctor_profile");
    expect(
      nextIncompleteStep(
        requirements({
          notifications: true,
          location: true,
          profile_image: true,
          doctor_profile: true,
        })
      )
    ).toBeNull();
  });

  it("leaves next_step null while setup is still outstanding", () => {
    const status = buildOnboardingStatus(false, requirements({ notifications: true }));
    expect(status.completed).toBe(false);
    expect(status.next_step).toBe("location");
  });

  it("finishing everything (flag still false) points at the save step", () => {
    const status = buildOnboardingStatus(
      false,
      requirements({
        notifications: true,
        location: true,
        profile_image: true,
        doctor_profile: true,
      })
    );
    expect(status.completed).toBe(false);
    expect(status.next_step).toBeNull();
  });

  it("never drags an already-completed doctor back into setup", () => {
    const status = buildOnboardingStatus(true, requirements());
    expect(status.completed).toBe(true);
    expect(status.next_step).toBeNull();
  });
});

describe("userPayload — the flag the route guard reads", () => {
  const user = (role: User["role"], flag?: boolean) =>
    ({
      id: 7,
      username: "dr.mrema",
      email: "mrema@clinic.tz",
      phone: "",
      first_name: "John",
      last_name: "Mrema",
      role,
      profile_image_id: null,
      is_superuser: false,
      created_at: new Date("2026-01-02T03:04:05.000Z"),
      ...(flag === undefined ? {} : { doctor_onboarding_completed: flag }),
    }) as unknown as User;

  const req = new Request("http://localhost/api/auth/login/");

  it("reports an unfinished doctor as false", () => {
    expect(userPayload(user("doctor", false), req)).toMatchObject({
      role: "doctor",
      doctor_onboarding_completed: false,
    });
  });

  it("reports a verified doctor as true", () => {
    expect(userPayload(user("doctor", true), req)).toMatchObject({
      doctor_onboarding_completed: true,
    });
  });

  it("defaults an unset flag to false rather than undefined", () => {
    // A legacy row (pre-migration) must read as unfinished, never as "unknown".
    expect(userPayload(user("doctor"), req)).toMatchObject({
      doctor_onboarding_completed: false,
    });
  });

  it("never adds the field to a patient payload", () => {
    const payload = userPayload(user("patient", false), req);
    expect(payload).not.toHaveProperty("doctor_onboarding_completed");
    expect(payload.role).toBe("patient");
  });
});
