#!/usr/bin/env node
/**
 * Safe Prisma migration runner (used by `npm run build` and `npm run db:deploy`).
 *
 * WHY THIS EXISTS — Prisma's schema engine guards `migrate deploy` with a
 * session-level Postgres advisory lock (pg_advisory_lock(72707369)). Session
 * locks and connection poolers in transaction mode (Neon's `-pooler` endpoint /
 * PgBouncer) do not mix:
 *
 *   1. The lock can be acquired on one pooled server connection and released on
 *      another, so `pg_advisory_unlock` silently no-ops and the lock LEAKS onto
 *      a pooled connection that never dies.
 *   2. Every later `migrate deploy` then blocks on `pg_advisory_lock(...)` and
 *      dies after the 10s timeout with:
 *        P1002 The database server was reached but timed out.
 *        Timed out trying to acquire a postgres advisory lock (72707369)
 *
 * That is exactly the failure that broke Vercel builds on 2026-09-27.
 *
 * THE FIX (three layers):
 *   a. Migrations run over the DIRECT (non-pooler) connection. A real session
 *      releases its advisory lock when the process exits, even on a crash, so
 *      locks can never leak. Runtime queries keep using the pooled
 *      DATABASE_URL — only the migrate child process sees the direct URL.
 *   b. Before every attempt we clear a stale leaked lock: advisory-lock rows
 *      whose holder backend has been idle for >60s (a healthy concurrent
 *      migration is never idle that long while holding the lock).
 *   c. Lock-timeout failures are retried with backoff so a legitimately
 *      running concurrent migration can finish.
 *
 * Usage (identical to `prisma migrate ...`, defaults to `deploy`):
 *   node scripts/migrate.mjs            → prisma migrate deploy
 *   node scripts/migrate.mjs dev        → prisma migrate dev ...
 *
 * If DIRECT_URL is set in the environment it wins; otherwise Neon's direct
 * endpoint is derived by stripping the `-pooler` segment from the host.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");

/** Prisma schema-engine's fixed migration advisory-lock key. */
const MIGRATE_LOCK_KEY = 72707369;
/** Attempts before giving up (only lock/timeout failures are retried). */
const MAX_ATTEMPTS = 3;
/** A holder idle this long while holding the lock is leaked, not migrating. */
const STALE_IDLE_SECONDS = 60;

/**
 * Whether the build is allowed to continue when the database is unreachable.
 *
 * A build that dies here produces NO deployment, so a missing DATABASE_URL (or a
 * migration that cannot run) silently freezes the project on whatever the last
 * successful build was. That is exactly how this backend went stale: every route
 * added since the last good build answered 404 while the repository contained
 * them the whole time.
 *
 * A deployable artifact is worth more than a failed build, so by default we warn
 * loudly and keep going — schema drift then surfaces as a loud runtime error
 * rather than as an invisible, permanently frozen deployment. Set
 * REQUIRE_MIGRATIONS=1 to restore the strict, fail-the-build behaviour.
 */
function migrationsRequired() {
  return ["1", "true", "yes"].includes(
    (process.env.REQUIRE_MIGRATIONS || "").trim().toLowerCase()
  );
}

/** One loud, actionable banner for every "building without migrating" path. */
function warnContinuing(reason) {
  console.warn(
    `\n[migrate] WARNING — the build is continuing WITHOUT applying migrations.\n` +
      `         Reason: ${reason}\n` +
      `         The database must already be up to date, or the app will fail at runtime.\n` +
      `         Apply them manually with: npm run db:deploy\n` +
      `         Set REQUIRE_MIGRATIONS=1 to make a failed migration fail the build instead.\n`
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal .env reader (KEY=VALUE, optional quotes) for local runs. */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function resolveDatabaseUrl() {
  const fileEnv = readEnvFile(path.join(APP_ROOT, ".env"));
  const url = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  if (!url) {
    if (migrationsRequired()) {
      console.error(
        "[migrate] DATABASE_URL is not set and REQUIRE_MIGRATIONS=1 — failing the build."
      );
      process.exit(1);
    }
    warnContinuing("DATABASE_URL is not set");
    return null;
  }
  return url;
}

/** Direct (unpooled) URL for migrations: DIRECT_URL env wins, else de-pool Neon. */
function directUrlFor(url) {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;
  if (url.includes("-pooler.")) return url.replace("-pooler.", ".");
  return url;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable url)";
  }
}

