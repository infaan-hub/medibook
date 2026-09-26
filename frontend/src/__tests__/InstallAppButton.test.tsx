/**
 * "Download app" (A2HS) button tests (§22.1, §69).
 *
 * The deferred prompt lives in module scope — one capture per page load, just
 * like the browser — so the cases are ordered deliberately: the first expects a
 * pristine module, and later cases re-capture or consume the prompt through the
 * public API (`promptInstall`).
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallAppButton } from "../components/InstallAppButton";
import { ToastViewport } from "../components/ToastViewport";
import { detectPlatform, isDesktopApp, isIOSDevice, isStandalone, promptInstall } from "../pwa/installPrompt";
import { ToastProvider } from "../state/app-context";
import type { BeforeInstallPromptEvent } from "../types/pwa";

const DEFAULT_UA = window.navigator.userAgent;
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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

function renderButton(variant: "header" | "floating" | "block" = "header") {
  return render(
    <ToastProvider>
      <InstallAppButton variant={variant} />
      <ToastViewport />
    </ToastProvider>
  );
}

const downloadButton = () => screen.queryByRole("button", { name: "Download app" });

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  delete window.__mbDeferredInstallPrompt;
  delete window.__MB_DESKTOP__;
  setUserAgent(DEFAULT_UA);
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUserAgent(DEFAULT_UA);
});

describe("InstallAppButton", () => {
  it("shows the button even without an install path — opens the download sheet", async () => {
    renderButton("floating");
    const button = await screen.findByRole("button", { name: "Download app" });
    fireEvent.click(button);

    const sheet = await screen.findByRole("dialog", { name: /download medibook/i });
    expect(sheet).toBeInTheDocument();
    // Desktop sheet offers the Electron installer + web-app install steps.
    expect(screen.getByText(/download desktop app/i)).toBeInTheDocument();
    expect(screen.getByText(/install medibook/i)).toBeInTheDocument();
  });

  it("appears when beforeinstallprompt fires and installs on click", async () => {
    const { event, prompt } = fakeInstallEvent();
    renderButton("header");

    act(() => {
      window.dispatchEvent(event);
    });

    const button = await screen.findByRole("button", { name: "Download app" });
    expect(screen.queryByText("Install MediBook for a faster")).toBeNull();

    // Desktop browsers go through the download sheet → "Install now".
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: /install now/i }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    // Accepted install → confirmation toast and the CTA retires itself.
    expect(await screen.findByText(/installing medibook/i)).toBeInTheDocument();
    await waitFor(() => expect(downloadButton()).toBeNull());
  });

  it("installs directly on Android when a native prompt is available", async () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );
    const { event, prompt } = fakeInstallEvent();
    renderButton("header");
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Download app" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("re-appears for a prompt captured before React mounts (layout script)", async () => {
    const { event } = fakeInstallEvent();
    window.__mbDeferredInstallPrompt = event;
    act(() => {
      window.dispatchEvent(new Event("medibook:install-available"));
    });

    renderButton("floating");
    expect(await screen.findByRole("button", { name: "Download app" })).toBeInTheDocument();
  });

  it("stays hidden once the app runs standalone (installed)", async () => {
    stubMatchMedia(true);
    const { event } = fakeInstallEvent();
    window.__mbDeferredInstallPrompt = event;

    renderButton("header");
    await waitFor(() => expect(downloadButton()).toBeNull());
  });

  it("stays hidden inside the desktop app", () => {
    window.__MB_DESKTOP__ = true;
    renderButton("header");
    expect(downloadButton()).toBeNull();
  });

  it("guides iOS users to Share → Add to Home Screen", async () => {
    // Consume whatever prompt this file captured earlier (module scope = page load).
    await promptInstall();
    setUserAgent(IOS_UA);

    renderButton("floating");
    const button = await screen.findByRole("button", { name: "Download app" });
    fireEvent.click(button);

    expect(
      await screen.findByRole("heading", { name: /add to home screen/i })
    ).toBeInTheDocument();
  });
});

describe("installPrompt helpers", () => {
  it("isStandalone() follows the display-mode media query", () => {
    expect(isStandalone()).toBe(false);
    stubMatchMedia(true);
    expect(isStandalone()).toBe(true);
  });

  it("isIOSDevice() detects iPhone / iPadOS user agents", () => {
    expect(isIOSDevice()).toBe(false);
    setUserAgent(IOS_UA);
    expect(isIOSDevice()).toBe(true);
  });

  it("isDesktopApp() detects the Electron shell (preload flag)", () => {
    expect(isDesktopApp()).toBe(false);
    window.__MB_DESKTOP__ = true;
    expect(isDesktopApp()).toBe(true);
    // The desktop shell counts as installed → standalone too.
    expect(isStandalone()).toBe(true);
  });

  it("detectPlatform() sniffs ios / android / desktop from the UA", () => {
    expect(detectPlatform()).toBe("desktop");
    setUserAgent(IOS_UA);
    expect(detectPlatform()).toBe("ios");
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );
    expect(detectPlatform()).toBe("android");
  });
});
