/**
 * Route wrapper — the request pipeline mandated by §25:
 *
 *   Request → Authentication → Authorization → Validation → Business logic
 *
 * `handler()` performs authentication (DRF order: authenticate → throttle),
 * applies rate limits, invokes the route, converts any thrown ApiError into
 * the §28 envelope, and stamps the Django security headers on every response.
 * Routes then only assert roles (requirePatient/…) and validate input.
 */
import { optionalAuth, type AuthUser } from "./auth";
import { errorResponseFrom, applySecurityHeaders, successResponse } from "./responses";
import { throttleIdentity, throttleScope } from "./throttle";

export interface RouteCtx {
  req: Request;
  user: AuthUser | null;
  params: Record<string, string>;
}

type HandlerFn = (ctx: RouteCtx) => Promise<Response> | Response;
/** Throttle scopes. "media" is the dedicated, generous asset bucket for
 *  /media/* delivery (image <img> requests never carry auth headers — they
 *  must not drain the shared 60/min anon API bucket and 429 into broken
 *  images). */
type ThrottleScope = "auth" | "password_reset" | "media" | undefined;

type NextRouteContext = {
  // Next 15 types require a Promise; catch-all segments may be string[].
  params: Promise<any>;
};

export function handler(
  fn: HandlerFn,
  options: { throttle?: ThrottleScope } = {}
) {
  return async (req: Request, ctx: NextRouteContext): Promise<Response> => {
    try {
      const rawParams = ctx?.params ? await ctx.params : {};
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawParams ?? {})) {
        params[key] = Array.isArray(value) ? value.join("/") : String(value);
      }

      // 1) Authentication (invalid tokens → 401, exactly like SimpleJWT).
      const user = await optionalAuth(req);

      // 2) Rate limiting — scoped views use ONLY their scope limit (DRF swaps
      //    the throttle classes on those views); everything else uses the
      //    default anon/user limits.
      if (options.throttle) throttleScope(req, options.throttle);
      else throttleIdentity(req, user ? user.id : null);

      // 3) The route itself (role checks + validation happen inside).
      const response = await fn({ req, user, params });
      return applySecurityHeaders(response);
    } catch (error) {
      return applySecurityHeaders(errorResponseFrom(error));
    }
  };
}

/** Shorthands for common responses used by route handlers. */
export const ok = successResponse;
export const created = (data: unknown, message = "", status = 201) =>
  successResponse(data, message, status);
export const noContent = () => new Response(null, { status: 204 });

/** Reads a JSON body as a plain object ({} when absent/invalid). */
export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Reads multipart/form-data into { body, fields, file }. */
export async function readMultipart(
  req: Request
): Promise<{ body: Record<string, unknown>; file: File | null }> {
  try {
    const form = await req.formData();
    const body: Record<string, unknown> = {};
    let file: File | null = null;
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        if (file === null && value.size > 0) file = value;
      } else {
        body[key] = value;
      }
    }
    return { body, file };
  } catch {
    return { body: {}, file: null };
  }
}

/** Parses a numeric path parameter (non-numeric → null → 404 upstream). */
export const intParam = (value: string | null | undefined): number | null => {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

/** Re-export common auth helpers for route convenience. */
export { requireAuth, requireAdmin, requirePatient, requireDoctor } from "./auth";
/** Re-export common error helpers for route convenience. */
export { badRequest, notFound, forbidden, conflict } from "./errors";
