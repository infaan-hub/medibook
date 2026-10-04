/**
 * Doctor directory filtering — the availability badge on /doctors.
 *
 * The list used to hard-code `is_available: true`, which meant:
 *   - every card could only ever read "Available", so the badge was meaningless;
 *   - a suspended doctor vanished from the admin table with no way back;
 *   - their profile detail 404'd, so a card could never have linked anywhere.
 *
 * These cover the contract the UI now relies on: list everyone, label them,
 * and only filter when a caller explicitly asks for one side.
 */
import { describe, expect, it } from "vitest";
import { doctorListWhere } from "@/repositories/doctors.repo";

describe("doctorListWhere", () => {
  it("does not force is_available, so suspended doctors stay in the directory", () => {
    expect(doctorListWhere({}).is_available).toBeUndefined();
  });

  it("filters on demand when a caller wants one side of the split", () => {
    expect(doctorListWhere({ isAvailable: true }).is_available).toBe(true);
    expect(doctorListWhere({ isAvailable: false }).is_available).toBe(false);
  });

  it("keeps the name search and min-rating filters", () => {
    const where = doctorListWhere({ search: "kimaro", minRating: "4" });
    expect(where.AND).toHaveLength(1);
    expect(where.average_rating).toEqual({ gte: 4 });
  });

  it("adds a bounding box only when an origin is supplied", () => {
    const boxes = (filters: Parameters<typeof doctorListWhere>[0]) =>
      ((doctorListWhere(filters).AND ?? []) as Array<Record<string, unknown>>);

    expect(boxes({ search: "kim" })).toHaveLength(1);
    expect(boxes({})).toHaveLength(0);
    expect(boxes({ latitude: -6.16, longitude: 39.29 })).toHaveLength(1);
    expect(boxes({ latitude: -6.16, longitude: 39.29 })[0]).toHaveProperty("latitude");
  });
});
