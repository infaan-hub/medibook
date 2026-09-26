import type { NextConfig } from "next";

// MediBook backend configuration.
//
// trailingSlash: true – the protected React frontend (and the Django API it
// replaced) addresses every endpoint with a trailing slash (/api/doctors/),
// matching Django's URL style. Keeping the canonical form slash-terminated
// means frontend calls match route handlers directly, exactly like Django.
const nextConfig: NextConfig = {
  trailingSlash: true,
  // Uploaded media is served at runtime from the uploads/ directory through
  // app/media/[...path]/route.ts (Next's build-time public/ snapshot would not
  // see files uploaded after a build).
  
  // Enable static file caching with proper headers
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      // Ensure WebSocket upgrade requests work (when hosted on compatible platform)
      {
        source: '/ws/notifications/:path*',
        headers: [
          { key: 'Upgrade', value: 'websocket' },
          { key: 'Connection', value: 'upgrade' },
        ],
      },
    ];
  },
  
  // Enable chunk retry on failure (helps with ChunkLoadError)
  experimental: {
    // chunkRetry: available in Next.js 14+
  },
  
  // Ensure proper output for standalone deployment
  output: 'standalone',
};

export default nextConfig;
