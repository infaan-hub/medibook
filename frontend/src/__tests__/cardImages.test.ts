/**
 * Card image loading guards.
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

const indexScreen = readFileSync(resolve(__dirname, "../screens/index.tsx"), "utf8");
const doctorScreen = readFileSync(resolve(__dirname, "../screens/doctor.tsx"), "utf8");
const nextConfig = readFileSync(resolve(__dirname, "../../next.config.ts"), "utf8");

describe("doctor card thumbnails", () => {
  it("routes every card photo through next/image, not a bare <img>", () => {
    expect(indexScreen).not.toMatch(/<img[^>]*doctorCardImage/);
    expect(indexScreen.match(/<Image\b/g) ?? []).toHaveLength(2);
    expect(doctorScreen).not.toMatch(/<img/);
    expect(doctorScreen.match(/<Image\b/g) ?? []).toHaveLength(2);
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
});

describe("image optimizer configuration", () => {
  it("allowlists the stock portrait CDN the cards fall back to", () => {
    expect(nextConfig).toMatch(/images:/);
    expect(nextConfig).toMatch(/images\.unsplash\.com/);
  });
});
