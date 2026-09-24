/**
 * MediBook design tokens (§21) — typed mirror of tokens.css for JS consumers.
 * CSS remains the source of truth; keep both in sync.
 */

export const brand = {
  primary: "#0f62fe",
  secondary: "#009d9a",
  accent: "#8a3ffc",
  background: "#f4f4f6",
  surface: "#ffffff",
  text: "#16191e",
  textMuted: "#5b616a",
  border: "#d5d9de",
  error: "#da1e28",
  success: "#24a148",
} as const;

export const breakpoints = {
  phone: 600,
  tablet: 1024,
  desktop: 1440,
} as const;

export type ScreenSize = keyof typeof breakpoints;

/** Resolve the current §22.5 breakpoint bucket from a viewport width. */
export function breakpointFor(width: number): ScreenSize {
  if (width < breakpoints.phone) return "phone";
  if (width < breakpoints.tablet) return "tablet";
  if (width < breakpoints.desktop) return "desktop";
  return "desktop";
}