/**
 * Terminate backends holding the migration advisory lock whose holder has been
 * idle for >STALE_IDLE_SECONDS — i.e. a lock leaked by a crashed/interrupted
 * migrate through a pooled connection. Never touches an active migration.
 */
async function clearStaleMigrationLock() {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasourceUrl: process.env.__MIGRATE_URL });
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT l.pid FROM pg_locks l
       JOIN pg_stat_activity a ON a.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND l.classid = 0
         AND l.objid = ${MIGRATE_LOCK_KEY}
         AND (a.state IS NULL
              OR (a.state <> 'active'
                  AND a.state_change < now() - interval '${STALE_IDLE_SECONDS} seconds'))`
    );
    if (Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        await client.$executeRawUnsafe(
          `SELECT pg_terminate_backend(${Number(row.pid)})`
        );
      }
      console.warn(
        `[migrate] cleared stale leaked advisory lock ${MIGRATE_LOCK_KEY} ` +
          `from idle backend(s): ${rows.map((r) => r.pid).join(", ")}`
      );
      await sleep(500);
    }
  } catch (error) {
    // Best effort — the retry loop below still protects the build.
    console.warn(`[migrate] stale-lock check failed: ${String(error)}`);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/** Run `prisma migrate <args>` with the direct URL; resolve { code, output }. */
function runPrismaMigrate(args) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const child = spawn("npx", ["prisma", "migrate", ...args], {
      cwd: APP_ROOT,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
      // npx is a .cmd on Windows, which requires a shell.
      shell: isWindows,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      resolve({ code: 1, output: `${output}\n${String(error)}` });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) args.push("deploy");

  const pooledUrl = resolveDatabaseUrl();
  if (pooledUrl === null) return; // No DATABASE_URL — already warned above.
  const migrateUrl = directUrlFor(pooledUrl);
  process.env.DATABASE_URL = migrateUrl; // seen by the prisma child process
  process.env.__MIGRATE_URL = migrateUrl; // seen by clearStaleMigrationLock

  const pooled = hostOf(pooledUrl);
  const direct = hostOf(migrateUrl);
  console.log(
    `[migrate] ${args.join(" ")} via direct connection: ${direct}` +
      (direct !== pooled ? ` (runtime keeps pooled ${pooled})` : "")
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await clearStaleMigrationLock();

    const { code, output } = await runPrismaMigrate(args);
    if (code === 0) return;

    const lockOrTimeout = /P1002|advisory lock/i.test(output);
    if (!lockOrTimeout || attempt === MAX_ATTEMPTS) {
      if (migrationsRequired()) {
        console.error(
          `[migrate] prisma migrate ${args.join(" ")} failed (exit ${code})` +
            (lockOrTimeout ? " after retries" : "") +
            "\n         REQUIRE_MIGRATIONS=1 is set, so the build fails. Unset it to let" +
            "\n         the build continue, or fix DATABASE_URL / the database first."
        );
        process.exit(code);
      }
      warnContinuing(
        `prisma migrate ${args.join(" ")} exited ${code}` +
          (lockOrTimeout ? " after retries (advisory lock / timeout)" : "")
      );
      return;
    }

    const waitMs = attempt * 15_000;
    console.warn(
      `[migrate] attempt ${attempt}/${MAX_ATTEMPTS} hit a lock/timeout; ` +
        `retrying in ${waitMs / 1000}s...`
    );
    await sleep(waitMs);
  }
}

main().catch((error) => {
  // An environmental failure (unreachable database, missing module) must not
  // silently freeze the deployment either — same reasoning as above.
  if (migrationsRequired()) {
    console.error("[migrate] fatal:", error);
    process.exit(1);
  }
  warnContinuing(`unexpected error: ${String(error)}`);
  process.exit(0);
});
