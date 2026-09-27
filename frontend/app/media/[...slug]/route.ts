import type { NextRequest } from "next/server";

/** Same-origin proxy for /media/* → backend uploads (next-app :8000). */
const API_PROXY_TARGET =
  process.env.INTERNAL_API_TARGET ??
  (process.env.NODE_ENV === "production"
    ? "https://medibook-backend-jade.vercel.app"
    : "http://127.0.0.1:8000");

async function proxy(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const target = `${API_PROXY_TARGET}${url.pathname}${url.search}`;

  // Forward request headers (minus hop-by-hop) so the backend sees the
  // Authorization Bearer token — /media/{id} is protected and would 401
  // without it (this proxy used to drop every request header).
  const SKIP_REQUEST_HEADERS = new Set([
    "host",
    "connection",
    "content-length",
    "accept-encoding",
    "expect",
    "transfer-encoding",
    "keep-alive",
    "te",
    "trailer",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
  ]);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) return;
    headers.append(key, value);
  });

  try {
    const upstream = await fetch(target, { headers, redirect: "manual", cache: "no-store" });
    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") return;
      resHeaders.append(key, value);
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch {
    return new Response("Media proxy cannot reach the backend", { status: 502 });
  }
}

export { proxy as GET, proxy as HEAD };
