import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OnboardingScreen } from "../screens/auth";
import { ToastProvider } from "../state/app-context";

describe("OnboardingScreen", () => {
  // ToastProvider is required because the "Get MediBook as an App" slide
  // renders the "Download app" (A2HS) button, which reports iOS install
  // guidance through a toast. Route stubs let us assert navigation targets.
  const renderFlow = (initial = "/onboarding") =>
    render(
      <MemoryRouter initialEntries={[initial]}>
        <ToastProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingScreen />} />
            <Route
              path="/onboarding/welcome"
              element={<div data-testid="route-welcome" />}
            />
            <Route path="/login" element={<div data-testid="route-login" />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

  const logoImages = () =>
    screen
      .getAllByRole("img")
      .filter((img) => img.getAttribute("src")?.includes("logo.jpeg"));

  const goNext = () => fireEvent.click(screen.getByRole("button", { name: /next/i }));
  const heading = (name: RegExp) =>
    screen.getByRole("heading", { name, level: 1 });

  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the brand row, four slides and four pagination dots", () => {
    const { container } = renderFlow();
    expect(screen.getByRole("button", { name: /skip/i })).toHaveClass(
      "ab-onboarding__skip"
    );
    expect(container.querySelectorAll(".ab-onboarding__slide")).toHaveLength(4);
    expect(container.querySelectorAll(".ab-dots__dot")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    // Back exists but is disabled on the first slide.
    const back = screen.getByRole("button", { name: /back/i });
    expect(back).toBeDisabled();
  });

  it("opens on the Welcome slide with the real logo and the agenda", () => {
    renderFlow();
    expect(heading(/welcome to medibook/i)).toBeInTheDocument();
    expect(screen.getByText(/your guide to getting mediBook ready/i)).toBeInTheDocument();
    const logos = logoImages();
    expect(logos).toHaveLength(2);
    const widths = logos.map((img) => img.getAttribute("width"));
    expect(widths).toContain("36");
    expect(widths).toContain("96");
    expect(logos.some((img) => img.className.includes("ab-onboarding__hero-logo"))).toBe(true);
    for (const agenda of [
      "Allow location",
      "Turn on notifications",
      "Install MediBook as an app",
      "Use MediBook comfortably on phone and desktop",
    ]) {
      expect(screen.getByText(agenda)).toBeInTheDocument();
    }
  });

  it("renders every procedure image and labels mockups as examples", () => {
    const { container } = renderFlow();
    for (const src of [
      "tutorial-location-android.svg",
      "tutorial-location-iphone.svg",
      "tutorial-location.svg",
      "tutorial-notifications-android.svg",
      "tutorial-notifications.svg",
      "tutorial-install-android.svg",
      "tutorial-install-iphone.svg",
      "tutorial-install-desktop.svg",
      "onboarding/location-prompt-card.png",
      "onboarding/notification-prompt-card.png",
      "onboarding/install-ios-steps-card.png",
      "onboarding/download-button.png",
    ]) {
      expect(container.querySelector(`img[src*="${src}"]`), src).toBeInTheDocument();
    }
    // All 8 mockup captions carry the "Example ..." disclaimer.
    const exampleCaptions = container.querySelectorAll(
      ".ab-onboarding__caption--example"
    );
    expect(exampleCaptions).toHaveLength(8);
    expect(exampleCaptions[0].textContent).toMatch(/Example — your screen may look/);
    // Real screenshots get factual captions instead of the example label.
    expect(container.querySelectorAll(".ab-onboarding__caption:not(.ab-onboarding__caption--example)"))
      .toHaveLength(5);
  });

  it("preselects Computer on desktop and lets every platform be selected", () => {
    const { container } = renderFlow();
    goNext(); // Slide 2: Allow Location
    expect(heading(/allow location/i)).toBeInTheDocument();
    // Three device tabs are always available.
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    // jsdom identifies as desktop; detection only ever preselects a tab.
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(/computer/i);
    expect(screen.getAllByText("Suggested")).toHaveLength(3);

    const androidTab = screen.getByRole("tab", { name: /android/i });
    fireEvent.click(androidTab);
    expect(androidTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(/android/i);
    expect(container.querySelector("#ob-panel-1-android")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#ob-panel-1-desktop")).toHaveAttribute("hidden");

    const iphoneTab = screen.getByRole("tab", { name: /iphone/i });
    fireEvent.click(iphoneTab);
    expect(container.querySelector("#ob-panel-1-iphone")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#ob-panel-1-android")).toHaveAttribute("hidden");
  });

  it("pages forward with Next and back with Back", () => {
    renderFlow();
    goNext();
    expect(heading(/allow location/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeEnabled();
    goNext();
    expect(heading(/turn on notifications/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(heading(/allow location/i)).toBeInTheDocument();
  });

  it("turns the last Next into Get Started and routes to the welcome screen", () => {
    renderFlow();
    for (let i = 0; i < 3; i += 1) goNext();
    expect(heading(/get mediBook as an app/i)).toBeInTheDocument();
    const start = screen.getByRole("button", { name: /get started/i });
    expect(start).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^next$/i })).not.toBeInTheDocument();
    // The install slide offers the live Download app button.
    expect(screen.getByRole("button", { name: /download app/i })).toBeInTheDocument();
    fireEvent.click(start);
    expect(localStorage.getItem("medibook_onboarding_completed")).toBe("1");
    expect(screen.getByTestId("route-welcome")).toBeInTheDocument();
  });

  it("marks the current dot with aria-current and jumps on dot clicks", () => {
    renderFlow();
    const firstDot = screen.getByRole("button", { name: /go to slide 1:/i });
    expect(firstDot).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: /go to slide 4:/i }));
    expect(heading(/get mediBook as an app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to slide 4:/i })).toHaveAttribute(
      "aria-current",
      "step"
    );
    expect(firstDot).not.toHaveAttribute("aria-current");
  });

  it("pages the slides with the arrow keys", () => {
    renderFlow();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(heading(/allow location/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(heading(/turn on notifications/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(heading(/allow location/i)).toBeInTheDocument();
    // Never leaves the first slide.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(heading(/welcome to medibook/i)).toBeInTheDocument();
  });

  it("swipes between slides", () => {
    const { container } = renderFlow();
    const main = container.querySelector(".ab-onboarding") as HTMLElement;
    fireEvent.touchStart(main, { touches: [{ clientX: 240, clientY: 300 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 300 }] });
    expect(heading(/allow location/i)).toBeInTheDocument();
    fireEvent.touchStart(main, { touches: [{ clientX: 80, clientY: 300 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 240, clientY: 300 }] });
    expect(heading(/welcome to medibook/i)).toBeInTheDocument();
  });

  it("completes the tour on Skip and routes to the welcome screen", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(localStorage.getItem("medibook_onboarding_completed")).toBe("1");
    expect(screen.getByTestId("route-welcome")).toBeInTheDocument();
  });

  it("marks the tour complete and routes to sign in from Sign In", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(localStorage.getItem("medibook_onboarding_completed")).toBe("1");
    expect(screen.getByTestId("route-login")).toBeInTheDocument();
  });
});
