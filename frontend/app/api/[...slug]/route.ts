import type { NextRequest } from "next/server";

/**
 * Same-origin proxy for /api/* → backend (next-app :8000).
 * Uses a route handler (not rewrites) so the exact path — including the
 * trailing slash the backend treats as canonical — is preserved.
 */
const API_PROXY_TARGET = process.env.INTERNAL_API_TARGET ?? "http://127.0.0.1:8000";

async function proxy(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const target = `${API_PROXY_TARGET}${url.pathname}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "host" || k === "connection" || k === "content-length" || k === "accept-encoding") {
      return;
    }
    headers.append(key, value);
  });

  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });

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
    return Response.json(
      { success: false, error: "API proxy cannot reach the backend. Is next-app running on :8000?" },
      { status: 502 }
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
