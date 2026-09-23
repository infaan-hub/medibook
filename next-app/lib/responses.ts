/**
 * Standard MediBook API response envelope (§28) — the TypeScript port of
 * backend/common/responses.py.
 *
 *   success: { "success": true,  "message": "...", "data": {...} }
 *   failure: { "success": false, "message": "...", "errors": {...} }
 */
import { ApiError, DEFAULT_MESSAGES, type FieldErrors } from "./errors";

export function successResponse(
  data: unknown = null,
  message = "",
  status = 200
): Response {
  return Response.json(
    { success: true, message, data: data === null || data === undefined ? {} : data },
    { status }
  );
}

export const createdResponse = (data: unknown, message = "") =>
  successResponse(data, message, 201);

export function errorResponse(
  message?: string,
  errors?: FieldErrors,
  status = 400
): Response {
  return Response.json(
    { success: false, message: message ?? DEFAULT_MESSAGES[status] ?? "The request failed.", errors: errors ?? {} },
    { status }
  );
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Security headers middleware (Django: common/middleware.py — PHASE 17).
 * Applied to every API response; setdefault semantics preserved.
 */
export function applySecurityHeaders(response: Response): Response {
  const h = response.headers;
  if (!h.has("Content-Security-Policy")) {
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
  }
  if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
  if (!h.has("Referrer-Policy")) h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!h.has("Permissions-Policy")) {
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  }
  if (!h.has("X-Frame-Options")) h.set("X-Frame-Options", "DENY");
  return response;
}

/** Convert any thrown value into an envelope Response (no stack leakage). */
export function errorResponseFrom(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.errors, error.status);
  }
  // Unexpected failure: log server-side, never expose details (§36).
  console.error("[api] unhandled error:", error);
  return errorResponse(DEFAULT_MESSAGES[500], {}, 500);
}
