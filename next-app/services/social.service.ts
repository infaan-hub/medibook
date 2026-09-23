/**
 * Social login (Google / Apple) — port of accounts/views.py SocialLoginView.
 * Tokens are verified server-side against the provider; the account is looked
 * up case-insensitively by email and created on first sign-in.
 */
import { ApiError, ValidationError, unauthorized } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import * as users from "@/repositories/users.repo";
import * as doctors from "@/repositories/doctors.repo";
import { issuePair } from "./auth.service";
import type { AuthUser } from "@/lib/auth";

interface ProviderIdentity {
  email: string;
  first_name?: string;
  last_name?: string;
  picture?: string | null;
}

const PROVIDERS = ["google", "apple"] as const;

async function verifyGoogle(token: string): Promise<ProviderIdentity> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } }
  );
  if (response.status === 400 || response.status === 401) {
    throw new ApiError(401, "Invalid or expired Google token.");
  }
  if (!response.ok) throw new ApiError(401, "Could not verify Google token.");
  const data = (await response.json()) as Record<string, string>;
  if (!data.email) throw new ApiError(401, "Google token does not contain an email.");
  return {
    email: data.email,
    first_name: data.given_name ?? "",
    last_name: data.family_name ?? "",
    picture: data.picture ?? null,
  };
}

async function verifyApple(token: string): Promise<ProviderIdentity> {
  const { importJWK, jwtVerify, decodeProtectedHeader } = await import("jose");
  const header = decodeProtectedHeader(token);
  if (!header.kid) throw new ApiError(401, "Apple token missing kid header.");
  const keysResponse = await fetch("https://appleid.apple.com/auth/keys", {
    headers: { Accept: "application/json" },
  });
  if (!keysResponse.ok) throw new ApiError(401, "Could not fetch Apple signing keys.");
  const { keys } = (await keysResponse.json()) as {
    keys: Array<{ kty: string; kid: string; n: string; e: string }>;
  };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new ApiError(401, "No matching Apple signing key found.");
  const publicKey = await importJWK(jwk, "RS256");
  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      ...(process.env.APPLE_CLIENT_ID ? { audience: process.env.APPLE_CLIENT_ID } : {}),
    });
    const email = payload.email as string | undefined;
    if (!email) throw new ApiError(401, "Apple token does not contain an email.");
    return { email, first_name: (payload as { given_name?: string }).given_name ?? "", last_name: "", picture: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid Apple token.");
  }
}

async function saveProfileImage(userId: number, url: string): Promise<void> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "MediBook/1.0" } });
    if (!response.ok) return;
    const contentType = response.headers.get("content-type") ?? "";
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const bytes = Buffer.from(await response.arrayBuffer());
    const { saveUploadBytes } = await import("@/lib/upload-bytes");
    const relative = await saveUploadBytes(bytes, "profile_images", `profile_${userId}${ext}`);
    await users.updateUser(userId, { profile_image: relative });
  } catch {
    // Django logged and continued — a missing avatar must not break login.
  }
}

/** POST /api/auth/social/ — { provider, token } → JWT pair + user. */
export async function socialLogin(
  body: unknown
): Promise<{ user: AuthUser; pair: { access: string; refresh: string } }> {
  const input = (body ?? {}) as { provider?: string; token?: string };
  const provider = (input.provider ?? "").trim().toLowerCase();
  const token = (input.token ?? "").trim();

  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    throw new ValidationError(
      { provider: [`Invalid provider '${provider}'.`] },
      `Invalid provider. Must be one of: ${PROVIDERS.join(", ")}.`
    );
  }
  if (!token) {
    throw new ValidationError({ token: ["This field is required."] }, "Token is required.");
  }

  let identity: ProviderIdentity;
  try {
    identity = provider === "google" ? await verifyGoogle(token) : await verifyApple(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unauthorized(String((error as Error).message || "Could not verify token."));
  }
  if (!identity.email) throw new ApiError(401, "Could not retrieve email from OAuth provider.");

  // get_or_create(email__iexact=…)
  const exists = await users.emailExistsIexact(identity.email);
  let user: AuthUser | null = exists ? await users.findUserByEmailExact(identity.email) : null;

  if (!user) {
    const baseUsername = identity.email.split("@")[0];
    let username = baseUsername;
    let counter = 1;
    while (await users.usernameExistsExact(username)) {
      username = `${baseUsername}${counter}`;
      counter += 1;
    }
    user = await users.createUser({
      username,
      email: identity.email,
      password: hashPassword(Math.random().toString(36).slice(2)),
      first_name: identity.first_name ?? "",
      last_name: identity.last_name ?? "",
      role: "patient",
    });
    if (user.role === "doctor" && !(await doctors.doctorExists(user.id))) {
      await doctors.createDoctor(user.id);
    }
  }

  if (identity.picture && !user.profile_image) {
    await saveProfileImage(user.id, identity.picture);
    user = (await users.findUserById(user.id)) ?? user;
  }

  return { user, pair: await issuePair(user.id) };
}
