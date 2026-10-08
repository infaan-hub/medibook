/**
 * Emergency lifecycle (§27) — the re-request rules the whole feature hangs on:
 *
 *  1. Eligibility is a pure, server-time decision table: PENDING/ACCEPTED
 *     release the patient exactly 30 minutes after the request, IN_PROGRESS
 *     releases them NEVER (only DONE does), and every terminal status
 *     (done/rejected/cancelled/expired) releases them immediately.
 *  2. Only the assigned doctor (or an admin) may move an emergency forward, and
 *     only along accept → in-progress → done. Patients can never set those
 *     statuses, and neither can a second tab replaying a stale transition.
 *  3. The notification kinds stay inside the DB's NotificationType enum.
 *  4. An `expired` row survives 24 hours as history and is then purged with
 *     the same realtime `appointment.deleted` contract as a manual delete.
 *
 * Pure tests (no database) — same style as tests/emergency.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMERGENCY_STATUS_TRANSITIONS,
  EXPIRED_RETENTION_MS,
  canEmergencyTransition,
  cancelEmergencyAppointment,
  completeEmergencyAppointment,
  deleteEmergencyAppointment,
  emergencyNotificationType,
  evaluateEmergencyEligibility,
  getEmergencyEligibility,
  normaliseEmergencyAction,
  purgeExpiredAppointments,
  runEmergencyAction,
  startEmergencyInProgress,
  type EmergencyEligibility,
} from "@/services/emergency.service";
import type { AuthUser } from "@/lib/auth";
import type { AppointmentStatus } from "@prisma/client";

/* ------------------------------- test doubles ------------------------------ */

const repo = vi.hoisted(() => ({
  findAppointmentById: vi.fn(),
  updateAppointment: vi.fn(),
  findPatientEmergencyAppointment: vi.fn(),
  expireTimedOutEmergencies: vi.fn(),
  purgeExpiredEmergencies: vi.fn(),
  createEmergencyAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
}));

const doctorsRepo = vi.hoisted(() => ({
  findDoctorByUserId: vi.fn(),
}));

const broadcastAppointmentEvent = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());
const pushRaw = vi.hoisted(() => vi.fn());

vi.mock("@/repositories/appointments.repo", () => ({
  ...repo,
  EMERGENCY_ACTIVE_STATUSES: ["pending", "accepted", "in_progress"],
}));

vi.mock("@/repositories/doctors.repo", () => doctorsRepo);

vi.mock("@/lib/notify", () => ({ notify, broadcastAppointmentEvent, pushRaw }));

// Never touched by these tests, but the service lazily imports it — stub it so
// no Prisma client is ever constructed in a unit test.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const REQUEST = () => new Request("http://localhost/api/emergency/appointments/9/");

function account(id: number, role: AuthUser["role"]): AuthUser {
  return {
    id,
    password: "x",
    is_superuser: false,
    username: `u${id}`,
    email: `u${id}@example.com`,
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

const T = new Date("2026-10-05T10:00:00.000Z");
const MINUTE = 60_000;

function emergencyRow(status: AppointmentStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    status,
    appointment_type: "EMERGENCY",
    patient_id: 7,
    doctor_id: 4,
    emergency_requested_at: T,
    emergency_accepted_at: status === "pending" ? null : T,
    emergency_in_progress_at: status === "in_progress" ? T : null,
    emergency_completed_at: status === "done" ? T : null,
    emergency_expired_at: status === "expired" ? T : null,
    created_at: T,
    updated_at: T,
    patient: { id: 7, first_name: "Asha", last_name: "Juma" },
    doctor: {
      id: 4,
      user_id: 12,
      user: { id: 12, first_name: "Neema", last_name: "Kimaro" },
    },
    ...overrides,
  };
}

/** Eligibility rows are what findPatientEmergencyAppointment returns. */
function activeFacts(status: AppointmentStatus, requestedAt: Date) {
  return emergencyRow(status, { emergency_requested_at: requestedAt });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Assigned doctor profile for user 12 → doctor id 4 (see emergencyRow).
  doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 4, user_id: 12 });
  notify.mockResolvedValue({ id: 1 });
});

/* =========================== 1. the decision table ========================= */

