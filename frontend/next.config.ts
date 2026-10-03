import type { NextConfig } from "next";

// MediBook frontend (Next.js). UI-only app: /api/* and /media/* are proxied
// to the backend (next-app on :8000) via app/api and app/media route handlers
// so paths stay same-origin — equivalent to the old Vite proxy.
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
};

export default nextConfig;
