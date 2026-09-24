import type { NextRequest } from "next/server";

/** Same-origin proxy for /media/* → backend uploads (next-app :8000). */
const API_PROXY_TARGET = process.env.INTERNAL_API_TARGET ?? "http://127.0.0.1:8000";

async function proxy(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const target = `${API_PROXY_TARGET}${url.pathname}${url.search}`;

  try {
    const upstream = await fetch(target, { redirect: "manual", cache: "no-store" });
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
