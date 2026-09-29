/**
 * /doctor/personal — the doctor must be able to set a practice location by
 * BOTH routes, and cannot save without one.
 *
 *   1. Type an area name → matched against the bundled Zanzibar ward list
 *      (no network, no API key) → a real coordinate pair.
 *   2. "Use my current location" → a GPS fix from `captureFix`.
 *
 * Save stays disabled until one of them has produced coordinates, because
 * `assertBookingLocation` refuses to book an appointment against a card that
 * has none — so a saved card without a location could never be used.
 *
 * Either way the preview names the ward only: raw coordinates and the GPS
 * accuracy reading are never rendered for patients or doctors.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DoctorPersonalScreen } from "../screens/doctor";
import type { DoctorProfile } from "../api/types";

const { getMyDoctorProfile, listSpecialties, updateMyDoctorProfile, captureFix } = vi.hoisted(
  () => ({
    getMyDoctorProfile: vi.fn(),
    listSpecialties: vi.fn(),
    updateMyDoctorProfile: vi.fn(),
    captureFix: vi.fn(),
  })
);

vi.mock("../api/doctors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/doctors")>()),
  getMyDoctorProfile,
  updateMyDoctorProfile,
}));

vi.mock("../api/specialties", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/specialties")>()),
  listSpecialties,
}));

vi.mock("../lib/location", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/location")>()),
  captureFix,
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({ user: null, setUser: vi.fn() }),
  useToast: () => ({ notify: vi.fn() }),
}));

/** A fresh card: no coordinates, which is the state the block exists for. */
function profile(overrides: Record<string, unknown> = {}): DoctorProfile {
  return {
    id: 4,
    email: "ada@clinic.tz",
    first_name: "Ada",
    last_name: "Lovelace",
    phone: "+255712000111",
    profile_image: null,
    specialties: [],
    experience_years: 8,
    consultation_fee: "20000.00",
    bio: "",
    latitude: null,
    longitude: null,
    location_accuracy: null,
    location_captured_at: null,
    has_location: false,
    distance_km: null,
    is_available: true,
    average_rating: null,
    total_reviews: 0,
    ...overrides,
  } as unknown as DoctorProfile;
}

function renderPersonal() {
  return render(
    <MemoryRouter>
      <DoctorPersonalScreen />
    </MemoryRouter>
  );
}

const saveButton = () => screen.getByRole("button", { name: /save changes/i });
const placeInput = () => screen.getByLabelText("Search an area");

beforeEach(() => {
  vi.clearAllMocks();
  getMyDoctorProfile.mockResolvedValue({ data: profile() });
  listSpecialties.mockResolvedValue({ data: { results: [] } });
  updateMyDoctorProfile.mockResolvedValue({ data: profile() });
});

describe("DoctorPersonalScreen location", () => {
  it("offers both methods and refuses to save until one is used", async () => {
    renderPersonal();

    expect(await screen.findByText("Dr. Ada Lovelace")).toBeInTheDocument();

    // Method 1 — typed area.
    expect(placeInput()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find/i })).toBeInTheDocument();

    // Method 2 — the device position.
    expect(
      screen.getByRole("button", { name: /use my current location/i })
    ).toBeInTheDocument();

    // Nothing set yet: Save is closed and says why.
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText(/set your practice location before saving/i)
    ).toBeInTheDocument();
    expect(updateMyDoctorProfile).not.toHaveBeenCalled();
  });

  it("turns a typed area name into a fix the doctor can see before saving", async () => {
    renderPersonal();
    await screen.findByText("Dr. Ada Lovelace");

    fireEvent.change(placeInput(), { target: { value: "Nungwi" } });
    // "Nungwi" also substring-matches neighbouring wards such as Kiuyu
    // Minungwini, so anchor on the ward the query names outright.
    const hit = await screen.findByRole("button", { name: /^nungwi/i });
    fireEvent.click(hit);

    // The preview now names the ward, so the match can be checked by eye — the
    // raw coordinates and the accuracy reading stay internal.
    expect(await screen.findByText(/Nungwi\s+—\s+on your card/)).toBeInTheDocument();
    expect(saveButton()).not.toBeDisabled();
    // Typed fixes carry no GPS accuracy reading.
    expect(screen.queryByText(/\(±/)).not.toBeInTheDocument();
    // ...and no coordinate pair is printed anywhere on the screen.
    expect(screen.queryByText(/-?\d+\.\d+,\s*-?\d+\.\d+/)).not.toBeInTheDocument();
  });

  it("says so instead of guessing when nothing matches", async () => {
    renderPersonal();
    await screen.findByText("Dr. Ada Lovelace");

    fireEvent.change(placeInput(), { target: { value: "asdfgh" } });

    expect(await screen.findByText(/no area matches/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("accepts a GPS fix and saves the coordinates it produced", async () => {
    captureFix.mockResolvedValue({ latitude: -5.734, longitude: 39.306, accuracy: 12 });
    renderPersonal();
    await screen.findByText("Dr. Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(captureFix).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Nungwi\s+—\s+on your card/)).toBeInTheDocument();
    // The card names the ward; the GPS numbers themselves never reach the screen.
    expect(screen.queryByText(/-?\d+\.\d+,\s*-?\d+\.\d+/)).not.toBeInTheDocument();
    expect(saveButton()).not.toBeDisabled();

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateMyDoctorProfile).toHaveBeenCalledTimes(1));

    const payload = updateMyDoctorProfile.mock.calls[0][0] as Record<string, number>;
    expect(payload.latitude).toBeCloseTo(-5.734);
    expect(payload.longitude).toBeCloseTo(39.306);
    expect(payload.location_accuracy).toBe(12);
  });
});
