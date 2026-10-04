import type { NextConfig } from "next";

// MediBook frontend (Next.js). Full-stack app: the UI and the API live here.
// app/api/** are the real route handlers (not proxies) and app/media/** serves
// uploaded files, so every path stays same-origin.
const nextConfig: NextConfig = {
  // Backend is trailing-slash canonical (same as the old Vite proxy).
  skipTrailingSlashRedirect: true,
  // Card thumbnails are rendered through next/image so the browser downloads a
  // srcset candidate sized to the card instead of one fixed 500px file.
  //
  // No `images.remotePatterns`: a doctor photo is ONLY their own uploaded file
  // (/media/{id}, same origin, allowed by default). There is no external
  // portrait CDN to allowlist any more — the cards show "No image" instead of
  // borrowing a stock face, so the optimizer can never fetch a third-party host.

  // ── PDF reports (§34) ──────────────────────────────────────────────────────
  // pdfkit loads its own data files from disk at runtime, relative to its real
  // module directory:
  //   * the built-in `.afm` font metrics (fallback faces), and
  //   * `data/sRGB_IEC61966_2_1.icc`, read by `_addColorOutputIntent()` while the
  //     embedded Inter faces are subset at `doc.end()`.
  //
  // Webpack inlines pdfkit into the report route chunks, which rewrites
  // `__dirname` to point into `.next/server/**` — a directory with no `data/`.
  // Every /api/reports/* request then threw ENOENT mid-render and surfaced to
  // the client as a bare 500 "Internal server error." (JSON routes were fine,
  // so the fault was specific to the PDF layer, not to the database.)
  //
  // Keeping pdfkit external leaves it in `node_modules/pdfkit/js/`, so its real
  // `__dirname` resolves again, and the tracing include below guarantees the
  // non-imported data files are uploaded with the serverless function.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/reports/**": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
