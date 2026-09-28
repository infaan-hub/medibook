/**
 * Location display primitives (Phase 1).
 *
 * A profile no longer has an address line — it has coordinates. These pieces
 * render them as something a user can act on: a compact "1.2 km" badge, an
 * exact coordinate label with the reported accuracy, and a directions link
 * (plain `<a>` to google.com/maps, so no map SDK and no CSP change).
 */
import { Crosshair, MapPin, Navigation } from "lucide-react";
import {
  directionsUrl,
  formatAccuracy,
  formatCoords,
  formatDistance,
} from "../lib/location";
import { nearestAreaName } from "../lib/zanzibar";

interface Point {
  latitude?: number | null;
  longitude?: number | null;
}

export interface LocationLineProps {
  point: Point;
  accuracy?: number | null;
  /** Render the "Directions" link. Default true — set false for a patient's
   *  own coordinates, which a doctor needs to see but not navigate to. */
  directions?: boolean;
  /** Optional suffix after the coordinates, e.g. a hospital name. */
  suffix?: string;
  className?: string;
}

/**
 * "Nungwi · -5.73100, 39.30100 (±45 m)" with a directions link — the nearest
 * Zanzibar ward is named first because coordinates alone mean nothing to a
 * person — or the "not set yet" hint when the row carries no fix.
 */
export function LocationLine({
  point,
  accuracy,
  directions = true,
  suffix,
  className = "",
}: LocationLineProps) {
  const coords = formatCoords(point);
  const area = nearestAreaName(point);
  const href = directions ? directionsUrl(point) : null;

  if (!coords) {
    return (
      <span className={`geo-missing ${className}`.trim()}>
        <Crosshair size={13} aria-hidden="true" />
        Location not shared yet
      </span>
    );
  }

  return (
    <span className={className || undefined}>
      <MapPin size={13} aria-hidden="true" /> {area ? `${area} · ${coords}` : coords}
      {accuracy !== null && accuracy !== undefined ? ` (${formatAccuracy(accuracy)})` : ""}
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
