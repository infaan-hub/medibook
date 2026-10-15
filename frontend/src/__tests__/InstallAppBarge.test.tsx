/**
 * "Download app" barge + how-to-install popup tests (§22.1, §69).
 *
 * The barge replaces the old header install button: a badge on the right
 * edge (middle of the viewport) that opens a device-specific popup.
 * "Got it" dismisses the barge for good; Android/desktop also get a
 * "Download app" button that runs the native install; iOS only gets the
 * Share → Add to Home Screen steps.
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
        isIOS={cta.isIOS}
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

    // Device-specific description + "Download app" + "Got it".
    const dialog = await screen.findByRole("dialog", {
      name: /download medibook app/i,
    });
    expect(
      within(dialog).getByText(/shortcut is added to your desktop/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /download app/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /got it/i }),
    ).toBeInTheDocument();

    // One tap on Download app runs the native install.
    fireEvent.click(within(dialog).getByRole("button", { name: /download app/i }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/installing medibook/i)).toBeInTheDocument();
    // Accepted install closes the popup and retires the barge.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(barge()).toBeNull());
  });

  it("guides iOS users with steps and only a Got it button, then hides the barge", async () => {
    setUserAgent(IOS_UA);
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download medibook app/i,
    });
    expect(within(dialog).getByText(/add to home screen/i)).toBeInTheDocument();
    // WebKit has no install prompt — iOS gets no Download app button.
    expect(
      within(dialog).queryByRole("button", { name: /download app/i }),
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /got it/i }));
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

  it("shows device-specific manual steps when the browser cannot install", async () => {
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download medibook app/i,
    });
    // jsdom's UA is desktop → desktop browser-menu instructions, not a
    // generic "can't install" text.
    expect(within(dialog).getByText(/open the browser menu/i)).toBeInTheDocument();
    // Android/desktop keep the Download app button even without a prompt —
    // the tap waits for a late beforeinstallprompt.
    expect(
      within(dialog).getByRole("button", { name: /download app/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /got it/i }),
    ).toBeInTheDocument();
  });

  it("describes the manual three-dot-menu path on Android", async () => {
    setUserAgent(ANDROID_UA);
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download medibook app/i,
    });
    expect(within(dialog).getByText(/three-dot menu/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/add to home screen/i)).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/open the browser menu/i),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: /download app/i }),
    ).toBeInTheDocument();
  });

  it("closes via the X without dismissing the barge", async () => {
    renderCta();

    fireEvent.click(await screen.findByTitle("Download app"));
    const dialog = await screen.findByRole("dialog", {
      name: /download medibook app/i,
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
