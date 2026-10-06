/**
 * LIVE broadcast — `npm run probe:broadcast`.
 *
 * Creates a `system` inbox notification for every ACTIVE user that has at
 * least one push subscription row, then sends a real OS push to each of them
 * through the production sender (lib/push.ts). Real network, real devices:
 * excluded from the normal suites (vitest.probe.config.ts).
 *
 * A device only ACCEPTS the push if its subscription was created under the
 * CURRENT VAPID key — i.e. the browser has opened the app since the key
 * rotation and re-subscribed. Everything else is reported per user:
 *   sent=1           accepted by FCM/APNs (the device shows it)
 *   deactivated=1    stale key (deactivated) or endpoint gone (PURGED)
 *   active=0         that user's browsers have not re-enrolled yet
 *
 * Re-running is safe: an identical broadcast row already created for a user
 * is reused instead of duplicated.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Load .env the way Next does (ambient env wins), so the probe pushes with the
// exact keypair the server uses.
function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const TITLE = "MediBook";
const MESSAGE =
  "Push notification test — if this arrived as a system notification on your device, Web Push delivery is working.";

describe("broadcast push", () => {
  it("notifies every subscribed user (inbox row + real OS push)", async () => {
    loadEnvFile();
    const { vapidConfigured, vapidPublicKey, sendWebPushToUser } = await import("@/lib/push");
    const { prisma } = await import("@/lib/db");

    const line = "=".repeat(64);
    console.log(`\n${line}\n  MEDIBOOK BROADCAST PUSH\n${line}`);
    console.log(`VAPID configured : ${vapidConfigured()}`);
    console.log(`VAPID public key : ${vapidPublicKey() || "(none)"}`);
    expect(vapidConfigured()).toBe(true);

    const rows = await prisma.pushSubscription.findMany({
      select: { user_id: true, is_active: true },
    });
    const byUser = new Map<number, { total: number; active: number }>();
    for (const row of rows) {
      const stat = byUser.get(row.user_id) ?? { total: 0, active: 0 };
      stat.total += 1;
      if (row.is_active) stat.active += 1;
      byUser.set(row.user_id, stat);
    }

    const recipients = await prisma.user.findMany({
      where: { id: { in: [...byUser.keys()] }, is_active: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const suspended = [...byUser.keys()].filter(
      (id) => !recipients.some((user) => user.id === id)
    );

    console.log(`\nenrolled browsers: ${rows.length} subscription row(s) across ${byUser.size} user(s)`);
    console.log(`notifying: ${recipients.length} active user(s)` + (suspended.length ? `, skipped ${suspended.length} inactive: ${suspended.join(", ")}` : ""));
    console.log("");

    const totals = { users: 0, inboxRows: 0, sent: 0, failed: 0, deactivated: 0, noActive: 0 };

    for (const user of recipients) {
      const stat = byUser.get(user.id)!;

      // Inbox row (reused on re-run so repeated broadcasts don't stack).
      const existing = await prisma.notification.findFirst({
        where: { recipient_id: user.id, notification_type: "system", title: TITLE, message: MESSAGE },
        orderBy: { created_at: "desc" },
      });
      const row =
        existing ??
        (await prisma.notification.create({
          data: {
            notification_type: "system",
            title: TITLE,
            message: MESSAGE,
            recipient_id: user.id,
          },
        }));
      if (!existing) totals.inboxRows += 1;

      const result = await sendWebPushToUser(user.id, {
        title: TITLE,
        body: MESSAGE,
        url: "/notifications",
        tag: "medibook-broadcast",
        notification_id: row.id,
      });

      if (result.sent > 0 && !row.push_sent) {
        await prisma.notification
          .update({ where: { id: row.id }, data: { push_sent: true } })
          .catch(() => undefined);
      }

      totals.users += 1;
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.deactivated += result.deactivated;
      if (stat.active === 0) totals.noActive += 1;

      const status = result.skipped
        ? "VAPID NOT CONFIGURED"
        : result.sent > 0
          ? "DELIVERED"
          : stat.active === 0
            ? "no active subscription (open the app to re-enable)"
            : `rejected: failed=${result.failed} deactivated/purged=${result.deactivated}`;
      console.log(
        `  user=${String(user.id).padStart(4)} subs=${stat.total} active=${stat.active} -> ${status}`
      );
    }

    console.log(`\n${"-".repeat(64)}`);
    console.log(
      `SUMMARY  users=${totals.users}  inbox rows=${totals.inboxRows}  ` +
        `push delivered=${totals.sent}  rejected=${totals.failed}  deactivated/purged=${totals.deactivated}  ` +
        `users w/o active sub=${totals.noActive}`
    );
    if (totals.sent === 0) {
      console.log(
        "DELIVERY NOTE: no browser has re-subscribed under the current VAPID key yet.\n" +
          "               Open the app once on each device (notifications enabled),\n" +
          "               then re-run — the page self-heal re-keys the subscription.\n"
      );
    }
    console.log(`${line}\n`);

    expect(totals.users).toBeGreaterThan(0);
  });
});
