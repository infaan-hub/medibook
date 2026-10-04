/**
 * Single source of truth for sidebar / bottom-nav active-state resolution.
 *
 * The active item is derived ONLY from the current pathname — never from
 * component state, click history, or storage — so refresh, direct URLs, and
 * browser Back/Forward all resolve the same way.
 *
 * Matching rules (in order):
 *  1. Normalize the pathname (strip query/hash, collapse trailing slashes).
 *  2. A nav item matches when the pathname equals its `to`, or extends it at a
 *     segment boundary (`/admin` matches `/admin/users`, but `/admin` never
 *     matches `/admins`).
 *  3. `to === "/"` matches only the exact root path.
 *  4. When several items match (common prefixes such as `/admin` vs
 *     `/admin/appointments`), the LONGEST / most specific `to` wins — so the
 *     caller can mark exactly one item active and the rest inactive.
 *
 * Returns `null` when the route belongs to no nav item (e.g. an unlisted
 * detail screen): zero items are highlighted, never two.
 */

export interface NavRoute {
  to: string;
}

/** Strip query/hash noise and trailing slashes ("/admin/" → "/admin"). */
function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Returns the `to` of the single best-matching nav item for `pathname`,
 * or `null` when no item matches.
 */
export function findActiveNavItem(
  pathname: string,
  items: readonly NavRoute[]
): string | null {
  const current = normalizePathname(pathname);
  let best: { to: string; length: number } | null = null;

  for (const item of items) {
    const target = normalizePathname(item.to);
    const matches =
      target === "/"
        ? current === "/"
        : current === target || current.startsWith(`${target}/`);
    if (!matches) continue;
    if (best === null || target.length > best.length) {
      best = { to: item.to, length: target.length };
    }
  }

  return best?.to ?? null;
}
