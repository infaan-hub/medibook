/**
 * Doctor photo guards (next-app mirror) — a card may only show a picture the
 * doctor uploaded.
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

const indexPage = readFileSync(resolve(__dirname, "../ui/pages/index.tsx"), "utf8");
const doctorPage = readFileSync(resolve(__dirname, "../ui/pages/doctor.tsx"), "utf8");
const doctorImage = readFileSync(resolve(__dirname, "../ui/components/DoctorImage.tsx"), "utf8");
const nextConfig = readFileSync(resolve(__dirname, "../next.config.ts"), "utf8");
const serialize = readFileSync(resolve(__dirname, "../lib/serialize.ts"), "utf8");

describe("doctor card thumbnails", () => {
  it("routes every card photo through DoctorImage, never a bare <img>", () => {
    expect(indexPage).not.toMatch(/<img[^>]*doctorCardImage/);
    expect(indexPage.match(/<DoctorImage\b/g) ?? []).toHaveLength(2);
    expect(doctorPage).not.toMatch(/<img/);
    expect(doctorPage.match(/<DoctorImage\b/g) ?? []).toHaveLength(2);
  });

  it("gives each grid its own srcset size hint", () => {
    expect(indexPage).toMatch(/sizes="40vw"/); // home: two columns
    expect(indexPage).toMatch(/sizes="25vw"/); // directory: four up
    expect(doctorPage).toMatch(/sizes="320px"/); // profile photo box
    expect(doctorPage).toMatch(/sizes="380px"/); // card preview box
  });

  it("eager-loads only the first above-the-fold card", () => {
    expect(indexPage).toMatch(/priority=\{index === 0\}/);
  });

  it("carries no stock/remote portrait list and no artwork fallback", () => {
    expect(indexPage).not.toMatch(/unsplash/i);
    expect(indexPage).not.toMatch(/dashboardDoctorImages/);
    expect(indexPage).not.toMatch(/https?:\/\/[^"'\s]*photo-/);
    expect(doctorPage).not.toMatch(/splash-screen\.jpeg/);
    expect(doctorPage).not.toMatch(/unsplash/i);
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

/**
 * Avatar photos are plain <img> tags (shell header avatar, nav-bar profile
 * icon, home greeting, profile hero) rather than DoctorImage, so each one
 * carries its own load-failure guard: a deleted media row or an unreachable
 * optimizer must degrade to initials / the nav icon, never a broken-image
 * glyph. Bundled asset paths (`/images/…`) are exempt — they cannot 404.
 */
const avatarHosts = [
  ["ui/components/AppShell.tsx", "../ui/components/AppShell.tsx"],
  ["ui/pages/index.tsx", "../ui/pages/index.tsx"],
  ["ui/pages/profile.tsx", "../ui/pages/profile.tsx"],
] as const;

function dynamicImgTags(source: string): string[] {
  return (source.match(/<img\b[\s\S]*?\/>/g) ?? []).filter((tag) => /src=\{/.test(tag));
}

describe("avatar photo fallbacks", () => {
  it("guards every dynamically sourced avatar with onError", () => {
    for (const [label, path] of avatarHosts) {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      const tags = dynamicImgTags(source);
      expect(tags.length, `${label} should render at least one avatar photo`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, `${label}: ${tag.slice(0, 70)}`).toMatch(/onError=/);
      }
    }
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

describe("media URLs the optimizer fetches", () => {
  it("emits the trailing slash the API is canonical for", () => {
    // Without it the optimizer receives a 308 instead of image bytes and 400s,
    // breaking every optimised profile and cover photo.
    expect(serialize).toMatch(/`\/media\/\$\{mediaId\}\/`/);
    expect(serialize).not.toMatch(/`\/media\/\$\{mediaId\}`/);
  });
});
