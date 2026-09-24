import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OnboardingScreen } from "../pages/auth";

describe("OnboardingScreen", () => {
  const renderWithRouter = () =>
    render(
      <MemoryRouter>
        <OnboardingScreen />
      </MemoryRouter>
    );

  it("renders the Skip button at the top", () => {
    renderWithRouter();
    const skipBtn = screen.getByRole("button", { name: /skip/i });
    expect(skipBtn).toBeInTheDocument();
    expect(skipBtn).toHaveClass("ab-onboarding__skip");
  });

    it("renders the new onboarding medical image (not medicare)", () => {
    const { container } = renderWithRouter();
    const onboardingImg = container.querySelector(
      'img[src*="onboarding-medical.jpeg"]'
    );
    expect(onboardingImg).toBeInTheDocument();
  });

  it("renders the very small logo (logo.jpeg) below the image", () => {
    renderWithRouter();
    const imgs = screen.getAllByRole("img");
    const logoImg = imgs.find((img) =>
      img.getAttribute("src")?.includes("logo.jpeg")
    );
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveClass("ab-onboarding__logo");
    expect(logoImg).toHaveAttribute("width", "20");
    expect(logoImg).toHaveAttribute("height", "20");
  });

  it("renders the slide title and description", () => {
    renderWithRouter();
    expect(screen.getByText("Easy Medicare")).toBeInTheDocument();
    expect(
      screen.getByText(/Book appointments, consult doctors/)
    ).toBeInTheDocument();
  });

  it("renders pagination dots", () => {
    renderWithRouter();
    const dotsContainer = document.querySelector(".ab-dots");
    expect(dotsContainer).toBeInTheDocument();
    expect(dotsContainer?.children).toHaveLength(3);
  });

  it("renders Sign In and Next action buttons", () => {
    renderWithRouter();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("advances to next slide when Next is clicked", () => {
    renderWithRouter();
    expect(screen.getByText("Easy Medicare")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Safe Medicare")).toBeInTheDocument();
  });

  it("sets medibook_onboarding_completed in localStorage when Skip is clicked", () => {
    localStorage.clear();
    renderWithRouter();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(localStorage.getItem("medibook_onboarding_completed")).toBe("1");
  });
});