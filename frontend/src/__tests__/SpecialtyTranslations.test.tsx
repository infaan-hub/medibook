import { describe, expect, it } from "vitest";
import { localizeSpecialty, specialtyLabel } from "../lib/specialty-translations";

describe("specialty translations", () => {
  const specialty = {
    id: 6,
    name: "Family Medicine",
    patient_friendly_name: "Whole-family care",
    description: "Continuing care for every family member, from children to older adults.",
    what_to_expect: "Check-ups, chronic disease follow-up, and prevention advice.",
  };

  it("returns the original in English", () => {
    expect(localizeSpecialty(specialty, "en")).toEqual(specialty);
  });

  it("translates to German", () => {
    const de = localizeSpecialty(specialty, "de");
    expect(de.patient_friendly_name).toBe("Betreuung der ganzen Familie");
    expect(de.name).toBe("Familienmedizin");
  });

  it("translates to Swahili", () => {
    const sw = localizeSpecialty(specialty, "sw");
    expect(sw.patient_friendly_name).toBe("Huduma ya familia nzima");
  });

  it("falls back for an unknown specialty", () => {
    const unknown = { ...specialty, name: "Unknown Specialty" };
    expect(localizeSpecialty(unknown, "de")).toEqual(unknown);
  });

  it("specialtyLabel returns translated friendly name", () => {
    expect(specialtyLabel(specialty, "es")).toBe("Atención para toda la familia");
  });
});
