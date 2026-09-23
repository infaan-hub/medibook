import type { NextConfig } from "next";

// MediBook backend configuration.
//
// trailingSlash: true — the protected React frontend (and the Django API it
// replaced) addresses every endpoint with a trailing slash (/api/doctors/),
// matching Django's URL style. Keeping the canonical form slash-terminated
// means frontend calls match route handlers directly, exactly like Django.
const nextConfig: NextConfig = {
  trailingSlash: true,
  // Uploaded media is served at runtime from the uploads/ directory through
  // app/media/[...path]/route.ts (Next's build-time public/ snapshot would not
  // see files uploaded after a build).
};

export default nextConfig;
