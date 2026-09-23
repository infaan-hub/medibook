/**
 * JWT access/refresh tokens — the TypeScript replacement for
 * djangorestframework-simplejwt (backend config/settings.py SIMPLE_JWT):
 *
 *   access  lifetime 30 min (JWT_ACCESS_MINUTES), type claim "access"
 *   refresh lifetime 7 d  (JWT_REFRESH_DAYS), type claim "refresh", jti for
 *             server-side rotation/blacklisting (auth_refreshtoken table)
 *
 * HS256 via `jose`. Token strings are opaque to the frontend, so claim layout
 * is free — but lifetimes/rotation semantics match Django exactly.
 */
import { SignJWT, jwtVerify } from "jose";
import { ApiError } from "./errors";

const encoder = new TextEncoder();
const secret = () => encoder.encode(process.env.AUTH_SECRET ?? "");

export const accessMinutes = () => Number(process.env.JWT_ACCESS_MINUTES ?? 30);
export const refreshDays = () => Number(process.env.JWT_REFRESH_DAYS ?? 7);

export interface TokenClaims {
  sub: number;
  typ: "access" | "refresh";
  exp?: number;
  jti?: string;
}

export async function signAccessToken(userId: number): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${accessMinutes()}m`)
    .sign(secret());
}

export async function signRefreshToken(userId: number, jti: string): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${refreshDays()}d`)
    .setJti(jti)
    .sign(secret());
}

function mapVerifyError(error: unknown): ApiError {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "ERR_JWT_EXPIRED") return new ApiError(401, "Token is expired");
  return new ApiError(401, "Token is invalid or expired");
}

/** Verifies an access token; throws DRF-shaped 401s on any failure. */
export async function verifyAccessToken(token: string): Promise<TokenClaims> {
  let claims: TokenClaims;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    claims = payload as unknown as TokenClaims;
  } catch (error) {
    throw mapVerifyError(error);
  }
  if (claims.typ !== "access") {
    throw new ApiError(401, "Token has wrong type");
  }
  return claims;
}

/** Verifies a refresh token (signature + type + expiry); 401 on failure. */
export async function verifyRefreshToken(token: string): Promise<TokenClaims> {
  let claims: TokenClaims;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    claims = payload as unknown as TokenClaims;
  } catch (error) {
    throw mapVerifyError(error);
  }
  if (claims.typ !== "refresh") {
    throw new ApiError(401, "Token has wrong type");
  }
  return claims;
}
