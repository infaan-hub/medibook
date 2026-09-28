import { describe, expect, it } from "vitest";
import {
  ZANZIBAR_AREAS,
  areaMapsUrl,
  nearestAreaName,
  nearestZanzibarArea,
  searchZanzibarAreas,
} from "@/lib/zanzibar";

describe("zanzibar areas", () => {
  it("covers every ward of the five Zanzibar regions", () => {
    expect(ZANZIBAR_AREAS.length).toBe(331);
    expect(new Set(ZANZIBAR_AREAS.map((a) => a.region))).toEqual(
      new Set(["Kaskazini Unguja", "Kusini Unguja", "Mjini Magharibi", "Kaskazini Pemba", "Kusini Pemba"])
    );
    expect(ZANZIBAR_AREAS.filter((a) => a.island === "Pemba").length).toBe(121);
    expect(ZANZIBAR_AREAS.every((a) => Number.isFinite(a.latitude) && Number.isFinite(a.longitude))).toBe(true);
    // Every coordinate must sit inside the archipelago's bounding box.
    expect(ZANZIBAR_AREAS.every((a) => a.latitude > -6.6 && a.latitude < -4.8)).toBe(true);
    expect(ZANZIBAR_AREAS.every((a) => a.longitude > 39.0 && a.longitude < 39.9)).toBe(true);
  });

  it("labels well-known places correctly", () => {
    expect(nearestAreaName({ latitude: -5.7265, longitude: 39.2987 })).toBe("Nungwi");
    // Stone Town sits inside the Kiponda ward of Mjini.
    expect(nearestAreaName({ latitude: -6.1621, longitude: 39.1876 })).toBe("Kiponda");
    // Central Pemba: the town is a district, so the label is its ward.
    const chake = nearestZanzibarArea({ latitude: -5.24, longitude: 39.77 });
    expect(chake!.area.district).toBe("Chake Chake");
    expect(chake!.distanceKm).toBeLessThan(5);
  });

  it("returns the ward distance so the number can be sanity-checked", () => {
    const nearest = nearestZanzibarArea({ latitude: -5.7265, longitude: 39.2987 });
    expect(nearest).not.toBeNull();
    expect(nearest!.distanceKm).toBeLessThan(2);
  });

  it("refuses to label points outside Zanzibar", () => {
    expect(nearestAreaName({ latitude: -6.8167, longitude: 39.2833 })).toBeNull(); // Dar es Salaam
    expect(nearestAreaName({ latitude: 0, longitude: 0 })).toBeNull();
    expect(nearestAreaName({})).toBeNull();
  });

  it("builds a Google Maps link for every area", () => {
    const url = areaMapsUrl(ZANZIBAR_AREAS[0]);
    expect(url).toBe(`https://www.google.com/maps?q=${ZANZIBAR_AREAS[0].latitude},${ZANZIBAR_AREAS[0].longitude}`);
  });
});

/**
 * The typed half of the /doctor/personal location picker: a string goes in, a
 * real coordinate pair comes out — no network call, no API key, and never a
 * half-written fix.
 */
describe("searchZanzibarAreas", () => {
  it("resolves a typed area name to that ward's coordinates", () => {
    const hits = searchZanzibarAreas("Nungwi");
    expect(hits[0]).toMatchObject({
      name: "Nungwi",
      district: "Kaskazini A",
      region: "Kaskazini Unguja",
    });
    expect(hits.every((a) => Number.isFinite(a.latitude) && Number.isFinite(a.longitude))).toBe(true);
    // The ward it returns is the one the reverse lookup would pick, so the
    // two halves of the picker can never disagree about the same spot.
    expect(nearestAreaName(hits[0])).toBe("Nungwi");
  });

  it("ignores case, punctuation and surrounding spaces", () => {
    expect(searchZanzibarAreas("  NUNGWI  ")[0].name).toBe("Nungwi");
    expect(searchZanzibarAreas("nungwi, kaskazini")[0].name).toBe("Nungwi");
    expect(searchZanzibarAreas("mjini magharibi").length).toBeGreaterThan(0);
  });

  it("lands Stone Town on the ward the reverse lookup uses", () => {
    expect(searchZanzibarAreas("Stone Town")[0].name).toBe("Kiponda");
    expect(nearestAreaName({ latitude: -6.1621, longitude: 39.1876 })).toBe("Kiponda");
  });

  it("matches through apostrophes so Ng'ambwa is findable as Ngambwa", () => {
    expect(searchZanzibarAreas("Ngambwa")[0].name).toBe("Ng'ambwa");
  });

  it("prefers the district when the query names one", () => {
    const hits = searchZanzibarAreas("Chake Chake", 3);
    expect(hits).toHaveLength(3);
    expect(hits.every((a) => a.district === "Chake Chake")).toBe(true);
  });

  it("respects the result limit", () => {
    expect(searchZanzibarAreas("Unguja", 3)).toHaveLength(3);
    expect(searchZanzibarAreas("Unguja").length).toBeLessThanOrEqual(8);
  });

  it("returns nothing for junk, blanks or a query too short to be a place", () => {
    expect(searchZanzibarAreas("asdfgh")).toEqual([]);
    expect(searchZanzibarAreas("   ")).toEqual([]);
    expect(searchZanzibarAreas("a")).toEqual([]);
    expect(searchZanzibarAreas("")).toEqual([]);
  });
});
