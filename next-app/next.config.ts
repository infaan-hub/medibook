import type { NextConfig } from "next";

// MediBook backend configuration.
//
// trailingSlash: true – the protected React frontend (and the Django API it
// replaced) addresses every endpoint with a trailing slash (/api/doctors/),
// matching Django's URL style. Keeping the canonical form slash-terminated
// means frontend calls match route handlers directly, exactly like Django.
const nextConfig: NextConfig = {
  trailingSlash: true,
  // Card thumbnails are rendered through next/image so the browser downloads a
  // srcset candidate sized to the card instead of one fixed 500px file.
  //
  // No `images.remotePatterns`: a doctor photo is ONLY their own uploaded file
  // (/media/{id}, same origin, allowed by default). There is no external
  // portrait CDN to allowlist any more — the cards show "No image" instead of
  // borrowing a stock face, so the optimizer can never fetch a third-party host.
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

  // web-push pulls in https-proxy-agent → agent-base, whose `require('http')`
  // makes the DEV webpack compile of instrumentation.ts fail with
  // "Module not found: Can't resolve 'http'", which 500'd every dev request.
  // Keeping it external means it is loaded from node_modules at runtime.
  serverExternalPackages: ['web-push'],
};

export default nextConfig;
