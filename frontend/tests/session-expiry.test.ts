/**
 * Session-expiry engine — a never-started session must not stay actionable
 * after its scheduled window has passed:
 *
 *  • training sessions are date-only, so they expire when their UTC day ends;
 *  • psychology-service sessions expire at their scheduled end time (a session
 *    later the same day is untouched);
 *  • only sessions that were never started expire;
 *  • the parent request is closed as `expired` only when no startable session
 *    is left, and the patient is notified exactly once.
 *
 * `@/lib/db` is replaced with a small relational fake so the assertions can
 * inspect every row and the exact WHERE shape the service relies on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const state = {
    trainingRequests: [] as Row[],
    trainingSessions: [] as Row[],
    psychotherapyRequests: [] as Row[],
    psychotherapySessions: [] as Row[],
  };

  const ids = {
    trainingRequest: 1,
    trainingSession: 1,
    psychotherapyRequest: 1,
    psychotherapySession: 1,
  };

  const notifications: Array<{
    recipient: number;
    type: string;
    message: string;
    appointmentId: number | null;
    title?: string;
  }> = [];
  const broadcasts: string[] = [];

  const has = (value: unknown, expected: unknown): boolean =>
    Array.isArray(expected) ? expected.includes(value) : value === expected;

  /** Handles both `status: "x"` and `status: { in: [...] }` conditions. */
  const inCondition = (value: unknown, condition: any): boolean => {
    if (condition && typeof condition === "object" && !Array.isArray(condition) && "in" in condition) {
      return condition.in.includes(value);
    }
    return has(value, condition);
  };

  function idMatches(row: Row, where: Row): boolean {
    if (where.id === undefined) return true;
    if (where.id && typeof where.id === "object" && Array.isArray(where.id.in)) {
      return where.id.in.includes(row.id);
    }
    return row.id === where.id;
  }

  function trainingSessionMatches(session: Row, where: Row): boolean {
    if (!idMatches(session, where)) return false;
    if (where.status !== undefined && !inCondition(session.status, where.status)) return false;
    if (where.session_date?.lt) {
      if (!(session.session_date.getTime() < new Date(where.session_date.lt).getTime())) return false;
    }
    if (where.training?.status) {
      const parent = state.trainingRequests.find((row) => row.id === session.training_request_id);
      if (!parent || !inCondition(parent.status, where.training.status)) return false;
    }
    return true;
  }

  function trainingRequestMatches(request: Row, where: Row): boolean {
    if (!idMatches(request, where)) return false;
    if (where.status !== undefined && !inCondition(request.status, where.status)) return false;
    if (where.sessions) {
      const sessions = state.trainingSessions.filter(
        (row) => row.training_request_id === request.id
      );
      if (
        where.sessions.some &&
        !sessions.some((row) => inCondition(row.status, where.sessions.some.status))
      ) {
        return false;
      }
      if (
        where.sessions.none &&
        sessions.some((row) => inCondition(row.status, where.sessions.none.status))
      ) {
        return false;
      }
    }
    return true;
  }

  function psychotherapySessionMatches(session: Row, where: Row): boolean {
    if (!idMatches(session, where)) return false;
    if (where.status !== undefined && !inCondition(session.status, where.status)) return false;
    if (where.scheduled_date?.lte) {
      if (!(session.scheduled_date.getTime() <= new Date(where.scheduled_date.lte).getTime())) {
        return false;
      }
    }
    if (where.request?.status) {
      const parent = state.psychotherapyRequests.find(
        (row) => row.id === session.psychotherapy_request_id
      );
      if (!parent || !inCondition(parent.status, where.request.status)) return false;
    }
    return true;
  }

  function psychotherapyRequestMatches(request: Row, where: Row): boolean {
    if (!idMatches(request, where)) return false;
    if (where.status !== undefined && !inCondition(request.status, where.status)) return false;
    if (where.sessions) {
      const sessions = state.psychotherapySessions.filter(
        (row) => row.psychotherapy_request_id === request.id
      );
      if (
        where.sessions.some &&
        !sessions.some((row) => inCondition(row.status, where.sessions.some.status))
      ) {
        return false;
      }
      if (
        where.sessions.none &&
        sessions.some((row) => inCondition(row.status, where.sessions.none.status))
      ) {
        return false;
      }
    }
    return true;
  }

  const updateRows = (rows: Row[], matches: (row: Row) => boolean, data: Row) => {
    let count = 0;
    for (const row of rows) {
      if (!matches(row)) continue;
      Object.assign(row, data);
      count += 1;
    }
    return { count };
  };

  const prisma = {
    trainingSession: {
      findMany: async ({ where }: Row) =>
        state.trainingSessions.filter((row) => trainingSessionMatches(row, where)),
      updateMany: async ({ where, data }: Row) =>
        updateRows(state.trainingSessions, (row) => trainingSessionMatches(row, where), data),
    },
    trainingRequest: {
      findMany: async ({ where }: Row) =>
        state.trainingRequests.filter((row) => trainingRequestMatches(row, where)),
      updateMany: async ({ where, data }: Row) =>
        updateRows(state.trainingRequests, (row) => trainingRequestMatches(row, where), data),
    },
    psychotherapySession: {
      findMany: async ({ where }: Row) =>
        state.psychotherapySessions.filter((row) => psychotherapySessionMatches(row, where)),
      updateMany: async ({ where, data }: Row) =>
        updateRows(state.psychotherapySessions, (row) => psychotherapySessionMatches(row, where), data),
    },
    psychotherapyRequest: {
      findMany: async ({ where }: Row) =>
        state.psychotherapyRequests.filter((row) => psychotherapyRequestMatches(row, where)),
      updateMany: async ({ where, data }: Row) =>
        updateRows(state.psychotherapyRequests, (row) => psychotherapyRequestMatches(row, where), data),
    },
    auditEvent: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: Row) => ({ id: 1, ...data }),
    },
  };

  const addTrainingRequest = (overrides: Row = {}) => {
    const row: Row = {
      id: ids.trainingRequest++,
      patient_id: 7,
      training_topic: "Workplace safety",
      status: "accepted",
      expired_at: null,
      ...overrides,
    };
    state.trainingRequests.push(row);
    return row;
  };

  const addTrainingSession = (requestId: number, overrides: Row = {}) => {
    const row: Row = {
      id: ids.trainingSession++,
      training_request_id: requestId,
      session_number: 1,
      session_date: new Date("2026-05-09T00:00:00.000Z"),
      status: "pending",
      started_at: null,
      completed_at: null,
      expired_at: null,
      ...overrides,
    };
    state.trainingSessions.push(row);
    return row;
  };

  const addPsychotherapyRequest = (overrides: Row = {}) => {
    const row: Row = {
      id: ids.psychotherapyRequest++,
      patient_id: 7,
      status: "accepted",
      expired_at: null,
      ...overrides,
    };
    state.psychotherapyRequests.push(row);
    return row;
  };

  const addPsychotherapySession = (requestId: number, overrides: Row = {}) => {
    const row: Row = {
      id: ids.psychotherapySession++,
      psychotherapy_request_id: requestId,
      session_number: 1,
      scheduled_date: new Date("2026-05-09T00:00:00.000Z"),
      start_time: "09:00:00",
      end_time: "10:00:00",
      status: "scheduled",
      started_at: null,
      completed_at: null,
      expired_at: null,
      ...overrides,
    };
    state.psychotherapySessions.push(row);
    return row;
  };

  const reset = () => {
    state.trainingRequests.length = 0;
    state.trainingSessions.length = 0;
    state.psychotherapyRequests.length = 0;
    state.psychotherapySessions.length = 0;
    notifications.length = 0;
    broadcasts.length = 0;
    ids.trainingRequest = 1;
    ids.trainingSession = 1;
    ids.psychotherapyRequest = 1;
    ids.psychotherapySession = 1;
  };

  return {
    prisma,
    notifications,
    broadcasts,
    addTrainingRequest,
    addTrainingSession,
    addPsychotherapyRequest,
    addPsychotherapySession,
    reset,
  };
});

