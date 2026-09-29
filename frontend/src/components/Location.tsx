/**
 * Location display primitives (Phase 1).
 *
 * A profile no longer has an address line — it has coordinates. These pieces
 * render them as something a user can act on: the nearest Zanzibar ward (or a
 * neutral "Location shared" when the fix sits outside the ward table), a
 * compact "1.2 km" badge, and a directions link (plain `<a>` to
 * google.com/maps, so no map SDK and no CSP change).
 *
 * The stored WGS84 numbers and the device accuracy reading stay internal: they
 * decide whether a fix exists and build the maps link, but they are never
 * printed for patients or doctors.
 */
import { Crosshair, MapPin, Navigation } from "lucide-react";
import { directionsUrl, formatCoords, formatDistance } from "../lib/location";
import { nearestAreaName } from "../lib/zanzibar";

interface Point {
  latitude?: number | null;
  longitude?: number | null;
}

export interface LocationLineProps {
  point: Point;
  /** Metres as reported by the device. Accepted for callers that already pass
   *  it, deliberately never rendered (see the module note above). */
  accuracy?: number | null;
  /** Render the "Directions" link. Default true — set false for a patient's
   *  own coordinates, which a doctor needs to see but not navigate to. */
  directions?: boolean;
  /** Optional suffix after the ward, e.g. "on your card". */
  suffix?: string;
  className?: string;
}

/**
 * "Nungwi" plus a directions link — the nearest Zanzibar ward is named because
 * coordinates alone mean nothing to a person — or the "not set yet" hint when
 * the row carries no fix.
 */
export function LocationLine({
  point,
  directions = true,
  suffix,
  className = "",
}: LocationLineProps) {
  // The formatted coordinates are only a presence check here — never rendered.
  const hasFix = formatCoords(point) !== null;
  const area = nearestAreaName(point);
  const href = directions ? directionsUrl(point) : null;

  if (!hasFix) {
    return (
      <span className={`geo-missing ${className}`.trim()}>
        <Crosshair size={13} aria-hidden="true" />
        Location not shared yet
      </span>
    );
  }

  return (
    <span className={className || undefined}>
      <MapPin size={13} aria-hidden="true" /> {area ?? "Location shared"}
      {suffix ? ` — ${suffix}` : ""}
      {href && (
        <>
          {" "}
          <a className="geo-link" href={href} target="_blank" rel="noreferrer">
            <Navigation size={12} aria-hidden="true" /> Directions
          </a>
        </>
      )}
    </span>
  );
}

/**
 * "1.2 km — Nungwi": the distance the API computed, followed by the ward it
 * points at. Pass `point` whenever the caller has coordinates, so the number
 * is attached to a place instead of floating on its own.
 */
export function DistanceBadge({
  km,
  point,
}: {
  km: number | null | undefined;
  point?: Point;
}) {
  const label = formatDistance(km);
  const area = point ? nearestAreaName(point) : null;
  if (!label && !area) return null;
  return (
    <span className="geo-badge">
      <Navigation size={11} aria-hidden="true" />
      {label ? `${label}${area ? ` — ${area}` : ""}` : area}
    </span>
  );
}
