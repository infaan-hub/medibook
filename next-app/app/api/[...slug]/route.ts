/**
 * Unknown /api/* paths → §28 JSON 404.
 *
 * Without this the optional catch-all page (app/[[...slug]]/page.tsx) answers a
 * mistyped or not-yet-deployed API path with 200 text/html. The browser client
 * then receives an HTML document where an envelope was expected and screens
 * crash with a cryptic "… is not iterable" instead of a clear "Not found".
 */
import { applySecurityHeaders, errorResponse } from "@/lib/responses";

const notFound = (_request: Request) =>
  applySecurityHeaders(errorResponse("The requested resource was not found.", {}, 404));

export {
  notFound as GET,
  notFound as HEAD,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
  notFound as OPTIONS,
};
