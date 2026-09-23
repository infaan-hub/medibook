/**
 * MediBook custom server — Next.js HTTP + native WebSocket realtime.
 *
 * Replaces the Django/Channels stack:
 *   - All HTTP (/api/**, /media/**) is handled by the Next.js App Router.
 *   - /ws/notifications/ is a first-class WebSocket endpoint speaking the exact
 *     protocol the protected React frontend expects (frames {event, payload},
 *     {"type":"ping"} keepalive answered with {event:"pong"}, close code 4001
 *     for rejected access tokens).
 *
 * Dev:   npm run dev               (node server.js → next({ dev: true }))
 * Prod:  npm run build && npm start (node server.js production)
 *
 * Default port 8000 — the protected frontend/vite.config.ts proxies /api and
 * /media to http://127.0.0.1:8000 and must not be modified.
 */
const { createServer } = require("node:http");
const { parse } = require("node:url");
const crypto = require("node:crypto");
const next = require("next");
const { WebSocketServer } = require("ws");
const { loadEnvConfig } = require("@next/env");

const dev = process.argv[2] !== "production";
const port = Number(process.env.PORT || 8000);

// Load next-app/.env into process.env before anything reads it.
loadEnvConfig(__dirname, dev);

const app = next({ dev });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Shared singletons between the custom server and the Next.js runtime
// (both live in this one Node process).
// ---------------------------------------------------------------------------
const { PrismaClient } = require("@prisma/client");
const prisma = globalThis.__medibook_prisma || new PrismaClient();
globalThis.__medibook_prisma = prisma;

/** Open sockets; broadcast helper exposed to the TypeScript runtime. */
const sockets = new Set();

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


globalThis.__medibook_realtime = {
  /** Send {"event", payload} to every open socket of the given user ids. */
  send(userIds, event, payload) {
    const targets = new Set(
      [...userIds].map(Number).filter((id) => Number.isInteger(id))
    );
    if (targets.size === 0) return;
    const frame = JSON.stringify({ event, payload });
    for (const socket of sockets) {
      if (socket.readyState === 1 && targets.has(socket.__userId)) {
        socket.send(frame);
      }
    }
  },
  connectedUsers() {
    return sockets.size;
  },
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  await app.prepare();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true });

  // Protocol mirrors backend/notifications/consumers.py (Django Channels).
  wss.on("connection", (socket, request) => {
    sockets.add(socket);
    socket.__userId = null;

    const { query } = parse(request.url || "", true);
    userIdForToken(query.token)
      .then((userId) => {
        if (userId === null || socket.readyState !== 1) {
          // Rejected: client receives close code 4001 and refreshes its token.
          socket.close(4001, "unauthorized");
          return;
        }
        socket.__userId = userId;
        socket.send(JSON.stringify({ event: "connected", payload: { user_id: userId } }));
      })
      .catch(() => socket.close(4001, "unauthorized"));

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

    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");
    if (pathname === "/ws/notifications" || pathname === "/ws/notifications/") {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
      return;
    }
    // Everything else (e.g. Next.js dev HMR websockets) goes to Next.
    upgradeHandler(request, socket, head);
  });

  server.listen(port, () => {
    console.log(
      `> MediBook backend listening on http://localhost:${port} (${dev ? "dev" : "production"})`
    );
    console.log("> WebSocket realtime ready at /ws/notifications/");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
