/**
 * Password hashing + Django password validators.
 *
 * New hashes use Node's built-in scrypt (no Python/argon/bcrypt dependency).
 * Migrated rows may still hold Django's `pbkdf2_sha256$…` hashes — those are
 * verified natively and transparently upgraded to scrypt on the next
 * successful login, so no user is locked out by the migration.
 */
import {
  pbkdf2Sync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  // 32-byte key → base64 44 chars → full hash 94 chars (fits VARCHAR(128)).
  const key = scryptSync(plain, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString("base64")}`;
}

function verifyScrypt(plain: string, stored: string): boolean {
  const [, nStr, rStr, pStr, salt, hashB64] = stored.split("$");
  if (!salt || !hashB64) return false;
  try {
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(plain, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Django PBKDF2-SHA256 (`pbkdf2_sha256$iterations$salt$base64hash`). */
function verifyDjangoPbkdf2(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  if (!Number.isInteger(iterations) || !salt) return false;
  try {
    const expected = Buffer.from(parts[3], "base64");
    const actual = pbkdf2Sync(plain, salt, iterations, expected.length, "sha256");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) return verifyScrypt(plain, stored);
  if (stored.startsWith("pbkdf2_sha256$")) return verifyDjangoPbkdf2(plain, stored);
  return false; // Django's unusable "!" password or unknown scheme.
}

export const isDjangoHash = (stored: string): boolean =>
  stored.startsWith("pbkdf2_sha256$");

/** Approximation of Django's CommonPasswordValidator (top common passwords). */
const COMMON_PASSWORDS = new Set([
  "password", "123456", "123456789", "qwerty", "abc123", "password1",
  "12345678", "111111", "1234567890", "1234567", "000000", "iloveyou",
  "1234", "dragon", "sunshine", "princess", "letmein", "monkey", "trustno1",
  "football", "baseball", "welcome", "admin", "admin123", "root", "passw0rd",
  "master", "shadow", "superman", "michael", "qwerty123", "1q2w3e4r",
]);

/**
 * Django's auth validators (MinimumLength, CommonPassword, Numeric and — when
 * user attributes are supplied — UserAttributeSimilarity). Returns the list of
 * DRF-compatible error messages (empty when the password is acceptable).
 */
export function validateNewPassword(
  password: string,
  attributes: { username?: string; email?: string; first_name?: string; last_name?: string } = {}
): string[] {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("This password is too short. It must contain at least 8 characters.");
  }
  if (password.length > 128) {
    errors.push("This password is too long. It must contain at most 128 characters.");
  }
  if (/^\d+$/.test(password)) {
    errors.push("This password is entirely numeric.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common.");
  }
  // UserAttributeSimilarityValidator (only when a user context exists).
  const similarityTargets: Array<[string, string]> = [
    ["username", attributes.username ?? ""],
    ["email", attributes.email?.split("@")[0] ?? ""],
    ["first name", attributes.first_name ?? ""],
    ["last name", attributes.last_name ?? ""],
  ];
  const lower = password.toLowerCase();
  for (const [label, value] of similarityTargets) {
    if (value && value.length >= 3 && lower.includes(value.toLowerCase())) {
      errors.push(`The password is too similar to the ${label}.`);
      break;
    }
  }
  return errors;
}