vi.mock("@/lib/db", () => ({
  prisma: harness.prisma,
  withSystemDatabaseIdentity: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/notify", () => ({
  notify: async (
    recipient: number,
    type: string,
    message: string,
    appointmentId: number | null,
    title?: string
  ) => {
    harness.notifications.push({ recipient, type, message, appointmentId, title });
    return { id: harness.notifications.length };
  },
  broadcastPlatformDataUpdated: (resource: string) => {
    harness.broadcasts.push(resource);
  },
}));

import { expireStaleSessions } from "@/services/session-expiry.service";

const NOW = new Date("2026-05-10T12:00:00.000Z");
const YESTERDAY = new Date("2026-05-09T00:00:00.000Z");
const TODAY = new Date("2026-05-10T00:00:00.000Z");
const TOMORROW = new Date("2026-05-11T00:00:00.000Z");

const zeros = {
  training_sessions: 0,
  training_requests: 0,
  psychotherapy_sessions: 0,
  psychotherapy_requests: 0,
};

beforeEach(() => {
  harness.reset();
});

describe("training session expiry", () => {
  it("expires a never-started session from a past UTC day and closes the request", async () => {
    const request = harness.addTrainingRequest();
    const session = harness.addTrainingSession(request.id, { session_date: YESTERDAY });

    const result = await expireStaleSessions(NOW);

    expect(session.status).toBe("expired");
    expect(session.expired_at).toEqual(NOW);
    expect(request.status).toBe("expired");
    expect(request.expired_at).toEqual(NOW);
    expect(result).toEqual({
      ...zeros,
      training_sessions: 1,
      training_requests: 1,
    });
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]).toMatchObject({
      recipient: 7,
      title: "Training expired",
    });
    expect(harness.notifications[0].message).toContain("request a new training");
    expect(harness.broadcasts).toEqual(["training"]);
  });

  it("keeps today's session (date-only sessions expire when the UTC day ends)", async () => {
    const request = harness.addTrainingRequest();
    const session = harness.addTrainingSession(request.id, { session_date: TODAY });

    const result = await expireStaleSessions(NOW);

    expect(session.status).toBe("pending");
    expect(request.status).toBe("accepted");
    expect(result).toEqual(zeros);
    expect(harness.notifications).toHaveLength(0);
  });

  it("keeps the request open while another session can still be started", async () => {
    const request = harness.addTrainingRequest();
    const stale = harness.addTrainingSession(request.id, {
      session_number: 1,
      session_date: YESTERDAY,
    });
    const future = harness.addTrainingSession(request.id, {
      session_number: 2,
      session_date: TOMORROW,
    });

    const result = await expireStaleSessions(NOW);

    expect(stale.status).toBe("expired");
    expect(future.status).toBe("pending");
    expect(request.status).toBe("accepted");
    expect(result).toEqual({ ...zeros, training_sessions: 1 });
    expect(harness.notifications).toHaveLength(0);
  });

  it("never expires a session that was already started", async () => {
    const request = harness.addTrainingRequest();
    const session = harness.addTrainingSession(request.id, {
      session_date: YESTERDAY,
      status: "in_progress",
      started_at: new Date("2026-05-09T09:00:00.000Z"),
    });

    const result = await expireStaleSessions(NOW);

    expect(session.status).toBe("in_progress");
    expect(request.status).toBe("accepted");
    expect(result).toEqual(zeros);
  });

  it("closes a mixed completed + expired request as expired", async () => {
    const request = harness.addTrainingRequest();
    const completed = harness.addTrainingSession(request.id, {
      session_number: 1,
      session_date: YESTERDAY,
      status: "completed",
      completed_at: new Date("2026-05-09T10:00:00.000Z"),
    });
    const missed = harness.addTrainingSession(request.id, {
      session_number: 2,
      session_date: YESTERDAY,
    });

    const result = await expireStaleSessions(NOW);

    expect(completed.status).toBe("completed");
    expect(missed.status).toBe("expired");
    expect(request.status).toBe("expired");
    expect(result).toEqual({
      ...zeros,
      training_sessions: 1,
      training_requests: 1,
    });
  });

  it("is idempotent — a second pass changes nothing and does not notify twice", async () => {
    const request = harness.addTrainingRequest();
    harness.addTrainingSession(request.id, { session_date: YESTERDAY });

    await expireStaleSessions(NOW);
    const second = await expireStaleSessions(NOW);

    expect(second).toEqual(zeros);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.broadcasts).toEqual(["training"]);
  });
});

