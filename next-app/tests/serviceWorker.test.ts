/**
 * Service worker push handlers (public/service-worker.js).
 *
 * The delivery contract for every platform — iPhone Home Screen app, Android
 * Chrome, desktop Chrome/Firefox/Safari:
 *  - a `push` event always produces a visible notification (Safari revokes the
 *    subscription after silent pushes), always inside `event.waitUntil`, even
 *    when the payload is not JSON or `showNotification` rejects;
 *  - a `notificationclick` opens the URL the notification carries, whether or
 *    not a window is already running (WebKit's `matchAll` can return empty).
 *
 * The worker is executed from source in a `node:vm` sandbox, so the test runs
 * the exact file that gets deployed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";

type Listener = (event: Record<string, unknown>) => void;

const SW_PATH = path.resolve(process.cwd(), "public/service-worker.js");

function loadServiceWorker() {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn(
    async (title?: string, options?: Record<string, unknown>) => {
      void title;
      void options;
      return undefined;
    }
  );
  const openWindow = vi.fn(async (url?: string) => {
    void url;
    return {};
  });
  const focus = vi.fn(async (client?: unknown) => {
    void client;
    return {};
  });
  const navigate = vi.fn(async (url?: string) => {
    void url;
    return {};
  });
  const matchAll = vi.fn(async () => [] as unknown[]);

  const self = {
    addEventListener(type: string, fn: Listener) {
      listeners[type] = fn;
    },
    location: { origin: "https://medibook.test" },
    registration: { showNotification },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll,
      openWindow,
    },
    skipWaiting: vi.fn(() => undefined),
  };

  const sandbox = {
    self,
    caches: {
      open: vi.fn(async () => ({
        add: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
        match: vi.fn(async () => undefined),
      })),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
      match: vi.fn(async () => undefined),
    },
    fetch: vi.fn(async () => new Response("")),
    Response,
    URL,
    console,
    Promise,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  vm.runInContext(readFileSync(SW_PATH, "utf8"), sandbox);

  return { listeners, showNotification, openWindow, focus, navigate, matchAll, self };
}

/** Dispatch an event and resolve with whatever was passed to `waitUntil`. */
function dispatch(
  listeners: Record<string, Listener>,
  type: string,
  event: Record<string, unknown>
): Promise<unknown> | undefined {
  const listener = listeners[type];
  if (!listener) throw new Error(`service worker has no "${type}" listener`);
  let waited: Promise<unknown> | undefined;
  listener({
    waitUntil: (promise: Promise<unknown>) => {
      waited = promise;
    },
    ...event,
  });
  return waited;
}

function jsonData(payload: unknown) {
  return { json: () => payload as never, text: () => JSON.stringify(payload) };
}

function brokenData(text: string) {
  return {
    json: () => {
      throw new Error("not json");
    },
    text: () => text,
  };
}

describe("service worker — push", () => {
  it("shows the payload's title/body and opens the target URL", async () => {
    const sw = loadServiceWorker();
    await dispatch(sw.listeners, "push", {
      data: jsonData({
        title: "Appointment accepted",
        body: "Dr. Smith confirmed your visit.",
        url: "/appointments/42",
        tag: "appointment-42",
      }),
    });

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(title).toBe("Appointment accepted");
    expect(options.body).toBe("Dr. Smith confirmed your visit.");
    expect(options.data).toEqual({ url: "/appointments/42" });
    expect(options.tag).toBe("appointment-42");
  });

  it("falls back to a default notification when there is no payload", async () => {
    const sw = loadServiceWorker();
    await dispatch(sw.listeners, "push", { data: null });

    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(title).toBe("MediBook");
    expect(options.body).toBe("You have a new appointment update.");
    expect(options.data).toEqual({ url: "/notifications" });
  });

  it("still shows a notification when the payload is plain text", async () => {
    const sw = loadServiceWorker();
    await dispatch(sw.listeners, "push", { data: brokenData("hello there") });

    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(title).toBe("MediBook");
    expect(options.body).toBe("hello there");
  });

  it("never leaves a silent push when showNotification rejects (Safari revokes)", async () => {
    const sw = loadServiceWorker();
    sw.showNotification
      .mockRejectedValueOnce(new Error("unsupported option"))
      .mockResolvedValueOnce(undefined);

    const waited = dispatch(sw.listeners, "push", { data: jsonData({ title: "Hi" }) });
    await expect(waited).resolves.not.toThrow();
    expect(sw.showNotification).toHaveBeenCalledTimes(2);
  });
});

describe("service worker — notificationclick", () => {
  function notification(url?: string) {
    return { close: vi.fn(), data: url ? { url } : undefined };
  }

  it("focuses the window already showing the notification's URL", async () => {
    const sw = loadServiceWorker();
    const existing = { url: "https://medibook.test/appointments/42", focus: sw.focus };
    sw.matchAll.mockResolvedValueOnce([existing]);

    await dispatch(sw.listeners, "notificationclick", { notification: notification("/appointments/42") });

    expect(existing.focus).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).not.toHaveBeenCalled();
    expect(sw.navigate).not.toHaveBeenCalled();
  });

  it("navigates an open window that is on a different page", async () => {
    const sw = loadServiceWorker();
    const other = {
      url: "https://medibook.test/",
      focus: sw.focus,
      navigate: sw.navigate,
    };
    sw.matchAll.mockResolvedValueOnce([other]);

    await dispatch(sw.listeners, "notificationclick", { notification: notification("/notifications") });

    expect(other.focus).toHaveBeenCalled();
    expect(sw.navigate).toHaveBeenCalledWith("/notifications");
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("opens the URL when no window is running (iOS PWA, closed app)", async () => {
    const sw = loadServiceWorker();
    sw.matchAll.mockResolvedValueOnce([]);

    await dispatch(sw.listeners, "notificationclick", { notification: notification("/appointments/42") });

    expect(sw.openWindow).toHaveBeenCalledWith("/appointments/42");
  });

  it("opens the URL when the running window cannot navigate (Safari)", async () => {
    const sw = loadServiceWorker();
    const other = { url: "https://medibook.test/", focus: sw.focus };
    sw.matchAll.mockResolvedValueOnce([other]);

    await dispatch(sw.listeners, "notificationclick", { notification: notification("/appointments/42") });

    expect(sw.openWindow).toHaveBeenCalledWith("/appointments/42");
  });

  it("closes the notification and defaults to / when none was attached", async () => {
    const sw = loadServiceWorker();
    const closed = vi.fn();
    sw.matchAll.mockResolvedValueOnce([]);

    await dispatch(sw.listeners, "notificationclick", { notification: { close: closed } });

    expect(closed).toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith("/");
  });
});
