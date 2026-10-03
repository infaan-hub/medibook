/**
 * /doctors directory cards — availability replaces the rating stars.
 *
 *  1. The card no longer shows rating stars; it shows a plain
 *     "Available" / "Not available" chip, so a patient knows whether they can
 *     book before they open the profile.
 *  2. Suspended doctors are still listed (the API used to filter them out,
 *     which made the chip impossible and left admin unable to approve them).
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DoctorsPage } from "../screens/index";
import type { DoctorProfile } from "../api/types";

const { listDoctors } = vi.hoisted(() => ({ listDoctors: vi.fn() }));

// Only listDoctors is stubbed — the rest of the module is imported by the
// screens index's re-exports, so the mock has to describe the whole surface.
vi.mock("../api/doctors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/doctors")>()),
  listDoctors,
}));

// The directory renders for visitors too: no session, no boot fetch.
vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({ user: null }),
}));

/** §28 envelope wrapping the paginated payload from common/pagination.py. */
function envelope(results: DoctorProfile[]) {
  return {
    success: true,
    message: "",
    data: {
      count: results.length,
      page: 1,
      page_size: 100,
      total_pages: 1,
      next: null,
      previous: null,
      results,
    },
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

function renderDirectory() {
  return render(
    <MemoryRouter>
      <DoctorsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DoctorsPage cards", () => {
  it("replaces the rating stars with an availability chip", async () => {
    listDoctors.mockResolvedValue(envelope([doctor()]));

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. Neema Kimaro")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(container.querySelector(".home__doctor-status")).not.toBeNull();
    expect(container.querySelector(".home__doctor-rating")).toBeNull();
    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
    expect(listDoctors).toHaveBeenCalledTimes(1);
  });

  it("labels a suspended doctor Not available on the card itself", async () => {
    listDoctors.mockResolvedValue(
      envelope([
        doctor({
          id: 9,
          first_name: "John",
          last_name: "Mrema",
          is_available: false,
          available_today: false,
        }),
      ])
    );

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. John Mrema")).toBeInTheDocument();
    const chip = container.querySelector(".home__doctor-status");
    expect(chip).toHaveTextContent("Not available");
    expect(chip?.className).toContain("home__doctor-status--off");
    // The profile is still reachable — no dead card.
    expect(screen.getByRole("link", { name: /dr\. john mrema/i })).toHaveAttribute(
      "href",
      "/doctors/9"
    );
  });

  it("lists available and suspended doctors side by side", async () => {
    listDoctors.mockResolvedValue(
      envelope([
        doctor(),
        doctor({
          id: 11,
          first_name: "Ada",
          last_name: "Lovelace",
          is_available: false,
          available_today: false,
        }),
      ])
    );

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. Neema Kimaro")).toBeInTheDocument();
    expect(screen.getByText("Dr. Ada Lovelace")).toBeInTheDocument();
    const chips = within(container.querySelector(".home__doctor-list") as HTMLElement)
      .getAllByText(/^(Available|Not available)$/)
      .map((node) => node.textContent);
    expect(chips).toEqual(["Available", "Not available"]);
  });

  it("shows Not available when the doctor has no active window on today's weekday", async () => {
    listDoctors.mockResolvedValue(
      envelope([
        doctor({ id: 13, first_name: "Zawadi", last_name: "Juma", available_today: false }),
      ])
    );

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. Zawadi Juma")).toBeInTheDocument();
    const chip = container.querySelector(".home__doctor-status");
    expect(chip).toHaveTextContent("Not available");
    expect(chip?.className).toContain("home__doctor-status--off");
  });

  it("falls back to the account flag when the API predates available_today", async () => {
    const legacy = doctor({ id: 14, first_name: "Legacy", last_name: "Doctor" }) as unknown as Record<
      string,
      unknown
    >;
    delete legacy.available_today;
    listDoctors.mockResolvedValue(envelope([legacy as unknown as DoctorProfile]));

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. Legacy Doctor")).toBeInTheDocument();
    expect(container.querySelector(".home__doctor-status")).toHaveTextContent("Available");
  });

  it("serves the card photo through the image optimizer, sized to the card", async () => {
    listDoctors.mockResolvedValue(
      envelope([doctor({ id: 12, profile_image: "/media/123/" })])
    );

    const { container } = renderDirectory();

    expect(await screen.findByText("Dr. Neema Kimaro")).toBeInTheDocument();
    const img = container.querySelector(".home__doctor-card > img") as HTMLImageElement;
    expect(img).not.toBeNull();
    // One fixed 500px file per thumbnail becomes a srcset the browser sizes to
    // the card, and the upload is transcoded instead of served verbatim. The
    // optimizer URL may be emitted relative or with the page origin.
    expect(img.getAttribute("src")).toMatch(/^(https?:\/\/[^/]+)?\/_next\/image\?/);
    expect(decodeURIComponent(img.getAttribute("src") as string)).toContain("/media/123/");
    expect(img.getAttribute("srcset")).toBeTruthy();
    expect(img).toHaveAttribute("sizes", "25vw");
    expect(img).toHaveAttribute("loading", "lazy");
  });
});
