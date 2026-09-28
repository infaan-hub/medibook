/**
 * Card image loading guards (next-app mirror).
 *
 * Regression: every doctor thumbnail shipped one fixed 500px q85 file, and the
 * home list loaded all of them eagerly — ~35 KB per card, no srcset, no
 * lazy-loading. Cards now render through next/image with an explicit `sizes`
 * so the browser downloads a candidate sized to the card (~16 KB at 384w) and
 * decodes it off the main thread. Measured on the same portrait: 35630 B →
 * 16392 B, and an uploaded profile photo 68587 B → 11972 B.
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
const nextConfig = readFileSync(resolve(__dirname, "../next.config.ts"), "utf8");
const serialize = readFileSync(resolve(__dirname, "../lib/serialize.ts"), "utf8");

describe("doctor card thumbnails", () => {
  it("routes every card photo through next/image, not a bare <img>", () => {
    expect(indexPage).not.toMatch(/<img[^>]*doctorCardImage/);
    expect(indexPage.match(/<Image\b/g) ?? []).toHaveLength(2);
    expect(doctorPage).not.toMatch(/<img/);
    expect(doctorPage.match(/<Image\b/g) ?? []).toHaveLength(2);
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
});

describe("image optimizer configuration", () => {
  it("allowlists the stock portrait CDN the cards fall back to", () => {
    expect(nextConfig).toMatch(/images:/);
    expect(nextConfig).toMatch(/images\.unsplash\.com/);
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