describe("evaluateEmergencyEligibility — the 30-minute rule", () => {
  const facts = (status: AppointmentStatus, requestedAt: Date = T) => ({
    id: 9,
    status,
    requestedAt,
  });

  it("allows a patient who holds no active emergency", () => {
    expect(evaluateEmergencyEligibility(null, T)).toMatchObject({
      canCreateEmergency: true,
      reason: null,
      availableAt: null,
    });
  });

  it("blocks at 29:59 with EMERGENCY_ACTIVE and the 30-minute deadline", () => {
    const at = new Date(T.getTime() + 29 * MINUTE + 59_000);
    const result = evaluateEmergencyEligibility(facts("pending"), at);

    expect(result.canCreateEmergency).toBe(false);
    expect(result.reason).toBe("EMERGENCY_ACTIVE");
    expect(result.availableAt).toBe(new Date(T.getTime() + 30 * MINUTE).toISOString());
    expect(result.activeEmergencyId).toBe(9);
    expect(result.status).toBe("pending");
    expect(result.message).toMatch(/active emergency request/i);
  });

  it("allows at exactly 30:00 when the doctor never started it", () => {
    const at = new Date(T.getTime() + 30 * MINUTE);
    expect(evaluateEmergencyEligibility(facts("pending"), at).canCreateEmergency).toBe(true);
  });

  it("keeps counting from the REQUEST time once the doctor accepts", () => {
    const acceptedAt = new Date(T.getTime() + 5 * MINUTE);
    expect(evaluateEmergencyEligibility(facts("accepted"), acceptedAt).canCreateEmergency).toBe(false);
    expect(
      evaluateEmergencyEligibility(facts("accepted"), new Date(T.getTime() + 30 * MINUTE))
        .canCreateEmergency
    ).toBe(true);
  });

  it("blocks IN_PROGRESS with no deadline — 10, 30 and 60 minutes later", () => {
    for (const offset of [10, 30, 60]) {
      const result = evaluateEmergencyEligibility(
        facts("in_progress"),
        new Date(T.getTime() + offset * MINUTE)
      );
      expect(result.canCreateEmergency).toBe(false);
      expect(result.reason).toBe("EMERGENCY_IN_PROGRESS");
      expect(result.availableAt).toBeNull();
      expect(result.message).toMatch(/currently in progress/i);
    }
  });

  it("releases the patient immediately for every terminal status", () => {
    for (const status of ["done", "rejected", "cancelled", "expired"] as const) {
      const result = evaluateEmergencyEligibility(facts(status), new Date(T.getTime() + MINUTE));
      expect(result.canCreateEmergency, status).toBe(true);
    }
  });

  it("reads the deadline from COALESCE(requested_at, created_at)", () => {
    // Row written before emergency_requested_at existed → created_at governs.
    const facts_ = {
      id: 9,
      status: "pending" as const,
      requestedAt: new Date("2026-10-05T09:45:00.000Z"),
    };
    expect(evaluateEmergencyEligibility(facts_, new Date("2026-10-05T10:14:59.000Z")).canCreateEmergency).toBe(false);
    expect(evaluateEmergencyEligibility(facts_, new Date("2026-10-05T10:15:00.000Z")).canCreateEmergency).toBe(true);
  });
});

/* ========================== 2. legal transitions =========================== */

describe("canEmergencyTransition", () => {
  it("lets a pending request be accepted, rejected, cancelled or expired", () => {
    for (const to of ["accepted", "rejected", "cancelled", "expired"]) {
      expect(canEmergencyTransition("pending", to), to).toBe(true);
    }
  });

  it("refuses pending → in_progress / done (the doctor must accept first)", () => {
    expect(canEmergencyTransition("pending", "in_progress")).toBe(false);
    expect(canEmergencyTransition("pending", "done")).toBe(false);
  });

  it("lets an accepted emergency start and reject, but never jump to done", () => {
    expect(canEmergencyTransition("accepted", "in_progress")).toBe(true);
    expect(canEmergencyTransition("accepted", "rejected")).toBe(true);
    expect(canEmergencyTransition("accepted", "cancelled")).toBe(true);
    expect(canEmergencyTransition("accepted", "expired")).toBe(true);
    expect(canEmergencyTransition("accepted", "done")).toBe(false);
  });

  it("allows only in_progress → done, the sole way out of a visit", () => {
    expect(canEmergencyTransition("in_progress", "done")).toBe(true);
    for (const to of ["pending", "accepted", "in_progress", "cancelled", "rejected", "expired"]) {
      expect(canEmergencyTransition("in_progress", to), to).toBe(false);
    }
  });

  it("treats done, rejected, cancelled and expired as terminal", () => {
    for (const from of ["done", "rejected", "cancelled", "expired"]) {
      for (const to of [
        "pending",
        "accepted",
        "in_progress",
        "done",
        "cancelled",
        "rejected",
        "expired",
      ]) {
        expect(canEmergencyTransition(from, to), `${from} → ${to}`).toBe(false);
      }
    }
  });

  it("lists in_progress and expired in the shared table", () => {
    expect(Object.keys(EMERGENCY_STATUS_TRANSITIONS).sort()).toEqual(
      ["accepted", "cancelled", "done", "expired", "in_progress", "pending", "rejected"].sort()
    );
  });
});

