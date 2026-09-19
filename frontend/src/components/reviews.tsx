/**
 * PHASE 15 — Reviews: star rating input, review form, review list.
 */

import { useState, type FormEvent } from "react";
import { submitReview } from "../api/reviews";
import type { Review } from "../api/types";
import { Button, Card, EmptyState } from "../components/ui";
import { useToast } from "../state/app-context";
import { Star } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ======================================
   STAR RATING INPUT
   ====================================== */

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const [hover, setHover] = useState(0);

  const sizeClass = size === "sm" ? "star-rating--sm" : size === "lg" ? "star-rating--lg" : "";
  const iconSize = size === "sm" ? 14 : size === "lg" ? 24 : 18;

  return (
    <div className={`star-rating ${sizeClass}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-rating__star ${
            star <= (hover || value) ? "star-rating__star--filled" : ""
          }`}
          onClick={() => !readonly && onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          disabled={readonly}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <Star size={iconSize} fill={star <= (hover || value) ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

/* ======================================
   REVIEW FORM
   ====================================== */

export function ReviewForm({
  appointmentId,
  onSuccess,
}: {
  appointmentId: number;
  onSuccess?: () => void;
}) {
  const { notify } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitReview(appointmentId, { rating, comment: comment || undefined });
      notify("success", "Review submitted. Thank you for your feedback!");
      onSuccess?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h3>Write a review</h3>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label">Rating</label>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="review-comment">
            Comment (optional)
          </label>
          <textarea
            id="review-comment"
            className="field__input"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience..."
          />
        </div>
        {error && <p className="form-note--error">{error}</p>}
        <Button type="submit" loading={submitting}>
          Submit review
        </Button>
      </form>
    </Card>
  );
}

/* ======================================
   SINGLE REVIEW DISPLAY
   ====================================== */

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="review-card">
      <div className="review-card__header">
        <StarRating value={review.rating} readonly size="sm" />
        <span className="review-card__time">{timeAgo(review.created_at)}</span>
      </div>
      {review.comment && <p className="review-card__comment">{review.comment}</p>}
    </div>
  );
}

/* ======================================
   DOCTOR REVIEW LIST
   ====================================== */

export function DoctorReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Star size={40} />}
        title="No reviews yet"
        description="Be the first to leave a review after your appointment."
      />
    );
  }

  return (
    <div className="review-list">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </div>
  );
}
