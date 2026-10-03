/**
 * Doctor photo guards — a card may only show a picture the doctor uploaded.
 *
 * Regression: cards fell back to a rotating list of stock portraits (and, for
 * the doctor's own preview, the splash artwork) whenever `profile_image` was
 * empty — so two different doctors could wear the same face, and a doctor who
 * had never uploaded a photo still looked "complete". Every photo now goes
 * through `DoctorImage`, which accepts only this app's own `/media/{id}` URLs
 * and renders a "No image" state for everything else (missing value, external
 * host, failed load).
 *
 * `/media/{id}` must stay trailing-slash canonical: the API answers a 308
 * without the slash, a browser follows that hop but the optimizer does not —
 * it would get no image bytes and answer 400.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexScreen = readFileSync(resolve(__dirname, "../screens/index.tsx"), "utf8");
const doctorScreen = readFileSync(resolve(__dirname, "../screens/doctor.tsx"), "utf8");
const doctorImage = readFileSync(resolve(__dirname, "../components/DoctorImage.tsx"), "utf8");
const nextConfig = readFileSync(resolve(__dirname, "../../next.config.ts"), "utf8");

describe("doctor card thumbnails", () => {
  it("routes every card photo through DoctorImage, never a bare <img>", () => {
    expect(indexScreen).not.toMatch(/<img[^>]*doctorCardImage/);
    expect(indexScreen.match(/<DoctorImage\b/g) ?? []).toHaveLength(2);
    expect(doctorScreen).not.toMatch(/<img/);
    expect(doctorScreen.match(/<DoctorImage\b/g) ?? []).toHaveLength(2);
  });

  it("gives each grid its own srcset size hint", () => {
    expect(indexScreen).toMatch(/sizes="40vw"/); // home: two columns
    expect(indexScreen).toMatch(/sizes="25vw"/); // directory: four up
    expect(doctorScreen).toMatch(/sizes="320px"/); // profile photo box
    expect(doctorScreen).toMatch(/sizes="380px"/); // card preview box
  });

  it("eager-loads only the first above-the-fold card", () => {
    expect(indexScreen).toMatch(/priority=\{index === 0\}/);
  });

  it("carries no stock/remote portrait list and no artwork fallback", () => {
    expect(indexScreen).not.toMatch(/unsplash/i);
    expect(indexScreen).not.toMatch(/dashboardDoctorImages/);
    expect(indexScreen).not.toMatch(/https?:\/\/[^"'\s]*photo-/);
    expect(doctorScreen).not.toMatch(/splash-screen\.jpeg/);
    expect(doctorScreen).not.toMatch(/unsplash/i);
  });
});

describe("the DoctorImage gate", () => {
  it("accepts only this app's own /media/ URLs", () => {
    expect(doctorImage).toMatch(/OWN_MEDIA_PATH/);
    expect(doctorImage).toMatch(/url\.host !== window\.location\.host/);
    expect(doctorImage).not.toMatch(/https?:\/\/[^"'\s]*unsplash/);
  });

  it("renders an honest No image state instead of a substitute photo", () => {
    expect(doctorImage).toMatch(/NO_IMAGE_LABEL = "No image"/);
    // A load failure (deleted media object, blocked optimizer) must fall back
    // to the same state rather than a broken-image icon.
    expect(doctorImage).toMatch(/onError=/);
  });
});

describe("image optimizer configuration", () => {
  it("allowlists no external image host — only same-origin media exists", () => {
    expect(nextConfig).not.toMatch(/images\.unsplash\.com/);
    // No `images:` block at all: no remotePatterns, no loader, nothing that
    // would let the optimizer fetch a third-party host.
    expect(nextConfig).not.toMatch(/\n\s*images\s*:/);
  });
});
