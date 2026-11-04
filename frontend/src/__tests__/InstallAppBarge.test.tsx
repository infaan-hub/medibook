/**
 * "Download app" barge + how-to-install popup tests (§22.1, §69).
 *
 * The barge replaces the old header install button: a badge on the right
 * edge (middle of the viewport) that opens the install instructions.
 * The combined action installs when a native prompt is available and
 * dismisses after the user has read the manual steps otherwise.
 *
 * The deferred prompt lives in module scope — one capture per page load,
 * just like the browser — so only the case that needs it captures the event
 * through the public listener.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InstallAppBarge,
  InstallInfoDialog,
  useInstallCta,
} from "../components/InstallAppBarge";
import { ToastViewport } from "../components/ToastViewport";
import { ToastProvider } from "../state/app-context";
import type { BeforeInstallPromptEvent } from "../types/pwa";

const DEFAULT_UA = window.navigator.userAgent;
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DISMISSED_KEY = "medibook_install_barge_dismissed";

/** Minimal MediaQueryList stub — jsdom ships no matchMedia. */
function stubMatchMedia(standalone: boolean) {
  const list = {
    matches: standalone,
    media: "(display-mode: standalone)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => list),
  );
  return list;
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
}

/** A stand-in for Chromium's real BeforeInstallPromptEvent. */
function fakeInstallEvent() {
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    platforms: ["web"],
  });
  return { event, prompt };
}

/** Mirrors exactly how AppShell wires the three pieces together. */
function CtaHarness() {
  const cta = useInstallCta();
  return (
    <>
      <InstallAppBarge visible={cta.bargeVisible} onOpen={cta.show} />
      <InstallInfoDialog
        open={cta.open}
        onClose={cta.close}
        onGotIt={cta.dismiss}
        installable={cta.installable}
        install={cta.install}
      />
      <ToastViewport />
    </>
  );
}

function renderCta() {
  return render(
    <ToastProvider>
      <CtaHarness />
    </ToastProvider>
  );
}

/** The barge carries title="Download app"; the popup button is scoped by role. */
const barge = () => screen.queryByTitle("Download app");

beforeEach(() => {
  window.localStorage.clear();
  delete window.__mbDeferredInstallPrompt;
  setUserAgent(DEFAULT_UA);
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUserAgent(DEFAULT_UA);
});

describe("InstallAppBarge", () => {
  it("opens the popup from the barge and installs on desktop/Android", async () => {
    const { event, prompt } = fakeInstallEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    renderCta();

    // The barge (right edge, middle) shows while the app is not installed.
    fireEvent.click(await screen.findByTitle("Download app"));

    // Shared Chrome/Safari instructions and one combined action.
    const dialog = await screen.findByRole("dialog", {
      name: /download the medibook app/i,
    });
    expect(within(dialog).getByText(/quick and easy access anytime/i)).toBeInTheDocument();
    expect(within(dialog).getByText("For Google Chrome:")).toBeInTheDocument();
    expect(within(dialog).getByText("For Safari (Mac):")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Got it, Download App" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Got it, Download App" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/installing medibook/i)).toBeInTheDocument();
    // Accepted install closes the popup and retires the barge.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(barge()).toBeNull());
  });

  it("shows Safari installation steps and dismisses after Got it", async () => {
    setUserAgent(IOS_UA);
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download the medibook app/i,
    });
    expect(within(dialog).getByText(/open safari's menu bar and click/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/add to homescreen/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Got it, Download App" }));
    // Popup closed, dismissal persisted, barge gone for good.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
    expect(barge()).toBeNull();

    // A fresh mount (next page load) keeps it hidden.
    renderCta();
    expect(barge()).toBeNull();
  });

  it("stays hidden once the app runs standalone (installed)", () => {
    stubMatchMedia(true);
    renderCta();
    expect(barge()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the requested Chrome and Safari steps when the browser cannot install", async () => {
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download the medibook app/i,
    });
    expect(within(dialog).getByText("Tap the Download App button.")).toBeInTheDocument();
    expect(within(dialog).getByText("Follow the instructions to complete the installation.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Got it, Download App" })).toBeInTheDocument();
  });

  it("uses the same install description on Android", async () => {
    setUserAgent(ANDROID_UA);
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download the medibook app/i,
    });
    expect(within(dialog).getByText("For Google Chrome:")).toBeInTheDocument();
    expect(within(dialog).getByText("For Safari (Mac):")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Got it, Download App" })).toBeInTheDocument();
  });

  it("closes via the X without dismissing the barge", async () => {
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download the medibook app/i,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /close dialog/i }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The barge is still there and nothing was persisted.
    expect(screen.getByTitle("Download app")).toBeInTheDocument();
    expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
  });
});
