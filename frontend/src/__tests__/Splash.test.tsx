import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SplashScreen, UpdatePrompt } from "../components/Splash";

describe("SplashScreen", () => {
  it("renders the brand logo and name", () => {
    render(<SplashScreen hidden={false} />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("MediBook")).toBeInTheDocument();
  });

  it("applies splash--hidden class when hidden", () => {
    const { container } = render(<SplashScreen hidden={true} />);
    expect(container.firstChild).toHaveClass("splash--hidden");
  });

  it("sets aria-hidden when hidden", () => {
    render(<SplashScreen hidden={true} />);
    expect(screen.getByText("M").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});

describe("UpdatePrompt", () => {
  it("renders nothing when no update event fired", () => {
    const { container } = render(<UpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("shows prompt after medibook:update-ready event", async () => {
    render(<UpdatePrompt />);
    window.dispatchEvent(new Event("medibook:update-ready"));
    await waitFor(() => {
      expect(screen.getByText(/new version/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });
});