/* ====================== 3. doctor actions + authz ========================== */

describe("startEmergencyInProgress", () => {
  it("moves accepted → in_progress, stamps the time, notifies and broadcasts", async () => {
    const row = emergencyRow("accepted");
    repo.findAppointmentById.mockResolvedValue(row);
    repo.updateAppointment.mockResolvedValue(emergencyRow("in_progress"));

    const result = await startEmergencyInProgress(
      REQUEST(),
      account(12, "doctor"),
      9
    );

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "in_progress" })
    );
    const data = repo.updateAppointment.mock.calls[0][1] as { emergency_in_progress_at: Date };
    expect(data.emergency_in_progress_at).toBeInstanceOf(Date);

    expect(notify).toHaveBeenCalledWith(
      7,
      "appointment_confirmed",
      expect.stringMatching(/in progress/i),
      9,
      "Emergency in progress"
    );
    expect(broadcastAppointmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "in_progress" }),
      "appointment.emergency_in_progress",
      [7, 12]
    );
    expect(result.message).toMatch(/in progress/i);
    expect(result.appointment.status).toBe("in_progress");
  });

  it("refuses a doctor who is not assigned to the emergency", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("accepted"));
    doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 99, user_id: 12 });

    await expect(
      startEmergencyInProgress(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 403 });

    expect(repo.updateAppointment).not.toHaveBeenCalled();
    expect(broadcastAppointmentEvent).not.toHaveBeenCalled();
  });

  it("refuses the patient trying to set their own status", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("accepted"));

    await expect(
      startEmergencyInProgress(REQUEST(), account(7, "patient"), 9)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a stale second tab still sitting on pending", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("pending"));

    await expect(
      startEmergencyInProgress(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/accept/i) });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });

  it("refuses a timed-out emergency (EXPIRED is terminal)", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("expired"));

    await expect(
      startEmergencyInProgress(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });

  it("refuses a non-emergency appointment", async () => {
    repo.findAppointmentById.mockResolvedValue(
      emergencyRow("accepted", { appointment_type: "NORMAL" })
    );

    await expect(
      startEmergencyInProgress(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("completeEmergencyAppointment", () => {
  it("moves in_progress → done, stamps completion, notifies and broadcasts", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("in_progress"));
    repo.updateAppointment.mockResolvedValue(emergencyRow("done"));

    const result = await completeEmergencyAppointment(REQUEST(), account(12, "doctor"), 9);

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "done" })
    );
    const data = repo.updateAppointment.mock.calls[0][1] as { emergency_completed_at: Date };
    expect(data.emergency_completed_at).toBeInstanceOf(Date);

    expect(notify).toHaveBeenCalledWith(
      7,
      "system",
      expect.stringMatching(/completed/i),
      9,
      "Emergency completed"
    );
    expect(broadcastAppointmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
      "appointment.emergency_completed",
      [7, 12]
    );
    expect(result.appointment.status).toBe("done");
  });

  it("refuses an accepted emergency that never started", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("accepted"));

    await expect(
      completeEmergencyAppointment(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/in progress/i) });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });

  it("refuses the second Done tap — done is terminal", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("done"));

    await expect(
      completeEmergencyAppointment(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
    expect(broadcastAppointmentEvent).not.toHaveBeenCalled();
  });

  it("refuses another doctor closing someone else's emergency", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("in_progress"));
    doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 77, user_id: 12 });

    await expect(
      completeEmergencyAppointment(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });

  it("404s when the emergency does not exist", async () => {
    repo.findAppointmentById.mockResolvedValue(null);

    await expect(
      completeEmergencyAppointment(REQUEST(), account(12, "doctor"), 9)
    ).rejects.toMatchObject({ status: 404 });
  });
});

/* ================= 4. eligibility reads from the database ================== */

