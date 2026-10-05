/**
 * Realtime transport core — one implementation shared by:
 *
 *   - server.js (CommonJS custom server: WebSocket + SSE on the same process)
 *   - app/ws/notifications/[...path]/route.ts (SSE fallback when server.js is
 *     not running, e.g. Vercel / `next start`)
 *
 * Both register their sinks on the same globalThis hub, so `lib/realtime.ts`
 * (`pushEvent`) reaches WebSocket sockets and SSE streams regardless of which
 * entry point served the request. Loaded as CommonJS so `require()` works in
 * server.js and webpack/turbopack can still bundle it for the route handler.
 */

/** Keepalive cadence for SSE streams (WS clients ping on their own cadence). */
const HEARTBEAT_MS = 25000;

/**
 * Serialize an event into a versioned envelope frame
 * (id/type/timestamp/version/entity_id/payload). Payloads that already are an
 * envelope (produced by lib/realtime.ts buildEnvelope) pass through untouched
 * so their id/version survive dedup + stale-drop on the client.
 */
function toFrame(event, payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.id !== undefined &&
    payload.type &&
    payload.timestamp &&
    payload.payload !== undefined
  ) {
    return JSON.stringify({ ...payload, event: payload.type });
  }
  return JSON.stringify({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type: event,
    event,
    timestamp: new Date().toISOString(),
    version: Date.now(),
    entity_id: String((payload && payload.id) || ""),
    payload: payload ?? {},
  });
}

function safeSend(sink, frame) {
  try {
    if (sink.isOpen && sink.isOpen() === false) return;
    sink.send(frame);
  } catch {
    /* one broken sink must not break fan-out */
  }
}

/**
 * In-process fan-out registry. Sinks are added AFTER authentication:
 *   { userId: number, send(frame: string): void, isOpen?(): boolean }
 */
function createHub() {
  const sinks = new Set();

  return {
    add(sink) {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
    remove(sink) {
      sinks.delete(sink);
    },
    /** Send a frame to every open sink of the given user ids. */
    send(userIds, event, payload) {
      const targets = new Set(
        [...(userIds || [])].map(Number).filter((id) => Number.isInteger(id))
      );
      if (targets.size === 0) return;
      const frame = toFrame(event, payload);
      for (const sink of sinks) {
        if (sink.userId != null && targets.has(sink.userId)) safeSend(sink, frame);
      }
    },
    /** Fan-out to every authenticated sink (availability etc.). */
    broadcastAll(event, payload) {
      const frame = toFrame(event, payload);
      for (const sink of sinks) {
        if (sink.userId != null) safeSend(sink, frame);
      }
    },
    connectedUsers() {
      return sinks.size;
    },
  };
}

/** The process-wide hub (server.js installs it first; the SSE route creates one when server.js is absent). */
function getHub() {
  const scope = globalThis;
  if (!scope.__medibook_realtime) scope.__medibook_realtime = createHub();
  return scope.__medibook_realtime;
}

/**
 * Attach an authenticated SSE stream to the hub.
 *
 * `io` is the transport adapter (Node res in server.js, ReadableStream
 * controller in the route handler): write(text), end(), isOpen().
 * Returns a stop() that clears the heartbeat and detaches the sink.
 */
function startSse(userId, io) {
  const hub = getHub();
  let stopped = false;

  const detach = hub.add({
    userId,
    kind: "sse",
    send: (frame) => io.write(`data: ${frame}\n\n`),
    isOpen: () => (io.isOpen ? io.isOpen() : true),
  });

  io.write(
    `data: ${JSON.stringify({ event: "connected", payload: { user_id: userId } })}\n\n`
  );

  const heartbeat = setInterval(() => {
    if (!io.isOpen || io.isOpen()) {
      io.write(`data: ${JSON.stringify({ event: "pong", payload: {} })}\n\n`);
    } else {
      stop();
    }
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    detach();
  }

  return stop;
}

module.exports = { HEARTBEAT_MS, toFrame, createHub, getHub, startSse };
