// One-time helper: writes next-app/.env with a freshly generated AUTH_SECRET.
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(dirname(fileURLToPath(import.meta.url)));
const secret = randomBytes(48).toString("hex");
const cronSecret = randomBytes(16).toString("hex");
let vapid = { publicKey: "", privateKey: "" };
try {
  const webpush = await import("web-push");
  vapid = webpush.default.generateVAPIDKeys();
} catch {
  // web-push not installed — leave empty and generate later.
}
const env = [
  'DATABASE_URL="postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require"',
  `AUTH_SECRET="${secret}"`,
  "JWT_ACCESS_MINUTES=30",
  "JWT_REFRESH_DAYS=7",
  "PASSWORD_RESET_TOKEN_HOURS=2",
  "APP_VERSION=0.1.0",
  "API_PAGE_SIZE=20",
  "THROTTLE_DISABLED=false",
  "PORT=8000",
  "REMINDERS_INTERVAL_MINUTES=15",
  `CRON_SECRET="${cronSecret}"`,
  `VAPID_PUBLIC_KEY="${vapid.publicKey}"`,
  `VAPID_PRIVATE_KEY="${vapid.privateKey}"`,
  `VAPID_SUBJECT="mailto:ops@medibook.local"`,
  "MEDIA_ROOT=uploads",
  "EMAIL_TRANSPORT=console",
  'DEFAULT_FROM_EMAIL="MediBook <no-reply@medibook.local>"',
  "",
].join("\n");
writeFileSync(join(dir, ".env"), env, "utf8");
console.log("Wrote", join(dir, ".env"));
