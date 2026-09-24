/**
 * PHASE 15 — "My reviews" (patient review management) screen tests.
 *
 * Covers the previously missing UI for listMyReviews()/deleteReview(): patients
 * can see every review they have left and remove one behind an inline
 * confirmation. The screen renders inside the app shell, so it needs a router
 * (it links to appointment detail) and the ToastProvider (delete feedback).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MyReviewsScreen } from "../screens/reviews";
import { ToastProvider } from "../state/app-context";
import type { Review } from "../api/types";

const { listMyReviews, deleteReview } = vi.hoisted(() => ({
  listMyReviews: vi.fn(),
  deleteReview: vi.fn(),
}));

// submitReview/getDoctorReviews are re-exported by the same module and imported
// by components/reviews, so the mock must describe the whole surface.
vi.mock("../api/reviews", () => ({
  submitReview: vi.fn(),
  getDoctorReviews: vi.fn(),
  listMyReviews,
  deleteReview,
}));

/** §28 envelope wrapping the paginated payload from common/pagination.py. */
function envelope(results: Review[]) {
  return {
    success: true,
    message: "",
    data: {
      count: results.length,
      page: 1,
      page_size: 100,
      total_pages: 1,
      next: null,
      previous: null,
      results,
    },
  };
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 1,
    appointment: 10,
    patient: 1,
    doctor: 3,
    doctor_name: "Dr. Ada Lovelace",
    rating: 5,
    comment: "Very thorough.",
    is_visible: true,
    created_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MyReviewsScreen />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MyReviewsScreen", () => {
  it("lists the patient's own reviews with doctor, rating and comment", async () => {
    listMyReviews.mockResolvedValue(
      envelope([
        review({ id: 1, comment: "Very thorough." }),
        review({ id: 2, doctor_name: "Dr. Grace Hopper", rating: 3, comment: "" }),
      ])
    );

    renderScreen();

    expect(screen.getByRole("heading", { name: "My reviews" })).toBeInTheDocument();
    expect(await screen.findByText("Dr. Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Dr. Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Very thorough.")).toBeInTheDocument();
    expect(screen.getByText("No comment left.")).toBeInTheDocument();
    expect(listMyReviews).toHaveBeenCalledWith({ page_size: 100 });
  });

  it("summarises how many reviews were written and the average rating given", async () => {
    listMyReviews.mockResolvedValue(
      envelope([
        review({ id: 1, rating: 5 }),
        review({ id: 2, doctor_name: "Dr. Grace Hopper", rating: 3 }),
      ])
    );

    const { container } = renderScreen();
    await screen.findByText("Dr. Ada Lovelace");

    const summary = container.querySelector(".my-reviews__summary") as HTMLElement;
    expect(summary).not.toBeNull();
    expect(within(summary).getByText("reviews written")).toBeInTheDocument();
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("4.0")).toBeInTheDocument();
  });

  it("flags a review hidden by an administrator", async () => {
    listMyReviews.mockResolvedValue(envelope([review({ is_visible: false })]));

    renderScreen();

    expect(await screen.findByText("Hidden by an administrator")).toBeInTheDocument();
  });

  it("shows the empty state when the patient has not written any reviews", async () => {
    listMyReviews.mockResolvedValue(envelope([]));

    renderScreen();

    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View my appointments" })).toBeInTheDocument();
  });

  it("surfaces a load failure with a retry action", async () => {
    listMyReviews.mockRejectedValue(new Error("Network down"));

    renderScreen();

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("MyReviewsScreen deletion", () => {
  it("deletes a review only after the inline confirmation is accepted", async () => {
    const user = userEvent.setup();
    listMyReviews.mockResolvedValue(envelope([review({ id: 7 })]));
    deleteReview.mockResolvedValue(undefined);

    renderScreen();

    await user.click(await screen.findByRole("button", { name: /delete review/i }));
    // Nothing has been sent yet — the row asks first.
    expect(screen.getByText("Delete this review?")).toBeInTheDocument();
    expect(deleteReview).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /yes, delete/i }));

    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(screen.queryByText("Dr. Ada Lovelace")).not.toBeInTheDocument()
    );
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("keeps the review when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    listMyReviews.mockResolvedValue(envelope([review({ id: 7 })]));

    renderScreen();

    await user.click(await screen.findByRole("button", { name: /delete review/i }));
    await user.click(screen.getByRole("button", { name: /keep it/i }));

    expect(deleteReview).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete this review?")).not.toBeInTheDocument();
    expect(screen.getByText("Dr. Ada Lovelace")).toBeInTheDocument();
  });

  it("keeps the review on screen when deletion fails", async () => {
    const user = userEvent.setup();
    listMyReviews.mockResolvedValue(envelope([review({ id: 7 })]));
    deleteReview.mockRejectedValue(new Error("Not allowed"));

    renderScreen();

    await user.click(await screen.findByRole("button", { name: /delete review/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));

    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith(7));
    expect(screen.getByText("Dr. Ada Lovelace")).toBeInTheDocument();
  });
});
