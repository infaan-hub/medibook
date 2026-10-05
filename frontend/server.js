/**
 * MediBook custom server — Next.js HTTP + native WebSocket realtime + SSE.
 *
 * One process serves the whole product:
 *
 *   server.js
 *      ├── Next.js App Router frontend (PWA shell, /manifest.json, service worker)
 *      ├── /api/**           route handlers (auth, doctors, patients, appointments,
 *      │                     emergency, notifications, web push, reports/PDF, admin)
 *      ├── /media/**         uploaded file delivery
 *      ├── Prisma            Neon PostgreSQL (single shared client)
 *      ├── /ws/notifications/      WebSocket (frames {event, payload}, ping→pong,
 *      │                           close 4001 on rejected access token)
 *      └── /ws/notifications/sse/  Server-Sent Events fallback (same protocol,
 *                                  served through lib/realtime-hub.js so both
 *                                  transports share one fan-out registry)
 *
 * Dev:  npm run dev                     (node server.js → next({ dev: true }))
 * Prod: npm run build && npm start      (node server.js production)
 *
 * Default port 3000 (override with PORT). When server.js is NOT running
 * (Vercel / `next start`), app/ws/notifications/[...path]/route.ts still
 * serves the SSE endpoint so the client never gets an HTML 404 page.
 */
const { createServer } = require("node:http");
const { parse } = require("node:url");
const crypto = require("node:crypto");
const next = require("next");
const { WebSocketServer } = require("ws");
const { loadEnvConfig } = require("@next/env");
const { getHub, startSse, HEARTBEAT_MS } = require("./lib/realtime-hub");

const dev = process.argv[2] !== "production";
const port = Number(process.env.PORT || 3000);
/** Set DEBUG_REALTIME=1 to log the WS/SSE handshake (never logs tokens). */
const debugRealtime = process.env.DEBUG_REALTIME === "1";

// Load frontend/.env into process.env before anything reads it.
loadEnvConfig(__dirname, dev);

const app = next({ dev });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Shared singletons between the custom server and the Next.js runtime
// (both live in this one Node process — lib/db.ts and lib/realtime.ts pick
// these up through globalThis).
// ---------------------------------------------------------------------------
const { PrismaClient } = require("@prisma/client");
const prisma = globalThis.__medibook_prisma || new PrismaClient();
globalThis.__medibook_prisma = prisma;

/** Fan-out registry for WS sockets + SSE streams (see lib/realtime-hub.js). */
const hub = getHub();

/**
 * Compact audit row for realtime activity (connect/reject/disconnect) —
 * same AuditEvent table the HTTP audit trail writes to. Never throws.
 */
function recordRealtimeAudit(actorId, detail) {
  try {
    prisma.auditEvent
      .create({
        data: {
          actor_id: actorId,
          action: "realtime.connect",
          target: "/ws/notifications/",
          detail,
        },
      })
      .catch(() => {});
  } catch {
    /* audit must never break the connection */
  }
}

function b64urlDecode(part) {
  return Buffer.from(part, "base64url");
}

/**
 * Minimal HS256 access-token verification (same contract as lib/jwt.ts:
 * { sub, typ: "access", iat, exp } signed with AUTH_SECRET).
 * Returns the user id or null.
 */
async function userIdForToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const header = JSON.parse(b64urlDecode(h).toString("utf8"));
    if (header.alg !== "HS256") return null;
    const expected = crypto
      .createHmac("sha256", process.env.AUTH_SECRET || "")
      .update(`${h}.${p}`)
      .digest();
    const given = b64urlDecode(s);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      return null;
    }
    const payload = JSON.parse(b64urlDecode(p).toString("utf8"));
    if (payload.typ !== "access") return null;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    const userId = Number(payload.sub);
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

