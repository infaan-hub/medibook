import type { NextConfig } from "next";

// MediBook frontend (Next.js). UI-only app: /api/* and /media/* are proxied
// to the backend (next-app on :8000) via app/api and app/media route handlers
// so paths stay same-origin — equivalent to the old Vite proxy.
const nextConfig: NextConfig = {
  // Backend is trailing-slash canonical (same as the old Vite proxy).
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
