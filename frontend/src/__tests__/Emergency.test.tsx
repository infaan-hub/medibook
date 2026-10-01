/**
 * Emergency section ported to the production app (§27):
 *
 *  1. Navigation — "Emergency" appears in the sidebar AND bottom bar for both
 *     patient (/emergency) and doctor (/doctor/emergency), and never for admin.
 *  2. PatientEmergencyScreen — renders the SOS request form when nothing is
 *     open (no date picker and no slot grid: the emergency is stamped with the
 *     current moment, and GPS is shared before submitting), and the live
 *     status card when a request is pending.
 *  3. DoctorEmergencyScreen — renders the queue, accepts/rejects with the
 *     shared reason flow, and only offers Accept on still-pending requests.
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
  todayStr,
} from "../screens/emergency";
import { ToastProvider } from "../state/app-context";
import type { EmergencyAppointment, User } from "../api/types";

const { listEmergencies, createEmergency, respondToEmergency, listEmergencySlots } = vi.hoisted(
  () => ({
    listEmergencies: vi.fn(),
    createEmergency: vi.fn(),
    respondToEmergency: vi.fn(),
    listEmergencySlots: vi.fn(),
  })
);

vi.mock("../api/emergency", () => ({
  listEmergencies,
  createEmergency,
  respondToEmergency,
  listEmergencySlots,
  listNearbyDoctors: vi.fn(),
}));

vi.mock("../api/doctors", () => ({
  listDoctors: vi.fn(),
  getDoctorAvailability: vi.fn(),
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

/** jsdom ships no geolocation — give the screen a real Zanzibar fix. */
function stubGeolocation(latitude = -6.162, longitude = 39.298) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        onSuccess: (position: {
          coords: { latitude: number; longitude: number; accuracy: number };
        }) => void
      ) => onSuccess({ coords: { latitude, longitude, accuracy: 12 } }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubGeolocation();
  listEmergencySlots.mockResolvedValue(envelope([]));
  createEmergency.mockResolvedValue(
    envelope(pendingRequest({ status: "accepted", doctor_name: "Neema Kimaro" }))
  );
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
    // No doctor picker: auto-dispatch decides who goes, on the current time.
    expect(screen.queryByLabelText("Doctor")).not.toBeInTheDocument();
    expect(screen.getByLabelText("What is happening?")).toBeInTheDocument();
    // No date picker: the appointment starts now, so it is always today's.
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    expect(screen.getByText("Your location")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request emergency help/i })).toBeInTheDocument();
    expect(listEmergencies).toHaveBeenCalledTimes(1);
    expect(listEmergencySlots).not.toHaveBeenCalled();
  });

  it("books on the browser's local calendar day, not the UTC one", () => {
    // 01:00 local on the 1st is still the 30th in UTC for zones east of
    // Greenwich — an emergency raised then must not be booked on yesterday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 1, 0, 0));
    try {
      expect(todayStr()).toBe("2026-10-01");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares the location without querying any time slots", async () => {
    const who = userEvent.setup();
    listEmergencies.mockResolvedValue(envelope([]));

    renderPatient();

    await who.click(await screen.findByRole("button", { name: /share my location/i }));
    expect(await screen.findByRole("button", { name: /location shared/i })).toBeInTheDocument();

    expect(listEmergencySlots).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Available time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Doctor")).not.toBeInTheDocument();
  });

  it("submits the current moment — no date field and no slot to pick", async () => {
    const who = userEvent.setup();
    listEmergencies.mockResolvedValue(envelope([]));

    renderPatient();

    await who.click(await screen.findByRole("button", { name: /share my location/i }));
    await screen.findByRole("button", { name: /location shared/i });
    await who.selectOptions(await screen.findByLabelText("What is happening?"), "injury");
    await who.click(screen.getByRole("button", { name: /request emergency help/i }));

    await waitFor(() => expect(createEmergency).toHaveBeenCalledTimes(1));
    const payload = createEmergency.mock.calls[0][0];
    expect(payload).toMatchObject({
      appointment_date: todayStr(),
      emergency_reason: "injury",
      emergency_latitude: -6.162,
      emergency_longitude: 39.298,
    });
    expect(payload.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(payload.end_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(payload).not.toHaveProperty("doctor");
  });

  it("shows the live status card while a request is pending", async () => {
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));

    renderPatient();

    expect(await screen.findByText("Waiting for the doctor to accept your request…")).toBeInTheDocument();
    expect(screen.getByText(/severe pain|injury/i)).toBeInTheDocument();
    // No form while a request is open.
    expect(screen.queryByLabelText("What is happening?")).not.toBeInTheDocument();
  });

  it("names the auto-assigned doctor and the patient's Zanzibar area on the status card", async () => {
    listEmergencies.mockResolvedValue(
      envelope([
        pendingRequest({
          status: "accepted",
          doctor_name: "Neema Kimaro",
          doctor_latitude: -6.1622,
          doctor_longitude: 39.2982,
          doctor_phone: "+255712000001",
          emergency_latitude: -6.165,
          emergency_longitude: 39.296,
        }),
      ])
    );

    renderPatient();

    expect(
      await screen.findByText(/The nearest doctor has been assigned/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Neema Kimaro/)).toBeInTheDocument();
    expect(screen.getByText(/Your location:/)).toBeInTheDocument();
    expect(
      screen.queryByText("Waiting for the doctor to accept your request…")
    ).not.toBeInTheDocument();
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

  it("hides Accept on an auto-accepted request but keeps Reject and the maps link", async () => {
    listEmergencies.mockResolvedValue(
      envelope([
        pendingRequest({
          status: "accepted",
          doctor_name: "Neema Kimaro",
          emergency_latitude: -6.165,
          emergency_longitude: 39.296,
        }),
      ])
    );

    renderDoctor();

    expect(await screen.findByText("Asha Juma")).toBeInTheDocument();
    expect(screen.getByText(/auto-assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/Patient is in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open in google maps/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=-6.165,39.296"
    );
  });

  it("accepts a request and reloads the queue", async () => {
    const who = userEvent.setup();
    listEmergencies.mockResolvedValue(envelope([pendingRequest()]));
    respondToEmergency.mockResolvedValue(envelope(pendingRequest({ status: "accepted" })));

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