// ---------------------------------------------------------------------------
// SSE transport (same core as app/ws/notifications/[...path]/route.ts)
// ---------------------------------------------------------------------------
function serveSse(req, res) {
  (async () => {
    const { query } = parse(req.url || "", true);
    const userId = await userIdForToken(query.token);
    if (userId === null) {
      recordRealtimeAudit(null, "HTTP 401 · SSE rejected");
      if (!res.headersSent) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("unauthorized");
      return;
    }

    recordRealtimeAudit(userId, "HTTP 200 · SSE connected");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Proxies must not buffer (or the stream looks dead to the client).
      "X-Accel-Buffering": "no",
    });
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    let closed = false;
    const io = {
      write: (chunk) => {
        if (!res.writableEnded) res.write(chunk);
      },
      end: () => {
        if (!res.writableEnded) res.end();
      },
      isOpen: () => !res.writableEnded && !res.destroyed,
    };

    const stop = startSse(userId, io);

    const onClose = () => {
      if (closed) return;
      closed = true;
      stop();
      recordRealtimeAudit(userId, "HTTP 200 · SSE disconnected");
    };
    req.on("close", onClose);
    res.on("close", onClose);
  })().catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("error");
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  await app.prepare();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    const { pathname } = parse(req.url || "");

    // SSE endpoint for realtime fallback (no WebSocket upgrade available).
    if (pathname === "/ws/notifications/sse" || pathname === "/ws/notifications/sse/") {
      serveSse(req, res);
      return;
    }

    // Everything else — pages, /api/** route handlers, /media/** — is the
    // Next.js App Router.
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  // Protocol mirrors the Django Channels consumer: frames {event, payload},
  // {"type":"ping"} answered with {event:"pong"}, close 4001 = refresh token.
  wss.on("connection", (socket, request) => {
    socket.__userId = null;
    let detach = null;
    const token = request.realtimeQuery ? request.realtimeQuery.token : null;
    const connectedAt = Date.now();
    if (debugRealtime) console.log(`[rt] ws connection · token ${token ? "present" : "missing"}`);

    userIdForToken(token)
      .then((userId) => {
        if (debugRealtime) {
          console.log(
            `[rt] ws auth → ${userId} · readyState=${socket.readyState} · ${Date.now() - connectedAt}ms`
          );
        }
        if (userId === null || socket.readyState !== 1) {
          recordRealtimeAudit(null, "WS rejected · close 4001");
          socket.close(4001, "unauthorized");
          return;
        }
        socket.__userId = userId;
        detach = hub.add({
          userId,
          kind: "ws",
          send: (frame) => socket.send(frame),
          isOpen: () => socket.readyState === 1,
        });
        recordRealtimeAudit(userId, "WS connected");
        socket.send(JSON.stringify({ event: "connected", payload: { user_id: userId } }));
        if (debugRealtime) console.log(`[rt] ws connected sent to user ${userId}`);
      })
      .catch((error) => {
        if (debugRealtime) console.log(`[rt] ws auth error → ${error && error.message}`);
        recordRealtimeAudit(null, "WS rejected · close 4001");
        if (socket.readyState === 1) socket.close(4001, "unauthorized");
      });

    socket.on("message", (raw) => {
      let content;
      try {
        content = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (content && content.type === "ping" && socket.readyState === 1) {
        socket.send(JSON.stringify({ event: "pong", payload: {} }));
      }
    });

    const onClosed = (code) => {
      if (debugRealtime) {
        console.log(
          `[rt] ws closed · userId=${socket.__userId} · ${Date.now() - connectedAt}ms${
            code === undefined ? "" : ` · code=${code}`
          }`
        );
      }
      if (detach) {
        detach();
        detach = null;
      }
      if (socket.__userId != null) {
        recordRealtimeAudit(socket.__userId, "WS disconnected");
        socket.__userId = null;
      }
    };
    socket.on("close", onClosed);
    socket.on("error", (error) => {
      if (debugRealtime) console.log(`[rt] ws error · ${error && error.message}`);
      onClosed();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname, query } = parse(request.url || "", true);
    if (pathname === "/ws/notifications" || pathname === "/ws/notifications/") {
      if (debugRealtime) console.log("[rt] upgrade · /ws/notifications/");
      socket.on("error", (error) => {
        if (debugRealtime) console.log(`[rt] upgrade socket error · ${error && error.message}`);
      });
      // Parsed query rides along to the connection handler (auth happens there).
      request.realtimeQuery = query;
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
      return;
    }
    // Everything else (e.g. Next.js dev HMR websockets) goes to Next.
    upgradeHandler(request, socket, head);
  });

  server.on("clientError", (error, socket) => {
    if (debugRealtime) {
      console.log(`[rt] clientError · ${error && error.message} · destroyed=${socket.destroyed}`);
    }
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(
        `> Port ${port} is already in use. Stop the other process or run with PORT=<other>.`
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`> MediBook listening on http://localhost:${port} (${dev ? "dev" : "production"})`);
    console.log("> API + PWA frontend ready (Next.js App Router)");
    console.log("> WebSocket ready at /ws/notifications/ · SSE fallback at /ws/notifications/sse/");
    console.log(`> SSE heartbeat every ${HEARTBEAT_MS / 1000}s`);
  });

  // Graceful shutdown: close realtime streams first so clients reconnect
  // immediately instead of waiting for TCP timeouts.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`> ${signal} received — shutting down MediBook server`);
    try {
      wss.clients.forEach((client) => {
        try {
          client.close(1001, "server shutting down");
        } catch {
          /* already gone */
        }
      });
      wss.close();
    } catch {
      /* ignore */
    }
    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    // Never hang forever on lingering keep-alive sockets.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
