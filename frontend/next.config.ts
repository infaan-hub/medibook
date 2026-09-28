import type { NextConfig } from "next";

// MediBook frontend (Next.js). UI-only app: /api/* and /media/* are proxied
// to the backend (next-app on :8000) via app/api and app/media route handlers
// so paths stay same-origin — equivalent to the old Vite proxy.
const nextConfig: NextConfig = {
  // Backend is trailing-slash canonical (same as the old Vite proxy).
  skipTrailingSlashRedirect: true,
  // Card thumbnails are rendered through next/image so the browser downloads a
  // srcset candidate sized to the card instead of one fixed 500px file.
  // Uploaded photos (/media/{id}) are same-origin and need no allowlist entry.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
