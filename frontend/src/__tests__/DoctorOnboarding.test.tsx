/**
 * /doctor/onboarding — first-login setup flow.
 *
 * The flow is server-driven: `GET /doctors/me/onboarding/` decides the
 * outstanding steps (resume point), `POST` is the ONLY way to become complete
 * and can be refused. These tests pin the three behaviours that matter:
 *   1. resume — the panel opens on the first step the server still reports;
 *   2. refusal — a rejected completion keeps the doctor in the flow and moves
 *      to the step that failed, showing the real error;
 *   3. success — the session user flips and the router leaves the flow.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "../api/client";
import { DoctorOnboardingScreen } from "../screens/doctor-onboarding";

const mocks = vi.hoisted(() => {
  const push = {
    probed: true,
    message: "",
    error: null as string | null,
    actionLabel: null as string | null,
    steps: null as readonly string[] | null,
    loading: false,
    subscribe: vi.fn(),
  };
  return {
    push,
    getDoctorOnboarding: vi.fn(),
    getMyDoctorProfile: vi.fn(),
    updateMyDoctorProfile: vi.fn(),
    completeDoctorOnboarding: vi.fn(),
    listSpecialties: vi.fn(),
    uploadProfileImage: vi.fn(),
    setUser: vi.fn(),
    notify: vi.fn(),
  };
});

vi.mock("../api/doctors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/doctors")>()),
  getDoctorOnboarding: mocks.getDoctorOnboarding,
  getMyDoctorProfile: mocks.getMyDoctorProfile,
  updateMyDoctorProfile: mocks.updateMyDoctorProfile,
  completeDoctorOnboarding: mocks.completeDoctorOnboarding,
}));

vi.mock("../api/specialties", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/specialties")>()),
  listSpecialties: mocks.listSpecialties,
}));

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth")>()),
  uploadProfileImage: mocks.uploadProfileImage,
}));

vi.mock("../push/usePushNotifications", () => ({
  usePushNotifications: () => mocks.push,
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({
    user: {
      id: 9,
      username: "dr.mrema",
      email: "mrema@clinic.tz",
      first_name: "John",
      last_name: "Mrema",
      role: "doctor",
      phone: "",
      is_superuser: false,
      profile_image: null,
      date_joined: null,
      doctor_onboarding_completed: false,
    },
    setUser: mocks.setUser,
  }),
  useToast: () => ({ notify: mocks.notify }),
}));

/** §28 list envelope for the specialty catalog. */
function specialtyList() {
  return {
    success: true,
    message: "",
    data: {
      count: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
      next: null,
      previous: null,
      results: [
        { id: 1, name: "Cardiology", patient_friendly_name: "Heart", description: "" },
        { id: 2, name: "Dermatology", patient_friendly_name: "Skin", description: "" },
      ],
    },
  };
}

const profile = {
  id: 9,
  email: "mrema@clinic.tz",
  first_name: "John",
  last_name: "Mrema",
  phone: "",
  phone_secondary: "",
  profile_image: null,
  specialties: [],
  qualifications: "",
  experience_years: 4,
  consultation_fee: "15000.00",
  bio: "",
  latitude: null,
  longitude: null,
  location_accuracy: null,
  location_captured_at: null,
  has_location: false,
  distance_km: null,
  is_available: true,
  available_today: true,
  average_rating: "5.00",
  total_reviews: 0,
};

function status(steps: Partial<Record<string, boolean>>, completed = false) {
  const all = { notifications: false, location: false, profile_image: false, doctor_profile: false, ...steps };
  return {
    success: true,
    message: "",
    data: {
      completed,
      steps: all,
      next_step: Object.entries(all).find(([, done]) => !done)?.[0] ?? null,
      user: {
        id: 9,
        username: "dr.mrema",
        email: "mrema@clinic.tz",
        first_name: "John",
        last_name: "Mrema",
        role: "doctor",
        phone: "",
        is_superuser: false,
        profile_image: null,
        date_joined: null,
        doctor_onboarding_completed: completed,
      },
    },
  };
}

function renderFlow(initialPath = "/doctor/onboarding") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/doctor/onboarding" element={<DoctorOnboardingScreen />} />
        <Route path="/doctor/dashboard" element={<div>Doctor dashboard</div>} />
        <Route path="/doctor/personal" element={<div>Full card editor</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function stepButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".onboarding__step-btn"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.push.probed = true;
  mocks.push.message = "";
  mocks.push.error = null;
  mocks.push.actionLabel = null;
  mocks.push.steps = null;
  mocks.push.loading = false;
  mocks.push.subscribe.mockResolvedValue(true);
  mocks.getMyDoctorProfile.mockResolvedValue({ success: true, message: "", data: profile });
  mocks.listSpecialties.mockResolvedValue(specialtyList());
});

