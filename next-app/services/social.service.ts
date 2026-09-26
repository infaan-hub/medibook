/**
 * Social login (Google) — port of accounts/views.py SocialLoginView.
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

const PROVIDERS = ["google"] as const;

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

  // `tokeninfo` signature-checks the JWT but hands back whatever token it was
  // given — including one minted for a *different* Google OAuth client. Pin the
  // issuer always, and the audience once our client id is configured, so a token
  // issued to an attacker's own Google app is rejected. (No client secret is
  // involved: this public endpoint needs none.)
  if (data.iss !== "https://accounts.google.com") {
    throw new ApiError(401, "Google token has an unexpected issuer.");
  }
  const expectedAudience = process.env.GOOGLE_CLIENT_ID;
  if (expectedAudience && data.aud !== expectedAudience) {
    throw new ApiError(401, "Google token was not issued for this application.");
  }
  if (!data.email) throw new ApiError(401, "Google token does not contain an email.");
  return {
    email: data.email,
    first_name: data.given_name ?? "",
    last_name: data.family_name ?? "",
    picture: data.picture ?? null,
  };
}

async function saveProfileImage(userId: number, url: string): Promise<void> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "MediBook/1.0" } });
    if (!response.ok) return;
    const contentType = response.headers.get("content-type") ?? "";
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const bytes = Buffer.from(await response.arrayBuffer());
    const { uploadImageBytes, deleteMediaIfUnreferenced } = await import(
      "@/lib/media/uploadImage"
    );
    const { prisma } = await import("@/lib/db");
    const previousId = (await users.findUserById(userId))?.profile_image_id ?? null;
    // Same transactional replace as updateMe: create → swap → delete old.
    await prisma.$transaction(async (tx) => {
      const media = await uploadImageBytes(bytes, {
        subdir: "profile_images",
        ownerId: userId,
        name: `profile_${userId}${ext}`,
        tx,
      });
      await tx.user.update({ where: { id: userId }, data: { profile_image_id: media.id } });
      if (previousId && previousId !== media.id) await deleteMediaIfUnreferenced(previousId, tx);
    });
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
    identity = await verifyGoogle(token);
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

  if (identity.picture && !user.profile_image_id) {
    await saveProfileImage(user.id, identity.picture);
    user = (await users.findUserById(user.id)) ?? user;
  }

  return { user, pair: await issuePair(user.id) };
}
