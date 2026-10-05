/**
 * LIVE push probe — `npm run probe:push`.
 *
 * This is a diagnostic, not an assertion. It reports whether web push is
 * actually configured and, for every real browser subscription in the
 * database, what the push service answered. It sends real payloads to real
 * enrolled devices, so it is excluded from the normal suites (see
 * vitest.probe.config.ts).
 *
 * How to read the output:
 *   201/200 ACCEPTED            → delivered; the device should show it.
 *   403 VAPID credentials ...   → the subscription was created with a
 *                                 DIFFERENT VAPID keypair. Happens after a key
 *                                 rotation; the client must re-subscribe.
 *   400 VapidPkHashMismatch     → same cause, as returned by Apple APNs.
 *   410 unsubscribed/expired    → the browser dropped it; should auto-deactivate.
 *   skipped: true               → VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT are
 *                                 missing from the environment.
 */
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";

// Load .env the way Next does, so the probe reports the same configuration the
// app would use. Already-set process env wins, matching Next's precedence.
function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    return; // no .env (e.g. probing a deployed host) — use the ambient env
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/** What a push-service response means for this deployment. */
function classify(status?: number, body?: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  if (status === 201 || status === 200) return "ACCEPTED (delivered)";
  if (/VapidPkHashMismatch|VAPID credentials in the authorization header/i.test(text))
    return "STALE VAPID KEY - re-subscribe needed";
  if (status === 404 || status === 410) return "GONE - should auto-deactivate";
  if (status === 403 || status === 400) return "REJECTED";
  if (status === 429) return "RATE LIMITED";
  return "UNKNOWN";
}

describe("push probe", () => {
  it("reports configuration and what the push services answer", async () => {
    loadEnvFile();
    const { vapidConfigured, vapidPublicKey } = await import("@/lib/push");
    const { prisma } = await import("@/lib/db");
    const webpush = (await import("web-push")).default;

    const line = "=".repeat(64);
    console.log(`\n${line}\n  MEDIBOOK PUSH PROBE\n${line}`);
    console.log(`VAPID configured : ${vapidConfigured()}`);
    console.log(`VAPID public key : ${vapidPublicKey() || "(none)"}`);

    if (!vapidConfigured()) {
      console.log(
        "\nRESULT: push is DISABLED. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY\n" +
          "        and VAPID_SUBJECT in the server environment.\n"
      );
      console.log(`${line}\n`);
      return;
    }

    const all = await prisma.pushSubscription.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        user_id: true,
        endpoint: true,
        is_active: true,
        device_info: true,
        p256dh_key: true,
        auth_key: true,
      },
    });

    console.log(`\nsubscriptions: ${all.length} total, ${all.filter((s) => s.is_active).length} active\n`);

    if (all.length === 0) {
      console.log(
        "RESULT: no browser has ever subscribed.\n" +
          "        Open the app in a browser and tap Enable on Notifications,\n" +
          "        then run this probe again.\n"
      );
      console.log(`${line}\n`);
      return;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const tally: Record<string, number> = {};
    for (const s of all) {
      let verdict: string;
      let detail = "";
      try {
        const res = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
          JSON.stringify({
            title: "MediBook probe",
            body: "Push delivery check — no action needed.",
          }),
          { TTL: 60, urgency: "high", topic: `probe-${s.id}` }
        );
        verdict = classify(res.statusCode);
      } catch (err) {
        const e = err as { statusCode?: number; body?: unknown };
        verdict = classify(e.statusCode, e.body);
        detail = ` body=${String(typeof e.body === "string" ? e.body : JSON.stringify(e.body)).slice(0, 90)}`;
      }
      tally[verdict] = (tally[verdict] ?? 0) + 1;
      const host = (() => {
        try {
          return new URL(s.endpoint).host;
        } catch {
          return "?";
        }
      })();
      console.log(
        `  sub#${String(s.id).padEnd(4)} user=${String(s.user_id).padEnd(4)} ` +
          `${s.is_active ? "active" : "inactive"} ${host.padEnd(22)} ${verdict}${detail}`
      );
    }

    console.log(`\nSUMMARY`);
    for (const [verdict, count] of Object.entries(tally)) {
      console.log(`  ${String(count).padStart(3)} x ${verdict}`);
    }
    const delivered = tally["ACCEPTED (delivered)"] ?? 0;
    console.log(
      delivered > 0
        ? `\nRESULT: ${delivered} subscription(s) accepted the push. Devices should show it.`
        : "\nRESULT: nothing was delivered. See the categories above for the cause."
    );
    console.log(`${line}\n`);
  }, 120_000);
});