/**
 * Emergency section ported to the production app (§27):
 *
 *  1. Navigation — "Emergency" appears in the sidebar AND bottom bar for both
 *     patient (/emergency) and doctor (/doctor/emergency), and never for admin.
 *  2. PatientEmergencyScreen — renders the SOS request form when nothing is
 *     open, and the live status card when a request is pending.
 *  3. DoctorEmergencyScreen — renders the queue, accepts/rejects with the
 *     shared reason flow.
 *  4. Route guards — /doctor/emergency is doctor-only.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { bottomNavItemsFor, navItemsFor } from "../components/AppShell";
import { roleOwnsPath } from "../components/guards";
import {
  PatientEmergencyScreen,
  DoctorEmergencyScreen,
} from "../screens/emergency";
import { ToastProvider } from "../state/app-context";
import type { EmergencyAppointment, User } from "../api/types";

const { listEmergencies, createEmergency, respondToEmergency, listDoctors, getDoctorAvailability } =
  vi.hoisted(() => ({
    listEmergencies: vi.fn(),
    createEmergency: vi.fn(),
    respondToEmergency: vi.fn(),
    listDoctors: vi.fn(),
    getDoctorAvailability: vi.fn(),
  }));

vi.mock("../api/emergency", () => ({
  listEmergencies,
  createEmergency,
  respondToEmergency,
  listNearbyDoctors: vi.fn(),
}));

vi.mock("../api/doctors", () => ({
  listDoctors,
  getDoctorAvailability,
  getDoctor: vi.fn(),
  getDoctorAvailableDays: vi.fn(),
  getMySchedule: vi.fn(),
  getMyDoctorProfile: vi.fn(),
  updateMyDoctorProfile: vi.fn(),
  createScheduleItem: vi.fn(),
  updateScheduleItem: vi.fn(),
  deleteScheduleItem: vi.fn(),
  listAvailabilityBreaks: vi.fn(),
  createAvailabilityBreak: vi.fn(),
  deleteAvailabilityBreak: vi.fn(),
  listScheduleExceptions: vi.fn(),
  createScheduleException: vi.fn(),
  deleteScheduleException: vi.fn(),
}));

// The screens subscribe to live updates; the socket itself is out of scope here.
vi.mock("../realtime/socket", () => ({
  useRealtimeSync: vi.fn(),
  useRealtimeEvent: vi.fn(),
  useRealtimeConnected: () => true,
  useRealtimeStatus: () => "connected",
}));

function envelope<T>(data: T) {
  return { success: true, message: "", data };
}

function user(role: User["role"], is_superuser = false): User {
  return {
    id: 1,
    username: "u",
    email: "u@example.com",
    first_name: "A",
    last_name: "B",
    role,
    phone: "",
    is_superuser,
    profile_image: null,
    date_joined: null,
  };
}

function pendingRequest(overrides: Partial<EmergencyAppointment> = {}): EmergencyAppointment {
  return {
    id: 9,
    patient: 7,
    patient_email: "asha@example.com",
    doctor: 4,
    hospital: null,
    appointment_date: "2026-09-30",
    start_time: "09:00:00",
    end_time: "09:30:00",
    status: "pending",
    appointment_type: "EMERGENCY",
    reason: "",
    notes: "",
    cancel_reason: "",
    emergency_reason: "injury",
    emergency_description: "Motorbike fall on Nyerere Rd",
    emergency_requested_at: "2026-09-27T10:00:00Z",
    patient_name: "Asha Juma",
    patient_phone: "+255712000111",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listDoctors.mockResolvedValue(envelope({ count: 0, next: null, previous: null, results: [] }));
  getDoctorAvailability.mockResolvedValue(envelope({ doctor: 4, date: "2026-09-30", slots: [] }));
});

function renderPatient() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <PatientEmergencyScreen />
      </ToastProvider>
    </MemoryRouter>
  );
}

function renderDoctor() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DoctorEmergencyScreen />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("Emergency navigation entries", () => {
  it("shows Emergency in the patient sidebar and bottom bar", () => {
    expect(navItemsFor(user("patient")).some((i) => i.to === "/emergency" && i.label === "Emergency")).toBe(true);
    expect(bottomNavItemsFor(user("patient")).some((i) => i.to === "/emergency")).toBe(true);
  });

  it("shows Emergency in the doctor sidebar and bottom bar", () => {
    expect(navItemsFor(user("doctor")).some((i) => i.to === "/doctor/emergency" && i.label === "Emergency")).toBe(true);
    expect(bottomNavItemsFor(user("doctor")).some((i) => i.to === "/doctor/emergency")).toBe(true);
  });

  it("never shows Emergency to admins and keeps bottom navs at 5 items", () => {
    expect(navItemsFor(user("admin", true)).some((i) => i.label === "Emergency")).toBe(false);
    expect(bottomNavItemsFor(user("admin", true)).some((i) => i.label === "Emergency")).toBe(false);
    expect(bottomNavItemsFor(user("patient"))).toHaveLength(5);
    expect(bottomNavItemsFor(user("doctor"))).toHaveLength(5);
    expect(bottomNavItemsFor(user("admin", true))).toHaveLength(5);
  });

  it("keeps the doctor's emergency route doctor-only", () => {
    expect(roleOwnsPath("/doctor/emergency", user("doctor"))).toBe(true);
    expect(roleOwnsPath("/doctor/emergency", user("patient"))).toBe(false);
    expect(roleOwnsPath("/doctor/emergency", user("admin", true))).toBe(false);
  });
});

describe("PatientEmergencyScreen", () => {
  it("renders the SOS request form when no request is open", async () => {
    listEmergencies.mockResolvedValue(envelope([]));

    renderPatient();

    expect(await screen.findByRole("heading", { name: "Request emergency help" })).toBeInTheDocument();
    expect(screen.getByLabelText("Doctor")).toBeInTheDocument();
    expect(screen.getByLabelText("What is happening?")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request emergency help/i })).toBeInTheDocument();
    expect(listEmergencies).toHaveBeenCalledTimes(1);
    expect(listDoctors).toHaveBeenCalledTimes(1);
  });

  it("shows the live status card while a request is pending", async () => {
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));

    renderPatient();

    expect(await screen.findByText("Waiting for the doctor to accept your request…")).toBeInTheDocument();
    expect(screen.getByText(/severe pain|injury/i)).toBeInTheDocument();
    // No form while a request is open.
    expect(screen.queryByLabelText("What is happening?")).not.toBeInTheDocument();
  });
});

describe("DoctorEmergencyScreen", () => {
  it("shows an empty state when there is nothing to handle", async () => {
    listEmergencies.mockResolvedValue(envelope([]));

    renderDoctor();

    expect(await screen.findByText("No emergency requests right now")).toBeInTheDocument();
  });

  it("renders a request with patient contact details and accept/reject actions", async () => {
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));

    renderDoctor();

    expect(await screen.findByText("Asha Juma")).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /255712000111/ })).toHaveAttribute("href", "tel:+255712000111");
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("accepts a request and reloads the queue", async () => {
    const who = userEvent.setup();
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));
    respondToEmergency.mockResolvedValue(envelope(pendingRequest({ status: "confirmed" })));

    renderDoctor();
    await screen.findByText("Asha Juma");
    await who.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() =>
      expect(respondToEmergency).toHaveBeenCalledWith(9, "accept")
    );
    expect(listEmergencies).toHaveBeenCalledTimes(2);
  });

  it("opens the shared-reason reject flow and sends the reason", async () => {
    const who = userEvent.setup();
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));
    respondToEmergency.mockResolvedValue(envelope(pendingRequest({ status: "rejected" })));

    renderDoctor();
    await screen.findByText("Asha Juma");
    await who.click(screen.getByRole("button", { name: /reject/i }));

    const reason = await screen.findByLabelText("Reason (shared with the patient)");
    await who.type(reason, "Off duty - call the clinic line");
    await who.click(screen.getByRole("button", { name: /confirm rejection/i }));

    await waitFor(() =>
      expect(respondToEmergency).toHaveBeenCalledWith(9, "reject", {
        cancel_reason: "Off duty - call the clinic line",
      })
    );
  });
});
