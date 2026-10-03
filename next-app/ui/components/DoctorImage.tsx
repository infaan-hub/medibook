/**
 * Doctor photo — one place that decides whether a picture may be shown at all.
 *
 * A doctor card/detail may only ever render a picture that belongs to THIS
 * doctor: the uploaded media file (`User.profile_image_id` → `/media/{id}/`).
 * Everything else renders the "No image" state instead:
 *
 *   - no value / empty string / whitespace,
 *   - an external or placeholder URL (someone else's photo is not this
 *     doctor's photo — and a hot-linked CDN can rot or be blocked),
 *   - a same-origin path that is not our media storage,
 *   - an image whose bytes fail to load (404 on a deleted media object, a
 *     blocked optimizer request, a dead tab) → `onError` swaps it for the
 *     same placeholder rather than leaving a broken-image icon.
 *
 * There is deliberately no random/portrait fallback list: two doctors must
 * never look alike by accident, and "no photo" is a truthful state the design
 * already accounts for.
 */
import { useState } from "react";
import Image from "next/image";

/** Text rendered instead of a picture. */
export const NO_IMAGE_LABEL = "No image";

/** Our own storage layout: `/media/{id}/` or a legacy `/media/<path>`. */
const OWN_MEDIA_PATH = /^\/media\/.+/;

/**
 * Accept only this app's own media URLs; anything else returns `null`.
 *
 * Relative `/media/…` values (what `mediaUrl()` emits) are accepted as-is.
 * Absolute `http(s)` values must point back at the running origin — an
 * `images.unsplash.com` or any other host is never a doctor's photo.
 */
export function resolveDoctorImage(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw === "") return null;

  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (typeof window === "undefined" || url.host !== window.location.host) return null;
      candidate = `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  return OWN_MEDIA_PATH.test(candidate) ? candidate : null;
}

export interface DoctorImageProps {
  /** `profile_image` straight from the API — never a pre-picked fallback. */
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  /** next/image `sizes` hint for the grid the card sits in. */
  sizes: string;
  priority?: boolean;
  /** Class applied to the <img> (also the base class of the placeholder). */
  className?: string;
  /** Extra class for the "No image" box (its own footprint/shape). */
  emptyClassName?: string;
}

export function DoctorImage({
  src,
  alt,
  width,
  height,
  sizes,
  priority,
  className,
  emptyClassName,
}: DoctorImageProps) {
  // Remember WHICH source failed, so a new upload (same component instance)
  // is retried instead of inheriting the previous failure.
  const [failure, setFailure] = useState<{ src: string | null | undefined } | null>(null);
  const failed = failure !== null && failure.src === src;
  const resolved = failed ? null : resolveDoctorImage(src);

  if (!resolved) {
    return (
      <span
        className={[className, emptyClassName, "doctor-photo-empty"].filter(Boolean).join(" ")}
        role="img"
        aria-label={NO_IMAGE_LABEL}
        title={NO_IMAGE_LABEL}
      >
        {NO_IMAGE_LABEL}
      </span>
    );
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setFailure({ src })}
    />
  );
}