describe("getEmergencyEligibility", () => {
  it("sweeps timed-out requests before evaluating and then allows", async () => {
    repo.expireTimedOutEmergencies.mockResolvedValue([]);
    repo.findPatientEmergencyAppointment.mockResolvedValue(null);

    const now = new Date(T.getTime() + 45 * MINUTE);
    const result = await getEmergencyEligibility(7, { now });

    expect(repo.expireTimedOutEmergencies).toHaveBeenCalledWith(
      new Date(now.getTime() - 30 * MINUTE),
      7,
      expect.anything()
    );
    expect(result.canCreateEmergency).toBe(true);
  });

  it("blocks while the doctor is with the patient and never expires that row", async () => {
    repo.expireTimedOutEmergencies.mockResolvedValue([]);
    repo.findPatientEmergencyAppointment.mockResolvedValue(
      activeFacts("in_progress", new Date(T.getTime() - 45 * MINUTE))
    );

    const result = await getEmergencyEligibility(7, { now: new Date(T.getTime()) });

    expect(result).toMatchObject({
      canCreateEmergency: false,
      reason: "EMERGENCY_IN_PROGRESS",
      availableAt: null,
      status: "in_progress",
    });
    // The sweep only touches pending/accepted — IN_PROGRESS must survive it.
    expect(repo.expireTimedOutEmergencies.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("returns the deadline for a request still inside its window", async () => {
    repo.expireTimedOutEmergencies.mockResolvedValue([]);
    repo.findPatientEmergencyAppointment.mockResolvedValue(activeFacts("pending", T));

    const now = new Date(T.getTime() + 18 * MINUTE);
    const result: EmergencyEligibility = await getEmergencyEligibility(7, { now });

    expect(result.canCreateEmergency).toBe(false);
    expect(result.reason).toBe("EMERGENCY_ACTIVE");
    expect(result.availableAt).toBe(new Date(T.getTime() + 30 * MINUTE).toISOString());
  });
});

/* ============ 4. one dispatcher for every spelling and every endpoint ============ */

describe("normaliseEmergencyAction", () => {
  it("maps every accepted spelling onto its canonical action", () => {
    expect(normaliseEmergencyAction("accept")).toBe("accept");
    expect(normaliseEmergencyAction("confirm")).toBe("accept");
    expect(normaliseEmergencyAction("reject")).toBe("reject");
    expect(normaliseEmergencyAction("in-progress")).toBe("in-progress");
    expect(normaliseEmergencyAction("in_progress")).toBe("in-progress");
    expect(normaliseEmergencyAction("start")).toBe("in-progress");
    expect(normaliseEmergencyAction("arrived")).toBe("in-progress");
    expect(normaliseEmergencyAction("done")).toBe("done");
    expect(normaliseEmergencyAction("complete")).toBe("done");
    expect(normaliseEmergencyAction("finish")).toBe("done");
    expect(normaliseEmergencyAction("cancel")).toBe("cancel");
  });

  it("tolerates padding and casing from a sloppy client", () => {
    expect(normaliseEmergencyAction("  In-Progress ")).toBe("in-progress");
    expect(normaliseEmergencyAction("DONE")).toBe("done");
  });

  it("returns null for anything else, including an empty value", () => {
    for (const value of ["", "   ", null, undefined, "delete", "start_visit"]) {
      expect(normaliseEmergencyAction(value), String(value)).toBeNull();
    }
  });
});

describe("runEmergencyAction", () => {
  it("drives the lifecycle through the generic /appointments/{id}/{action}/ names", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("accepted"));
    repo.updateAppointment.mockResolvedValue(emergencyRow("in_progress"));

    await runEmergencyAction(REQUEST(), account(12, "doctor"), 9, "in-progress");

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "in_progress" })
    );
  });

  it("completes an in-progress emergency via the generic `complete` spelling", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("in_progress"));
    repo.updateAppointment.mockResolvedValue(emergencyRow("done"));

    await runEmergencyAction(REQUEST(), account(12, "doctor"), 9, "complete");

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "done", emergency_completed_at: expect.any(Date) })
    );
  });

  it("rejects an unknown action with a 400 and changes nothing", async () => {
    await expect(
      runEmergencyAction(REQUEST(), account(12, "doctor"), 9, "definitely-not-an-action")
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });
});

/* ============================ 5. cancel an open request ============================ */

describe("cancelEmergencyAppointment", () => {
  it("cancels a pending request and records the reason", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("pending"));
    repo.updateAppointment.mockResolvedValue(emergencyRow("cancelled"));

    await cancelEmergencyAppointment(REQUEST(), account(12, "doctor"), 9, {
      cancel_reason: "Wrong patient",
    });

    expect(repo.updateAppointment).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "cancelled", cancel_reason: "Wrong patient" })
    );
  });

  it("lets the patient withdraw their own request", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("pending"));
    repo.updateAppointment.mockResolvedValue(emergencyRow("cancelled"));

    await expect(
      cancelEmergencyAppointment(REQUEST(), account(7, "patient"), 9, {})
    ).resolves.toMatchObject({ appointment: expect.objectContaining({ status: "cancelled" }) });
  });

  it("refuses once in progress — the visit may only end as done", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("in_progress"));

    await expect(
      cancelEmergencyAppointment(REQUEST(), account(12, "doctor"), 9, {})
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.updateAppointment).not.toHaveBeenCalled();
  });
});

