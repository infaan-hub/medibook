/**
 * Browser geolocation helpers (Phase 1 — real coordinates replace the old
 * free-text city / address fields).
 *
 * Everything here is deliberately free of map SDKs and API keys: a fix is
 * captured through the standard Geolocation API, stored as WGS84 degrees, and
 * rendered as a `google.com/maps?q=lat,lng` link (plain navigation, so no CSP
 * change is required).
 */

/** A freshly captured fix, ready to be sent to the API. */
export interface CapturedFix {
  latitude: number;
  longitude: number;
  /** Metres; null when the device did not report accuracy. */
  accuracy: number | null;
}

/** Anything that can supply a position. Fields are optional because a stored
 *  profile row legitimately has no fix yet (`has_location === false`). */
export interface GeoPoint {
  latitude?: number | null;
  longitude?: number | null;
}

/** Options passed straight through to `navigator.geolocation`. */
export interface FixOptions {
  /** Allow coarse (IP/Wi-Fi) fixes. Default true — better than no location. */
  enableHighAccuracy?: boolean;
  /** Give up after this many milliseconds. Default 10s. */
  timeoutMs?: number;
  /** Accept a cached position at most this old. Default 30s. */
  maximumAgeMs?: number;
}

/** Thrown when a fix could not be obtained, with a message safe to show. */
export class LocationError extends Error {
  /** Geolocation API code, or "unsupported" / "unavailable" / "timeout". */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LocationError";
    this.code = code;
  }
}

const DEFAULT_OPTIONS: FixOptions = {
  enableHighAccuracy: true,
  timeoutMs: 10000,
  maximumAgeMs: 30000,
};

/** Human-readable reason for a `GeolocationPositionError`. */
function describePositionError(error: GeolocationPositionError): LocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      // No dead-end "open your browser settings" — every surface that shows
      // this message sits next to the button that retries the permission.
      return new LocationError(
        "Location permission is off — tap the location button again to allow it.",
        "PERMISSION_DENIED"
      );
    case error.TIMEOUT:
      return new LocationError(
        "We could not get a location fix in time. Try again in the open.",
        "TIMEOUT"
      );
    case error.POSITION_UNAVAILABLE:
      return new LocationError(
        "Your device could not determine its position. Try again near a window.",
        "POSITION_UNAVAILABLE"
      );
    default:
      return new LocationError("Could not read your location.", String(error.code));
  }
}

/** True when the current context can offer a location at all. */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/** Raw promise wrapper around `navigator.geolocation.getCurrentPosition`. */
export function getCurrentPosition(options: FixOptions = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(
        new LocationError(
          "This browser cannot report a location. Booking needs a real location.",
          "unsupported"
        )
      );
      return;
    }
    const settings = { ...DEFAULT_OPTIONS, ...options };
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: settings.enableHighAccuracy ?? true,
      timeout: settings.timeoutMs ?? 10000,
      maximumAge: settings.maximumAgeMs ?? 30000,
    });
  });
}

/**
 * Capture a fix and normalise it into the API payload shape.
 * Throws `LocationError` with a user-facing message on any failure.
 */
export async function captureFix(options: FixOptions = {}): Promise<CapturedFix> {
  let position: GeolocationPosition;
  try {
    position = await getCurrentPosition(options);
  } catch (error) {
    if (error instanceof LocationError) throw error;
    if (error instanceof GeolocationPositionError) throw describePositionError(error);
    throw new LocationError("Could not read your location.", "unavailable");
  }

  const { latitude, longitude, accuracy } = position.coords;
  if (!isFinite(latitude) || !isFinite(longitude)) {
    throw new LocationError("Your device returned an invalid position.", "invalid");
  }

  return {
    latitude,
    longitude,
    accuracy: typeof accuracy === "number" && isFinite(accuracy) ? accuracy : null,
  };
}

/** Degrees a user can be asked to grant permission for, before we save anything. */
export async function requestPermission(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    // Safari < 16 rejects { name: "geolocation" }; we simply try on capture.
    return "prompt";
  }
}

/* ---- Rendering helpers (client mirror of next-app/lib/geo.ts) ---- */

/** Kilometres between two points (Haversine); null if either side is missing. */
export function haversineKm(
  a: GeoPoint,
  b: GeoPoint
): number | null {
  if (
    typeof a.latitude !== "number" ||
    typeof a.longitude !== "number" ||
    typeof b.latitude !== "number" ||
    typeof b.longitude !== "number" ||
    !isFinite(a.latitude) ||
    !isFinite(a.longitude) ||
    !isFinite(b.latitude) ||
    !isFinite(b.longitude)
  ) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "1.2 km" / "850 m" — used for the `distance_km` badge on doctor cards. */
export function formatDistance(km: number | null | undefined): string | null {
  if (typeof km !== "number" || !isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Plain link — no SDK, no key, no CSP change (navigation is not `connect-src`). */
export function directionsUrl(
  point: GeoPoint
): string | null {
  if (typeof point.latitude !== "number" || typeof point.longitude !== "number") return null;
  return `https://www.google.com/maps?q=${point.latitude},${point.longitude}`;
}

/** "12.97,77.59" for a compact on-card label, or null when no fix. */
export function formatCoords(
  point: GeoPoint,
  decimals = 5
): string | null {
  if (typeof point.latitude !== "number" || typeof point.longitude !== "number") return null;
  return `${point.latitude.toFixed(decimals)}, ${point.longitude.toFixed(decimals)}`;
}

/** "±45 m" — surfaces how trustworthy a stored fix is. */
export function formatAccuracy(metres: number | null | undefined): string | null {
  if (typeof metres !== "number" || !isFinite(metres) || metres < 0) return null;
  if (metres >= 1000) return `±${(metres / 1000).toFixed(1)} km`;
  return `±${Math.round(metres)} m`;
}
