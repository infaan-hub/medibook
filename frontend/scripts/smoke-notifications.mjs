/**
 * Notification pipeline smoke — `npm run smoke:notifications`.
 *
 * Drives the REAL delivery path end to end and prints why a notification does
 * or does not reach a device:
 *
 *   config (VAPID env) → POST /api/notifications → row in Postgres
 *     → realtime fan-out on /ws/notifications/sse → web push via lib/push.ts
 *     → push-service answer (FCM/APNs) → auto-deactivation of dead subs
 *
 * Stages:
 *   0  VAPID configuration present (push disabled otherwise, silently)
 *   1  API accepts the create (201) — auth/role/shape
 *   2  Notification persisted (recipient inbox row)
 *   3  Realtime `notification.created` frame reached the recipient's SSE stream
 *   4  Push dispatch against the recipient's REAL subscriptions; the server's
 *      own `[push] ...` log lines are the diagnosis (stale VAPID key, endpoint
 *      gone, no subscription, BadJwtToken, timeout…)
 *   5  After-state: dead subscriptions deactivated, inbox row intact (cleaned up)
 *
 * Sends real pushes to real enrolled devices (same trade-off as probe:push) and
 * intentionally lets the app's own sender deactivate permanently dead rows.
 * Exit code 0 = pipeline healthy (push *diagnosis* is reported, not failed).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SMOKE_PORT || 4011);
const BASE = `http://127.0.0.1:${PORT}`;
const MARK = `[smoke ${Date.now()}]`;

const require = createRequire(`${FRONTEND}/package.json`);
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
loadEnvConfig(FRONTEND, false);

const results = [];
function stage(n, ok, label, detail = "") {
  results.push({ n, ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}  ${label}${detail ? ` — ${detail}` : ""}`);
}
function info(n, label, detail = "") {
  console.log(`INFO  ${n}  ${label}${detail ? ` — ${detail}` : ""}`);
}
const line = (c = "-") => c.repeat(64);

function mint(userId) {
  const b64 = (v) => Buffer.from(v).toString("base64url");
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64(JSON.stringify({ sub: String(userId), typ: "access", iat: now, exp: now + 1800 }));
  const s = crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

/** Minimal SSE client: collects frames, notifies waiters. */
function openSse(token) {
  const state = { frames: [], waiters: [], done: false, error: null };
  const abort = new AbortController();
  const pump = (async () => {
    try {
      const res = await fetch(`${BASE}/ws/notifications/sse?token=${encodeURIComponent(token)}`, {
        signal: abort.signal,
      });
      state.status = res.status;
      state.ct = res.headers.get("content-type") || "";
      if (res.status !== 200) {
        state.done = true;
        state.error = `HTTP ${res.status}`;
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const rawLine of chunk.split("\n")) {
            if (!rawLine.startsWith("data:")) continue;
            try {
              state.frames.push(JSON.parse(rawLine.slice(5).trim()));
            } catch {
              /* heartbeat/comment */
            }
          }
          state.waiters = state.waiters.filter((w) => !w.check());
        }
      }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.done = true;
      state.waiters.forEach((w) => w.check());
    }
  })();
  return {
    state,
    close: () => abort.abort(),
    /** Resolves with the first frame matching pred (already-buffered first). */
    waitFor(pred, ms = 6000) {
      return new Promise((resolve) => {
        const finish = (v) => {
          clearTimeout(timer);
          resolve(v);
        };
        const check = () => {
          const hit = state.frames.find(pred);
          if (hit) finish(hit);
          else if (state.done) finish(null);
          return !!hit;
        };
        const timer = setTimeout(() => finish(null), ms);
        state.waiters.push({ check });
        check();
      });
    },
    ready: () =>
      new Promise((resolve, reject) => {
        const t = setInterval(() => {
          if (state.status) {
            clearInterval(t);
            state.status === 200 ? resolve() : reject(new Error(`SSE HTTP ${state.status}`));
          } else if (state.error) {
            clearInterval(t);
            reject(new Error(state.error));
          }
        }, 100);
      }),
  };
}

// ---------------------------------------------------------------- setup
console.log(`${line("=")}\n  MEDIBOOK NOTIFICATION SMOKE\n${line("=")}`);

const vapid = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};
const missingVapid = Object.entries(vapid)
  .filter(([, v]) => !v)
  .map(([k]) => k);
stage(0, missingVapid.length === 0, "VAPID configured (else push is skipped silently)",
  missingVapid.length ? `MISSING ${missingVapid.join(", ")}` : "all three present");

const prisma = new PrismaClient();
await prisma.$connect();

