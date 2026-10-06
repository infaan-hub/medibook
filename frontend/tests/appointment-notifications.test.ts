/**
 * Lifecycle notifications — the three gaps the product asked for, pinned
 * WITHOUT disturbing the notifications that already work:
 *
 *  1. Reschedule, doctor side → the patient is notified (EXISTS — pinned here
 *     as a regression guard so this file proves it still fires).
 *  2. Reschedule, patient side (cancel + rebook on the client) → the doctor
 *     now gets an explicit "rescheduled … Confirm the new time." notice via
 *     the booking's `rescheduled_from` marker; anything malformed falls back
 *     to the untouched generic request message.
 *  3. Consultation start → the patient is notified for the first time
 *     (queue start previously mutated the row silently).
 *  4. Done → the patient is notified as before; when an ADMIN closes the
 *     visit the owning doctor now hears about it too.
 *
 * Mocked-repo unit tests — same style as tests/emergency-lifecycle.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookAppointment,
  patchAppointment,
  runAction,
} from "@/services/appointment.service";
import { startConsultation } from "@/services/queue.service";
import type { AuthUser } from "@/lib/auth";

/* ------------------------------- test doubles ------------------------------ */

const repo = vi.hoisted(() => ({
  findAppointmentById: vi.fn(),
  findOpenAppointmentForPatient: vi.fn(),
  liveSlotExists: vi.fn(),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  createReminderIfAbsent: vi.fn(),
  findLiveConsultation: vi.fn(),
  deleteAppointment: vi.fn(),
}));

const doctorsRepo = vi.hoisted(() => ({
  findDoctorById: vi.fn(),
  findDoctorByUserId: vi.fn(),
}));

const availableSlots = vi.hoisted(() => vi.fn());

const notify = vi.hoisted(() => vi.fn());
const broadcastAppointmentEvent = vi.hoisted(() => vi.fn());
const broadcastAvailabilityUpdated = vi.hoisted(() => vi.fn());
const pushRaw = vi.hoisted(() => vi.fn());

vi.mock("@/repositories/appointments.repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/appointments.repo")>()),
  ...repo,
}));

vi.mock("@/repositories/doctors.repo", () => doctorsRepo);

vi.mock("@/services/schedule.service", () => ({ availableSlots }));

vi.mock("@/services/location.service", () => ({
  assertBookingLocation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notify", () => ({
  notify,
  broadcastAppointmentEvent,
  broadcastAvailabilityUpdated,
  pushRaw,
}));

// Never touched here, but the service graph pulls it in — stub it so no
// Prisma client is ever constructed in a unit test.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const REQUEST = () => new Request("http://localhost/api/appointments/9/");

function account(id: number, role: AuthUser["role"], email = `u${id}@example.com`): AuthUser {
  return {
    id,
    password: "x",
    is_superuser: false,
    username: `u${id}`,
    email,
    phone: "",
    first_name: "A",
    last_name: "B",
    role,
    doctor_onboarding_completed: true,
    profile_image_id: null,
    is_active: true,
    is_staff: false,
    created_at: new Date("2026-10-01T00:00:00Z"),
    updated_at: new Date("2026-10-01T00:00:00Z"),
  } as AuthUser;
}

/** Far-future date so the "must be today or later" checks stay green forever. */
const DAY = new Date("2099-01-05T00:00:00.000Z");
const DATE = "2099-01-05";

function normalRow(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    status,
    appointment_type: "NORMAL",
    patient_id: 7,
    doctor_id: 4,
    hospital_id: null,
    appointment_date: DAY,
    start_time: "09:00:00",
    end_time: "09:30:00",
    reason: "Follow-up",
    notes: null,
    cancel_reason: null,
    checked_in_at: new Date("2099-01-05T08:45:00.000Z"),
    consultation_started_at: null,
    created_at: new Date("2026-10-01T00:00:00Z"),
    updated_at: new Date("2026-10-01T00:00:00Z"),
    patient: { id: 7, email: "asha@example.com", first_name: "Asha", last_name: "Juma" },
    doctor: { id: 4, user_id: 12, user: { id: 12, first_name: "Neema", last_name: "Kimaro" } },
    ...overrides,
  };
}

const DOCTOR_PROFILE = {
  id: 4,
  user_id: 12,
  is_available: true,
  user: { id: 12, first_name: "Neema", last_name: "Kimaro", username: "drneema" },
};

beforeEach(() => {
  vi.clearAllMocks();
  notify.mockResolvedValue({ id: 1 });
  repo.findOpenAppointmentForPatient.mockResolvedValue(null);
  repo.liveSlotExists.mockResolvedValue(false);
  repo.findLiveConsultation.mockResolvedValue(null);
  doctorsRepo.findDoctorById.mockResolvedValue(DOCTOR_PROFILE);
  doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 4, user_id: 12 });
  availableSlots.mockResolvedValue([{ start_time: "09:00:00", end_time: "09:30:00" }]);
});

/* ====================== 1. consultation start ============================= */