describe("doctor onboarding — resume", () => {
  it("opens on the first step the server still reports as outstanding", async () => {
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ location: true, profile_image: true, doctor_profile: true })
    );

    renderFlow();

    expect(
      await screen.findByRole("heading", { name: /turn on notifications/i })
    ).toBeInTheDocument();
    const steps = stepButtons();
    expect(steps).toHaveLength(5);
    // Nothing may be clicked ahead of the outstanding step.
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toBeDisabled();
    expect(steps[4]).toBeDisabled();
    expect(steps[0].querySelector(".onboarding__marker--current")).not.toBeNull();
    expect(steps[1].querySelector(".onboarding__marker--done")).not.toBeNull();
    expect(steps[2].querySelector(".onboarding__marker--done")).not.toBeNull();
    expect(steps[3].querySelector(".onboarding__marker--done")).not.toBeNull();
    expect(steps[4].querySelector(".onboarding__marker--pending")).not.toBeNull();
  });

  it("starts at the location step when only the practice location is missing", async () => {
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ notifications: true, profile_image: true, doctor_profile: true })
    );

    renderFlow();

    expect(
      await screen.findByRole("heading", { name: /set your practice location/i })
    ).toBeInTheDocument();
    expect(stepButtons()[1]).toHaveAttribute("aria-current", "step");
    // Mandatory step: it hands the doctor off to the full location form
    // through a redirect control, and nothing in the flow can skip it.
    expect(screen.getByRole("link", { name: /location form/i })).toHaveAttribute(
      "href",
      "/doctor/personal"
    );
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
  });

  it("jumps straight to the final step when every requirement already holds", async () => {
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ notifications: true, location: true, profile_image: true, doctor_profile: true })
    );

    renderFlow();

    expect(await screen.findByRole("button", { name: /finish setup/i })).toBeInTheDocument();
    expect(stepButtons()[4]).toHaveAttribute("aria-current", "step");
    expect(stepButtons().every((button) => !button.disabled)).toBe(true);
  });

  it("confirms a completed account and leaves the flow", async () => {
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ notifications: true, location: true, profile_image: true, doctor_profile: true }, true)
    );

    renderFlow();

    expect(await screen.findByText("Doctor dashboard")).toBeInTheDocument();
  });
});

describe("doctor onboarding — notifications step", () => {
  it("registers the device through the existing push flow, then re-reads the server", async () => {
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ location: true, profile_image: true, doctor_profile: true })
    );
    mocks.push.actionLabel = "Allow";
    mocks.push.message = "Enable notifications for appointment reminders";

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
    await waitFor(() => expect(mocks.push.subscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDoctorOnboarding).toHaveBeenCalledTimes(2));
    // Nothing to click past: the flow waits on the server's answer.
    expect(stepButtons()[0]).toHaveAttribute("aria-current", "step");
  });
});

describe("doctor onboarding — completion", () => {
  it("keeps the doctor in the flow and names the step the server refused", async () => {
    const allDone = status({
      notifications: true,
      location: true,
      profile_image: true,
      doctor_profile: true,
    });
    const stillMissingLocation = status({
      notifications: true,
      profile_image: true,
      doctor_profile: true,
    });
    mocks.getDoctorOnboarding
      .mockResolvedValueOnce(allDone)
      .mockResolvedValueOnce(stillMissingLocation);
    mocks.completeDoctorOnboarding.mockRejectedValue(
      new ApiError("Set your practice location before finishing setup.", 400, {
        location: ["Set your practice location before finishing setup."],
      })
    );

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: /finish setup/i }));

    // The reload reports location missing again → the flow is back on it.
    expect(await screen.findByRole("heading", { name: /set your practice location/i })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Set your practice location before finishing setup."
    );
    expect(
      mocks.setUser.mock.calls.some(
        ([next]) => (next as { doctor_onboarding_completed?: boolean }).doctor_onboarding_completed === true
      )
    ).toBe(false);
    expect(screen.queryByText("Doctor dashboard")).not.toBeInTheDocument();
  });

  it("marks the session complete and routes to the dashboard", async () => {
    const done = status(
      { notifications: true, location: true, profile_image: true, doctor_profile: true },
      true
    );
    mocks.getDoctorOnboarding.mockResolvedValue(
      status({ notifications: true, location: true, profile_image: true, doctor_profile: true })
    );
    mocks.completeDoctorOnboarding.mockResolvedValue(done);

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: /finish setup/i }));

    expect(await screen.findByText("Doctor dashboard")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ doctor_onboarding_completed: true })
      )
    );
    expect(mocks.notify).toHaveBeenCalledWith("success", expect.any(String));
  });
});
