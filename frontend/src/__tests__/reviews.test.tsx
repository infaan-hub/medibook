import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { StarRating, DoctorReviewList } from "../components/reviews";
import type { Review } from "../api/types";

describe("StarRating", () => {
  it("renders 5 star buttons", () => {
    render(<StarRating value={0} />);
    expect(screen.getAllByRole("button", { name: /star/ })).toHaveLength(5);
  });

  it("marks stars up to value as filled", () => {
    render(<StarRating value={3} />);
    const stars = screen.getAllByRole("button", { name: /star/ });
    expect(stars[0]).toHaveClass("star-rating__star--filled");
    expect(stars[1]).toHaveClass("star-rating__star--filled");
    expect(stars[2]).toHaveClass("star-rating__star--filled");
    expect(stars[3]).not.toHaveClass("star-rating__star--filled");
    expect(stars[4]).not.toHaveClass("star-rating__star--filled");
  });

  it("calls onChange when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "4 stars" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("does not call onChange when readonly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} readonly />);
    await user.click(screen.getByRole("button", { name: "5 stars" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies size class", () => {
    const { container } = render(<StarRating value={0} size="lg" />);
    expect(container.firstChild).toHaveClass("star-rating", "star-rating--lg");
  });
});

describe("DoctorReviewList", () => {
  const reviews: Review[] = [
    {
      id: 1,
      appointment: 1,
      patient: 1,
      doctor: 1,
      doctor_name: "Dr. Ada Lovelace",
      rating: 5,
      comment: "Excellent doctor!",
      is_visible: true,
      created_at: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: 2,
      appointment: 2,
      patient: 2,
      doctor: 1,
      doctor_name: "Dr. Ada Lovelace",
      rating: 4,
      comment: "",
      is_visible: true,
      created_at: new Date(Date.now() - 7200_000).toISOString(),
    },
  ];

  it("renders empty state when no reviews", () => {
    render(<DoctorReviewList reviews={[]} />);
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("renders review cards", () => {
    render(<DoctorReviewList reviews={reviews} />);
    expect(screen.getByText("Excellent doctor!")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /star/ }).length).toBeGreaterThan(0);
  });
});