const admin = await prisma.user.findFirst({
  where: { is_active: true, OR: [{ is_superuser: true }, { role: "admin" }] },
  select: { id: true },
});
if (!admin) {
  console.log("FAIL  -  no active admin user — cannot POST /api/notifications");
  process.exit(1);
}

// Pick a recipient that HAS active subscriptions (real push attempt) and one
// that has NONE (the "user has no active push subscription" branch).
const subs = await prisma.pushSubscription.findMany({
  select: { id: true, user_id: true, is_active: true, endpoint: true },
});
const activeByUser = new Map();
for (const s of subs) {
  if (!s.is_active) continue;
  activeByUser.set(s.user_id, (activeByUser.get(s.user_id) || 0) + 1);
}
const targetId = [...activeByUser.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const noSubsUser = await prisma.user.findFirst({
  where: { is_active: true, id: { notIn: [...activeByUser.keys()] } },
  select: { id: true },
});
info("-", "subscribers", `${subs.length} rows, ${[...activeByUser.values()].reduce((a, b) => a + b, 0)} active across ${activeByUser.size} user(s)`);
info("-", "targets", targetId ? `push=${targetId} (${activeByUser.get(targetId)} active subs), no-sub=${noSubsUser?.id ?? "(none)"}` : "NO user has active subscriptions");

// ---------------------------------------------------------------- boot server
const child = spawn(process.execPath, ["server.js", "production"], {
  cwd: FRONTEND,
  env: { ...process.env, PORT: String(PORT), REMINDERS_INTERVAL_MINUTES: "0", DEBUG_REALTIME: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
const logs = [];
const interesting = /\[push\]|\[rt\]|ERROR|Error|Invariant|EADDRINUSE|Could not find/;
const capture = (buf) => {
  for (const raw of String(buf).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    logs.push(raw);
    if (interesting.test(raw)) console.log(`      srv  ${raw}`);
  }
};
child.stdout.on("data", capture);
child.stderr.on("data", capture);

let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const h = await fetch(`${BASE}/api/health/`);
    if (h.ok) ready = true;
  } catch {
    /* not up yet */
  }
}
if (!ready) {
  console.log("FAIL  -  server did not become healthy — last server output:");
  logs.slice(-12).forEach((l) => console.log(`      srv  ${l}`));
  child.kill("SIGKILL");
  process.exit(1);
}
console.log(`\nserver up on ${BASE} (production)\n`);

// ---------------------------------------------------------------- stages
const adminToken = mint(admin.id);
let fail = false;

// Prefer the user WITH active subscriptions (real push attempt); fall back to
// anyone when every dead row has already been cleaned up by earlier runs.
const recipientId = targetId ?? noSubsUser?.id;

// 1) create for the recipient (this triggers the real push dispatch, awaited)
let mark = logs.length;
let sse = null;
let createdId = null;
let subStamp = new Map();
if (recipientId) {
  if (targetId) {
    const before = await prisma.pushSubscription.findMany({
      where: { user_id: targetId, is_active: true },
      select: { id: true, updated_at: true },
    });
    subStamp = new Map(before.map((s) => [s.id, s.updated_at.getTime()]));
  }

  sse = openSse(mint(recipientId));
  try {
    await sse.ready();
    const hello = await sse.waitFor((f) => f.event === "connected", 5000);
    stage(3, !!hello, "recipient SSE stream connected", hello ? `user=${hello.payload?.user_id}` : "no connected frame");
  } catch (e) {
    stage(3, false, "recipient SSE stream connected", e.message);
  }

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      recipient: recipientId,
      title: `${MARK} delivery probe`,
      message: "Notification smoke — watching the real push dispatch.",
      type: "system",
    }),
  });
  const body = await res.json().catch(() => ({}));
  createdId = body?.data?.id;
  stage(1, res.status === 201 && !!createdId, "POST /api/notifications → 201", `status=${res.status} id=${createdId ?? "?"}`);

  const frame = await sse.waitFor((f) => f.type === "notification.created", 6000);
  stage(3.1, !!frame, "realtime notification.created reached recipient", frame ? `received ${Date.now() - t0}ms after POST start` : "no frame within 6s");
} else {
  stage(1, false, "POST /api/notifications → 201", "no users in the database to notify");
}

// 2) persisted?
const row = createdId ? await prisma.notification.findUnique({ where: { id: createdId } }) : null;
stage(2, !!row && row.recipient_id === recipientId, "notification persisted for recipient",
  row ? `id=${row.id} recipient=${row.recipient_id} is_read=${row.is_read}` : "row not found");

