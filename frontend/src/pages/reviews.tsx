/**
 * PHASE 15 — Patient review management ("My reviews").
 *
 * Patients can see every review they have left, who they reviewed, and remove
 * a review they no longer stand behind. Deletion is confirmed inline (two-step)
 * and the doctor's cached average/count is recalculated server-side, so the
 * directory ratings stay accurate after a removal.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteReview, listMyReviews } from "../api/reviews";
import type { Review } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { StarRating, formatRating, ratingNumber } from "../components/reviews";
import { useToast } from "../state/app-context";
import { Calendar, Star, Trash2 } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ======================================
   MY REVIEWS SCREEN
   ====================================== */

export function MyReviewsScreen() {
  const { notify } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    // page_size at the API cap: this inbox is small in practice and patients
    // expect their whole review history in one view.
    listMyReviews({ page_size: 100 })
      .then((r) => setReviews(r.data.results))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteReview(id);
      setReviews((prev) => prev.filter((review) => review.id !== id));
      notify("success", "Review deleted.");
    } catch (e) {
      notify("error", message(e));
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  const averageGiven =
    reviews.length > 0
      ? reviews.reduce((total, review) => total + ratingNumber(review.rating), 0) / reviews.length
      : 0;

  return (
    <div className="page my-reviews">
      <h1 className="page__title">My reviews</h1>
      <p className="page__subtitle">
        Feedback you have left after completed appointments. Delete a review if your
        experience changed — the doctor&apos;s rating updates automatically.
      </p>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <Skeleton lines={5} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<Star size={40} />}
          title="No reviews yet"
          description="Reviews you leave after a completed appointment will appear here."
          action={
            <Link to="/appointments">
              <Button>View my appointments</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="my-reviews__summary">
            <span className="my-reviews__summary-item">
              <strong>{reviews.length}</strong>
              {reviews.length === 1 ? "review written" : "reviews written"}
            </span>
            <span className="my-reviews__summary-item">
              <strong>{formatRating(averageGiven)}</strong>
              average rating given
            </span>
          </div>

          <Card className="card--fit my-reviews__list">
            {reviews.map((review) => (
              <article className="my-review-row" key={review.id}>
                <div className="my-review-row__top">
                  <div className="my-review-row__who">
                    <strong className="my-review-row__doctor">{review.doctor_name}</strong>
                    <StarRating value={review.rating} readonly size="sm" />
                  </div>
                  <span className="my-review-row__date">{formatDate(review.created_at)}</span>
                </div>

                {review.comment ? (
                  <p className="my-review-row__comment">{review.comment}</p>
                ) : (
                  <p className="my-review-row__comment my-review-row__comment--empty">
                    No comment left.
                  </p>
                )}

                <div className="my-review-row__meta">
                  <Link
                    to={`/appointments/${review.appointment}`}
                    className="my-review-row__link"
                  >
                    <Calendar size={14} /> Appointment #{review.appointment}
                  </Link>
                  {!review.is_visible && (
                    <span className="my-review-row__hidden">Hidden by an administrator</span>
                  )}
                </div>

                <div className="my-review-row__actions">
                  {confirmingId === review.id ? (
                    <>
                      <span className="my-review-row__confirm-text">Delete this review?</span>
                      <Button
                        variant="danger"
                        loading={deletingId === review.id}
                        onClick={() => handleDelete(review.id)}
                      >
                        Yes, delete
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep it
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="my-review-row__delete"
                      onClick={() => setConfirmingId(review.id)}
                    >
                      <Trash2 size={15} /> Delete review
                    </button>
                  )}
                </div>
              </article>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