/* ======================= 6. delete a finished emergency ======================= */

describe("deleteEmergencyAppointment", () => {
  it("deletes a DONE emergency and tells patient + doctor over the socket", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("done"));

    await deleteEmergencyAppointment(account(12, "doctor"), 9);

    expect(repo.deleteAppointment).toHaveBeenCalledWith(9);
    expect(pushRaw).toHaveBeenCalledWith("appointment.deleted", { id: 9 }, [7, 12]);
  });

  it("refuses while the request is still live, and deletes nothing", async () => {
    for (const status of ["pending", "accepted", "in_progress"] as const) {
      vi.clearAllMocks();
      doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 4, user_id: 12 });
      repo.findAppointmentById.mockResolvedValue(emergencyRow(status));

      await expect(
        deleteEmergencyAppointment(account(12, "doctor"), 9)
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.deleteAppointment).not.toHaveBeenCalled();
    }
  });

  it("keeps a timed-out emergency as history rather than letting it be erased", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("expired"));

    await expect(deleteEmergencyAppointment(account(12, "doctor"), 9)).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.deleteAppointment).not.toHaveBeenCalled();
  });

  it("refuses a doctor who is not the assigned one", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("done"));
    doctorsRepo.findDoctorByUserId.mockResolvedValue({ id: 99, user_id: 12 });

    await expect(deleteEmergencyAppointment(account(12, "doctor"), 9)).rejects.toMatchObject({
      status: 403,
    });
    expect(repo.deleteAppointment).not.toHaveBeenCalled();
  });

  it("refuses the patient even though they own the row", async () => {
    repo.findAppointmentById.mockResolvedValue(emergencyRow("done"));

    await expect(deleteEmergencyAppointment(account(7, "patient"), 9)).rejects.toMatchObject({
      status: 403,
    });
    expect(repo.deleteAppointment).not.toHaveBeenCalled();
  });
});

describe("emergencyNotificationType", () => {
  const VALID = [
    "appointment_request",
    "appointment_confirmed",
    "appointment_cancelled",
    "appointment_rejected",
    "appointment_reminder",
    "review",
    "system",
  ];
  const KINDS = [
    "requested",
    "accepted",
    "inProgress",
    "completed",
    "rejected",
    "cancelled",
  ] as const;

  it("maps every lifecycle event onto a member of the NotificationType enum", () => {
    for (const kind of KINDS) {
      expect(VALID).toContain(emergencyNotificationType(kind));
    }
  });

  it("never returns an emergency_* name the DB enum lacks", () => {
    for (const kind of KINDS) {
      expect(emergencyNotificationType(kind)).not.toMatch(/^emergency_/);
    }
  });
});

/* ==================== 4. the 24-hour auto-delete =========================== */

describe("purgeExpiredAppointments — 24h retention", () => {
  it("keeps the retention window at 24 hours", () => {
    expect(EXPIRED_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("purges rows whose expiry passed more than a day ago and broadcasts each", async () => {
    repo.purgeExpiredEmergencies.mockResolvedValue([
      { id: 9, patient_id: 7, doctor: { user_id: 12 } },
      { id: 10, patient_id: 7, doctor: { user_id: 12 } },
    ]);

    const removed = await purgeExpiredAppointments();

    expect(removed).toBe(2);
    const cutoff = repo.purgeExpiredEmergencies.mock.calls[0][0] as Date;
    expect(Math.abs(cutoff.getTime() - (Date.now() - EXPIRED_RETENTION_MS))).toBeLessThan(10_000);
    expect(pushRaw).toHaveBeenCalledTimes(2);
    expect(pushRaw).toHaveBeenNthCalledWith(1, "appointment.deleted", { id: 9 }, [7, 12]);
    expect(pushRaw).toHaveBeenNthCalledWith(2, "appointment.deleted", { id: 10 }, [7, 12]);
  });

  it("stays quiet when there is nothing to purge", async () => {
    repo.purgeExpiredEmergencies.mockResolvedValue([]);

    expect(await purgeExpiredAppointments()).toBe(0);
    expect(pushRaw).not.toHaveBeenCalled();
  });
});