// 4) push dispatch diagnosis from the server's own logs + DB side effects
await new Promise((r) => setTimeout(r, 1500)); // let bounded push attempts settle
const pushLogs = logs.slice(mark).filter((l) => l.includes("[push]"));
const deactivated = pushLogs.filter((l) => l.includes("deactivated"));
const noSubLog = pushLogs.find((l) => l.includes("no active push subscription"));
const jwtFault = pushLogs.find((l) => /BadJwtToken/i.test(l));
const timeoutLog = pushLogs.find((l) => l.includes("still in flight"));

// A SUCCESSFUL send bumps the row's updated_at (lib/push.ts:211) — the only
// server-side trace of acceptance, since successes are never logged.
const after = targetId
  ? await prisma.pushSubscription.findMany({
      where: { user_id: targetId, is_active: true },
      select: { id: true, updated_at: true },
    })
  : [];
const accepted = after.filter((s) => subStamp.get(s.id) !== s.updated_at.getTime());

if (jwtFault) {
  stage(4, false, "push dispatch", `SERVER-SIDE FAULT → ${jwtFault.trim()}`);
  fail = true;
} else if (!targetId) {
  stage(4, true, "push dispatch",
    "no active subscriptions anywhere — nothing to send (devices re-subscribe on next open)");
} else if (deactivated.length || accepted.length || noSubLog) {
  stage(4, true, "push dispatch produced a diagnosis",
    `${accepted.length} accepted by push service, ${deactivated.length} dead sub(s) deactivated${timeoutLog ? "; ⚠ delivery exceeded 4s bound" : ""}`);
  deactivated.forEach((l) => info(4, "  ↳", l.replace(/^.*\[push\]/, "[push]").trim()));
} else {
  stage(4, false, "push dispatch", "no [push] outcome in logs and no subscription touched — unexpected");
  fail = true;
}

// 5) no-subscription branch (its own "why it never buzzes" cause)
if (noSubsUser && targetId) {
  mark = logs.length;
  const res2 = await fetch(`${BASE}/api/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      recipient: noSubsUser.id,
      title: `${MARK} no-sub probe`,
      message: "Recipient without subscriptions.",
      type: "system",
    }),
  });
  await new Promise((r) => setTimeout(r, 700));
  const noSubSeen = logs.slice(mark).some((l) => l.includes("no active push subscription"));
  stage(5, res2.status === 201 && noSubSeen, "recipient without subscriptions is reported, not crashed",
    `status=${res2.status}${noSubSeen ? " · logged 'no active push subscription'" : " · log missing"}`);
}

// 6) after-state: dead rows cleaned, inbox rows intact
const targetActiveAfter = targetId
  ? await prisma.pushSubscription.count({ where: { user_id: targetId, is_active: true } })
  : 0;
const targetActiveBefore = targetId ? activeByUser.get(targetId) : 0;
info(6, "active subs for push recipient", targetId ? `${targetActiveBefore} → ${targetActiveAfter} (dead rows deactivated by the real sender)` : "0 → 0 (already clean)");
stage(6, !!row && row.recipient_id === recipientId, "inbox row survives push failures (in-app notification unaffected)");

// ---------------------------------------------------------------- verdict
const why = [];
if (missingVapid.length) why.push(`push is DISABLED — ${missingVapid.join(", ")} unset; sendWebPushToUser returns skipped with no log at all.`);
if (!targetId) why.push("no active subscriptions remain in the database — OS push has nothing to deliver until a device opens the app and re-subscribes (in-app + realtime still work).");
if (jwtFault) why.push("VAPID_SUBJECT/JWT rejected by the push service (server-side fault, affects every device).");
if (deactivated.length) why.push(
  `dead subscription(s) rejected by FCM/APNs → auto-deactivated. Stale-VAPID rows were created BEFORE the key rotation; ` +
    `the device re-subscribes with the current key on its NEXT app open (src/push/notifications.ts binding check). ` +
    `Until that open, that device gets no OS push (in-app + realtime still work).`
);
if (noSubLog) why.push("recipient has no enrolled browser (or it already unsubscribed) → nothing to send to; in-app inbox still gets the row.");
if (timeoutLog) why.push("push service answered slower than the 4s bound (sendWebPushBounded) — attempt continued in background.");

console.log(`\n${line("=")}\n  WHY NOTIFICATIONS FAIL (observed)\n${line("=")}`);
if (!why.length) console.log("  No failure observed — delivery path healthy end to end.");
else why.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} stages passed${fail ? " — PIPELINE BROKEN" : ""}`);

// ---------------------------------------------------------------- cleanup
const cleaned = await prisma.notification.deleteMany({ where: { title: { startsWith: MARK } } });
console.log(`cleanup: removed ${cleaned.count} smoke notification(s)`);
sse?.close();
await prisma.$disconnect();
child.kill("SIGKILL");
process.exit(fail || results.some((r) => !r.ok) ? 1 : 0);
