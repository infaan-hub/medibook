/**
 * GET /ws/notifications/sse/ — Server-Sent Events realtime fallback.
 *
 * The browser client (src/realtime/socket.ts) falls back to EventSource when a
 * WebSocket upgrade is impossible (Vercel/serverless, a proxy that blocks
 * upgrades). Without this route the request fell through to the App Router,
 * answered `200 text/html`, and EventSource aborted with
 * `MIME type ("text/html") is not "text/event-stream"`.
 *
 * When `node server.js` is running it serves this endpoint itself (same
 * process as the WebSocket hub) and this route is never reached; here the same
 * lib/realtime-hub.js core runs in-process, so `pushEvent()` from any route
 * handler fans out to the attached streams on this instance.
 */
import { prisma } from "@/lib/db";
import { verifyAccessToken } from "@/lib/jwt";
import { startSse } from "@/lib/realtime-hub";

/** Streaming responses must stay dynamic; 60s is the Vercel ceiling we rely on. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ path?: string[] }> };

/** Best-effort audit row — never throws, never blocks the stream. */
function audit(actorId: number | null, detail: string): void {
  try {
    void prisma.auditEvent
      .create({
        data: {
          actor_id: actorId,
          action: "realtime.connect",
          target: "/ws/notifications/sse/",
          detail,
        },
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Access token → active user id, or null (same contract as server.js). */
async function userIdForToken(token: string | null): Promise<number | null> {
  if (!token) return null;
  try {
    const claims = await verifyAccessToken(token);
    const userId = Number(claims.sub);
    if (!Number.isInteger(userId)) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, is_active: true },
    });
    return user && user.is_active ? user.id : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const segment = (path ?? []).filter(Boolean).join("/");
  if (segment !== "sse") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token");
  const userId = await userIdForToken(token);
  if (userId === null) {
    audit(null, "HTTP 401 · SSE rejected");
    return new Response("unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  audit(userId, "HTTP 200 · SSE connected");
  let stopped = false;
  /** Assigned as soon as startSse() returns; null until then. */
  let stopStream: (() => void) | null = null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const io = {
        write: (chunk: string) => {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            stopStream?.();
            stopped = true;
          }
        },
        end: () => {
          if (stopped) return;
          stopped = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        isOpen: () => !stopped,
      };

      stopStream = startSse(userId, io);

      const onAbort = () => {
        if (stopped) return;
        stopped = true;
        stopStream?.();
        audit(userId, "HTTP 200 · SSE disconnected");
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      if (request.signal.aborted) onAbort();
      else request.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      stopStream?.();
      audit(userId, "HTTP 200 · SSE disconnected");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