describe("psychology-service session expiry", () => {
  it("expires a session at its end time, leaving a later session today alone", async () => {
    const request = harness.addPsychotherapyRequest();
    const ended = harness.addPsychotherapySession(request.id, {
      session_number: 1,
      scheduled_date: TODAY,
      start_time: "09:00:00",
      end_time: "10:00:00",
    });
    const later = harness.addPsychotherapySession(request.id, {
      session_number: 2,
      scheduled_date: TODAY,
      start_time: "12:30:00",
      end_time: "13:20:00",
    });

    const result = await expireStaleSessions(NOW);

    expect(ended.status).toBe("expired");
    expect(ended.expired_at).toEqual(NOW);
    expect(later.status).toBe("scheduled");
    expect(request.status).toBe("accepted");
    expect(result).toEqual({ ...zeros, psychotherapy_sessions: 1 });
    expect(harness.notifications).toHaveLength(0);
  });

  it("expires a session whose end time is exactly now (the window has fully elapsed)", async () => {
    const request = harness.addPsychotherapyRequest();
    const boundary = harness.addPsychotherapySession(request.id, {
      scheduled_date: TODAY,
      start_time: "11:00:00",
      end_time: "12:00:00",
    });

    const result = await expireStaleSessions(NOW);

    expect(boundary.status).toBe("expired");
    expect(result.psychotherapy_sessions).toBe(1);
  });

  it("closes the request once nothing can be started and notifies the patient", async () => {
    const request = harness.addPsychotherapyRequest();
    const session = harness.addPsychotherapySession(request.id, {
      scheduled_date: YESTERDAY,
    });

    const result = await expireStaleSessions(NOW);

    expect(session.status).toBe("expired");
    expect(request.status).toBe("expired");
    expect(request.expired_at).toEqual(NOW);
    expect(result).toEqual({
      ...zeros,
      psychotherapy_sessions: 1,
      psychotherapy_requests: 1,
    });
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]).toMatchObject({
      recipient: 7,
      title: "Psychology service expired",
    });
    expect(harness.notifications[0].message).toContain("request a new psychology service session");
    expect(harness.broadcasts).toEqual(["psychotherapy"]);
  });

  it("leaves an in-progress session and its request active", async () => {
    const request = harness.addPsychotherapyRequest({ status: "in_progress" });
    const session = harness.addPsychotherapySession(request.id, {
      scheduled_date: YESTERDAY,
      status: "in_progress",
      started_at: new Date("2026-05-09T09:05:00.000Z"),
    });

    const result = await expireStaleSessions(NOW);

    expect(session.status).toBe("in_progress");
    expect(request.status).toBe("in_progress");
    expect(result).toEqual(zeros);
  });

  it("is idempotent and does not repeat the notification", async () => {
    const request = harness.addPsychotherapyRequest();
    harness.addPsychotherapySession(request.id, { scheduled_date: YESTERDAY });

    await expireStaleSessions(NOW);
    const second = await expireStaleSessions(NOW);

    expect(second).toEqual(zeros);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.broadcasts).toEqual(["psychotherapy"]);
  });
});
