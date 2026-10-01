/**
 * Patient home — "Top Doctors" cards on the mirrored UI (next-app/ui, the app
 * served on :8000). Same per-day chip contract as /doctors: "Available" only
 * when the API's `available_today` says the doctor has an active window today.
 *
 * Mirror of frontend/src/__tests__/HomeTopDoctors.test.tsx — keep both in sync.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import "../i18n";
import { HomeScreen } from "../pages/index";
import type { Appointment, DoctorProfile, User } from "../api/types";

const { listDoctors, listMyAppointments, listArticles } = vi.hoisted(() => ({
  listDoctors: vi.fn(),
  listMyAppointments: vi.fn(),
  listArticles: vi.fn(),
}));

vi.mock("../api/doctors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/doctors")>()),
  listDoctors,
}));
vi.mock("../api/appointments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/appointments")>()),
  listMyAppointments,
}));
vi.mock("../api/blog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/blog")>()),
  listArticles,
}));

const patient: User = {
  id: 2,
  username: "patient",
  email: "p@x.test",
  first_name: "Amani",
  last_name: "Juma",
  role: "patient",
  phone: "",
  is_superuser: false,
  profile_image: null,
  date_joined: null,
};

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({ user: patient }),
}));

/** §28 envelope — the home screen reads `data.results` off every list call. */
function envelope<T>(results: T[]) {
  return {
    success: true,
    message: "",
    data: { count: results.length, page: 1, page_size: 100, total_pages: 1, next: null, previous: null, results },
  };
}

function doctor(overrides: Record<string, unknown> = {}): DoctorProfile {
  return {
    id: 4,
    email: "neema@clinic.tz",
    first_name: "Neema",
    last_name: "Kimaro",
    phone: "+255712000111",
    phone_secondary: "",
    profile_image: null,
    specialties: [],
    qualifications: "",
    experience_years: 8,
    consultation_fee: "20000.00",
    bio: "",
    latitude: -6.162,
    longitude: 39.298,
    location_accuracy: 12,
    location_captured_at: null,
    has_location: true,
    distance_km: null,
    is_available: true,
    available_today: true,
    average_rating: "4.50",
    total_reviews: 12,
    ...overrides,
  } as unknown as DoctorProfile;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMyAppointments.mockResolvedValue(envelope([]));
  listArticles.mockResolvedValue(envelope([]));
});

describe("patient home — Top Doctors availability chip", () => {
  it("shows Available only for a doctor with an active window today", async () => {
    listDoctors.mockResolvedValue(
      envelope([doctor({ id: 4, first_name: "Neema", last_name: "Kimaro", available_today: true })]),
    );

    const { container } = renderHome();

    expect(await screen.findByText("Dr. Neema Kimaro")).toBeInTheDocument();
    const chip = container.querySelector(".home__doctor-status");
    expect(chip).toHaveTextContent("Available");
    expect(chip?.className).not.toContain("home__doctor-status--off");
    expect(listDoctors).toHaveBeenCalledTimes(1);
  });

  it("shows Not available when today's day is not set on the schedule", async () => {
    // Healthy account, but no active window on today's weekday → unavailable.
    listDoctors.mockResolvedValue(
      envelope([
        doctor({ id: 13, first_name: "Zawadi", last_name: "Juma", is_available: true, available_today: false }),
      ]),
    );

    const { container } = renderHome();

    expect(await screen.findByText("Dr. Zawadi Juma")).toBeInTheDocument();
    const chip = container.querySelector(".home__doctor-status");
    expect(chip).toHaveTextContent("Not available");
    expect(chip?.className).toContain("home__doctor-status--off");
  });

  it("reads Available and Not available side by side in Top Doctors", async () => {
    listDoctors.mockResolvedValue(
      envelope([
        doctor({ id: 4, available_today: true }),
        doctor({ id: 13, first_name: "Zawadi", last_name: "Juma", available_today: false }),
      ]),
    );

    const { container } = renderHome();

    expect(await screen.findByText("Dr. Neema Kimaro")).toBeInTheDocument();
    const chips = within(container.querySelector(".home__doctor-list") as HTMLElement)
      .getAllByText(/^(Available|Not available)$/)
      .map((node) => node.textContent);
    expect(chips).toEqual(["Available", "Not available"]);
  });

  it("marks a suspended doctor Not available even with a window today", async () => {
    listDoctors.mockResolvedValue(
      envelope([
        doctor({ id: 9, first_name: "John", last_name: "Mrema", is_available: false, available_today: false }),
      ]),
    );

    const { container } = renderHome();

    expect(await screen.findByText("Dr. John Mrema")).toBeInTheDocument();
    const chip = container.querySelector(".home__doctor-status");
    expect(chip).toHaveTextContent("Not available");
    // The card still links to the profile — no dead card.
    expect(screen.getByRole("link", { name: /dr\. john mrema/i })).toHaveAttribute("href", "/doctors/9");
  });
});

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    patient: 2,
    patient_email: "p@x.test",
    doctor: 4,
    hospital: null,
    appointment_date: "2026-10-05",
    start_time: "09:00:00",
    end_time: "09:30:00",
    status: "pending",
    appointment_type: "NORMAL",
    reason: "",
    notes: "",
    cancel_reason: "",
    ...overrides,
  };
}

describe("patient home — upcoming appointments clarify emergencies", () => {
  it("marks an emergency request red: date box, title, badge and reason", async () => {
    listDoctors.mockResolvedValue(envelope([]));
    listMyAppointments.mockResolvedValue(
      envelope([appointment({ id: 21, appointment_type: "EMERGENCY", emergency_reason: "accident" })]),
    );

    const { container } = renderHome();

    expect(await screen.findByText("Emergency appointment")).toBeInTheDocument();
    expect(container.querySelector(".home__appointment-datebox")?.className).toContain(
      "home__appointment-datebox--emergency",
    );
    expect(container.querySelector(".home__appointment-card")?.className).toContain(
      "home__appointment-card--emergency",
    );
    expect(screen.getByText("Emergency", { selector: ".badge--emergency" })).toBeInTheDocument();
    expect(screen.getByText("Accident")).toBeInTheDocument();
    expect(screen.queryByText("Doctor appointment")).not.toBeInTheDocument();
  });

  it("keeps a normal booking on the green date box with the Doctor appointment title", async () => {
    listDoctors.mockResolvedValue(envelope([]));
    listMyAppointments.mockResolvedValue(envelope([appointment({ id: 22 })]));

    const { container } = renderHome();

    expect(await screen.findByText("Doctor appointment")).toBeInTheDocument();
    expect(container.querySelector(".home__appointment-datebox")?.className).not.toContain(
      "--emergency",
    );
    expect(screen.queryByText("Emergency", { selector: ".badge--emergency" })).not.toBeInTheDocument();
  });
});
