/**
 * Geolocation primitives shared by the directory, the emergency nearby search
 * and the booking gate.
 *
 * The project stores REAL coordinates (`latitude` / `longitude`) on Patient and
 * Doctor. Everything here works in kilometres and never rounds to a city name —
 * the old free-text `city` columns could not be measured, which is why the
 * emergency nearby-doctors endpoint used to hand back `distance: 0` for every
 * doctor on the platform.
 */

export interface GeoPoint {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/** Earth radius used by the Haversine formula (mean, km). */
const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two points in kilometres.
 *
 * Accepts possibly-null coordinates so callers can filter first without
 * throwing — a row with a missing coordinate simply has no distance.
 * Returns `null` when either side is incomplete.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number | null {
  if (!hasLocation(a) || !hasLocation(b)) return null;
  const lat1 = a.latitude as number;
  const lon1 = a.longitude as number;
  const lat2 = b.latitude as number;
  const lon2 = b.longitude as number;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** True when a row carries a usable pair of coordinates. */
export function hasLocation(point: GeoPoint): boolean {
  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude)
  );
}

/**
 * Haversine distance, or `null` when either side has no fix.
 * Use this when the caller needs to distinguish "0 km away" from
 * "location unknown".
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number | null {
  return haversineKm(a, b);
}

/** True when `point` sits inside a circle of `radiusKm` around `origin`. */
export function withinRadiusKm(origin: GeoPoint, point: GeoPoint, radiusKm: number): boolean {
  const km = haversineKm(origin, point);
  return km !== null && km <= radiusKm;
}

/**
 * Timestamp to stamp alongside a freshly captured fix. Injected rather than
 * read from `Date.now()` so tests can assert a stable value.
 */
export const captureTimestamp = (now: Date = new Date()): Date => now;

/** Human-readable "±12 m" style accuracy label for the UI. */
export function formatAccuracy(metres: number | null | undefined): string | null {
  if (typeof metres !== "number" || !Number.isFinite(metres) || metres < 0) return null;
  if (metres >= 1000) return `±${(metres / 1000).toFixed(1)} km`;
  return `±${Math.round(metres)} m`;
}

/** Coordinates rendered for display: always 5 decimals (~1 m of precision). */
export function formatCoordinates(point: GeoPoint): string | null {
  if (!hasLocation(point)) return null;
  return `${(point.latitude as number).toFixed(5)}, ${(point.longitude as number).toFixed(5)}`;
}

/**
 * Directions URL — plain `<a href>`, no map SDK, no API key, no CSP change
 * (navigating to another origin is not restricted by `default-src 'self'`).
 */
export function directionsUrl(point: GeoPoint): string | null {
  if (!hasLocation(point)) return null;
  return `https://www.google.com/maps?q=${point.latitude},${point.longitude}`;
}