describe("startConsultation", () => {
  it("notifies the patient the moment the doctor calls them in", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("accepted"));
    repo.updateAppointment.mockResolvedValue(
      normalRow("accepted", { consultation_started_at: new Date("2099-01-05T09:05:00.000Z") })
    );

    const result = await startConsultation(account(12, "doctor"), 9);

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ consultation_started_at: expect.any(Date) })
    );
    expect(notify).toHaveBeenCalledWith(
      7,
      "system",
      `Your consultation has started: ${DATE} 09:00:00.`,
      9,
      "Consultation started"
    );
    expect(broadcastAppointmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ consultation_started_at: expect.any(Date) }),
      "appointment.updated",
      [7, 12]
    );
    expect(result.message).toBe("Consultation started.");
  });

  it("stays silent when the consultation was already started (no duplicate ping)", async () => {
    repo.findAppointmentById.mockResolvedValue(
      normalRow("accepted", { consultation_started_at: new Date("2099-01-05T09:00:00.000Z") })
    );

    const result = await startConsultation(account(12, "doctor"), 9);

    expect(result.message).toMatch(/already started/i);
    expect(notify).not.toHaveBeenCalled();
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });

  it("still refuses a patient trying to start their own consultation", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("accepted"));

    await expect(startConsultation(account(7, "patient"), 9)).rejects.toMatchObject({
      status: 403,
    });
    expect(notify).not.toHaveBeenCalled();
  });
});

/* ============================ 2. done = both sides ========================= */

describe("runAction done", () => {
  it("notifies the patient exactly as before when the doctor completes the visit", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("accepted"));
    repo.updateAppointment.mockResolvedValue(normalRow("done"));

    await runAction(REQUEST(), account(12, "doctor"), 9, "done", {});

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      7,
      "system",
      `Appointment marked as done: ${DATE} 09:00:00.`,
      9
    );
  });

  it("also notifies the owning doctor when an admin closes the visit", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("accepted"));
    repo.updateAppointment.mockResolvedValue(normalRow("done"));
    doctorsRepo.findDoctorByUserId.mockResolvedValue(null); // admins own no doctor profile

    await runAction(REQUEST(), account(99, "admin"), 9, "done", {});

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenNthCalledWith(
      1,
      7,
      "system",
      `Appointment marked as done: ${DATE} 09:00:00.`,
      9
    );
    expect(notify).toHaveBeenNthCalledWith(
      2,
      12,
      "system",
      `Appointment marked as done: ${DATE} 09:00:00.`,
      9
    );
  });

  it("keeps the untouched cancel path: the patient cancels, the doctor is told", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("pending"));
    repo.updateAppointment.mockResolvedValue(normalRow("cancelled"));

    await runAction(REQUEST(), account(7, "patient"), 9, "cancel", {});

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      12,
      "appointment_cancelled",
      `Appointment cancelled: ${DATE} 09:00:00.`,
      9
    );
  });
});

/* ==================== 3. reschedule, doctor → patient ===================== */

describe("patchAppointment (doctor in-place reschedule)", () => {
  beforeEach(() => {
    availableSlots.mockResolvedValue([{ start_time: "10:00:00", end_time: "10:30:00" }]);
  });

  it("still tells the patient the new time and who moved it", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("pending"));
    // The update result must reflect the moved slot or `timeChanged` is false.
    repo.updateAppointment.mockResolvedValue(
      normalRow("pending", { start_time: "10:00:00", end_time: "10:30:00" })
    );

    const result = await patchAppointment(REQUEST(), account(12, "doctor"), 9, {
      appointment_date: DATE,
      start_time: "10:00:00",
      end_time: "10:30:00",
    });
    expect(result.message).toBe("Appointment rescheduled.");

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      7,
      "appointment_reminder",
      `Appointment rescheduled to ${DATE} at 10:00–10:30 by Dr. Neema Kimaro.`,
      9
    );
    expect(broadcastAvailabilityUpdated).toHaveBeenCalledWith(4, DATE);
  });
});

/* ==================== 4. reschedule, patient → doctor ===================== */

describe("bookAppointment rescheduled_from", () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    doctor: 4,
    appointment_date: DATE,
    start_time: "09:00:00",
    end_time: "09:30:00",
    reason: "Follow-up",
    ...extra,
  });

  beforeEach(() => {
    availableSlots.mockResolvedValue([{ start_time: "09:00:00", end_time: "09:30:00" }]);
    repo.createAppointment.mockResolvedValue(normalRow("pending", { id: 55 }));
  });

  it("tells the doctor this is a reschedule needing confirmation", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("cancelled"));

    await bookAppointment(REQUEST(), account(7, "patient", "asha@example.com"), body({
      rescheduled_from: 9,
    }));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      12,
      "appointment_request",
      `Appointment rescheduled by asha@example.com to ${DATE} at 09:00–09:30. Confirm the new time.`,
      55
    );
  });

  it("keeps the generic message for an ordinary booking", async () => {
    await bookAppointment(
      REQUEST(),
      account(7, "patient", "asha@example.com"),
      body()
    );

    expect(repo.findAppointmentById).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      12,
      "appointment_request",
      "New appointment request from asha@example.com.",
      55
    );
  });

  it("falls back to the generic message when the marker is not the caller's cancelled row", async () => {
    repo.findAppointmentById.mockResolvedValue(normalRow("cancelled", { patient_id: 42 }));

    await bookAppointment(
      REQUEST(),
      account(7, "patient", "asha@example.com"),
      body({ rescheduled_from: 9 })
    );

    expect(notify).toHaveBeenCalledWith(
      12,
      "appointment_request",
      "New appointment request from asha@example.com.",
      55
    );
  });
});
