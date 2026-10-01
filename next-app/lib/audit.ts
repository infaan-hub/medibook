/**
 * Compact audit trail — one small row per API request.
 *
 * Requirement: every activity in the system (logins, logouts, account
 * creation, appointments, any request …) is persisted so admins can review
 * it. Rows stay tiny: the existing `AuditEvent` columns carry a derived
 * action name (`appointment.create`, `auth.login`, …), the request path and
 * an `HTTP <status> · <method> · ip <addr> · <ms>` detail line. Failed auth
 * attempts additionally record the attempted email/username.
 *
 * Audit failures never break the request they describe, and a slow insert
 * never blocks a response for longer than WRITE_TIMEOUT_MS.
 */
import { prisma } from "./db";

const MAX_ACTION = 80; // AuditEvent.action VarChar(80)
const MAX_TARGET = 160; // AuditEvent.target VarChar(160)
const MAX_DETAIL = 255; // AuditEvent.detail VarChar(255)
/** Never block a response on the audit insert for longer than this. */
const WRITE_TIMEOUT_MS = 2_000;

/** Reading the audit log must not feed it (keeps pagination stable). */
const AUDIT_LIST_PATHS = new Set(["/api/admin/audit/", "/api/doctor/audit/"]);
/** Auth POSTs — the attempted identity is captured for failed logins. */
const AUTH_IDENT_PATH =
  /\/api\/auth\/(login|register|social|password-change|password-reset|password-reset-confirm)\/?$/;

const METHOD_VERB: Record<string, string> = {
  GET: "read",
  POST: "create",
  PATCH: "update",
  PUT: "update",
  DELETE: "delete",
};

/** Last path segments that carry their own verb (`appointments/12/cancel`). */
const PATH_VERBS = new Set([
  "login",
  "logout",
  "register",
  "create",
  "approve",
  "cancel",
  "accept",
  "reject",
  "confirm",
  "start",
  "refresh",
  "delete",
  "update",
  "done",
  "social",
  "check-in",
  "password-change",
  "password-reset",
  "password-reset-confirm",
]);

const trim = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

/** `health-records` → `health_record`. */
const toResourceWord = (segment: string): string =>
  segment
    .split(/[-_]/)
    .filter(Boolean)
    .map(singular)
    .join("_");

/**
 * Derive a short semantic action from method + path:
 *   POST /api/auth/login/            → auth.login
 *   POST /api/appointments/12/cancel → appointment.cancel
 *   GET  /api/appointments/          → appointment.read
 *   DELETE /api/admin/users/5/       → admin_user.delete
 */
export function deriveAction(method: string, pathname: string): string {
  const verb0 = method.toUpperCase();
  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return `api.${METHOD_VERB[verb0] ?? "request"}`;

  // Auth keeps its canonical names: auth.login, auth.password_reset …
  if (parts[0] === "auth") {
    const rest = parts.slice(1);
    if (rest.length === 0) return `auth.${METHOD_VERB[verb0] ?? "request"}`;
    return trim(`auth.${rest.join("_").replace(/-/g, "_")}`, MAX_ACTION);
  }

  const meaningful = parts.filter((part) => !/^\d+$/.test(part));
  let verb = METHOD_VERB[verb0] ?? "request";
  let resourceParts = meaningful.length > 0 ? meaningful : parts;
  const last = resourceParts[resourceParts.length - 1];
  if (last && PATH_VERBS.has(last)) {
    verb = last.replace(/-/g, "_");
    resourceParts = resourceParts.slice(0, -1);
  }
  if (resourceParts.length === 0) resourceParts = ["api"];
  const resource = resourceParts.map(toResourceWord).join("_");
  return trim(`${resource}.${verb}`, MAX_ACTION);
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (req.headers.get("x-real-ip") ?? "").trim();
}

async function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Clones auth POST bodies to capture the attempted identity (email/username)
 * for the audit row — returns a promise resolving to the identifier or null.
 * The clone happens before the route reads the body.
 */
export function startIdentifierCapture(
  req: Request,
  pathname: string
): Promise<string | null> | null {
  if (req.method.toUpperCase() === "GET") return null;
  if (!AUTH_IDENT_PATH.test(pathname)) return null;
  try {
    const clone = req.clone();
    return clone
      .text()
      .then((text) => {
        try {
          const body = JSON.parse(text) as Record<string, unknown>;
          const value = body.email ?? body.username;
          return typeof value === "string" ? trim(value, 80) : null;
        } catch {
          return null;
        }
      })
      .catch(() => null);
  } catch {
    return null;
  }
}

export interface RequestAudit {
  req: Request;
  pathname: string;
  status: number;
  userId: number | null;
  identifierPromise: Promise<string | null> | null;
  durationMs: number;
}

/** Persist one compact audit row; swallows every failure. */
export async function auditRequest(info: RequestAudit): Promise<void> {
  try {
    const method = info.req.method.toUpperCase();
    if (method === "GET" && AUDIT_LIST_PATHS.has(info.pathname)) return;

    const identifier = info.identifierPromise
      ? await info.identifierPromise.catch(() => null)
      : null;
    const ip = clientIp(info.req);
    const detail = trim(
      [
        `HTTP ${info.status}`,
        method,
        ip ? `ip ${ip}` : "",
        identifier ?? "",
        `${info.durationMs}ms`,
      ]
        .filter(Boolean)
        .join(" · "),
      MAX_DETAIL
    );

    const write = prisma.auditEvent
      .create({
        data: {
          actor_id: info.userId,
          action: trim(deriveAction(method, info.pathname), MAX_ACTION),
          target: trim(info.pathname, MAX_TARGET),
          detail,
        },
      })
      .then(() => undefined)
      .catch(() => undefined);
    await withTimeout(write, WRITE_TIMEOUT_MS);
  } catch {
    // The audit trail must never break the request it describes.
  }
}
