/**
 * Realtime socket — single authenticated WebSocket per signed-in session.
 *
 * Architecture:
 * - ONE WebSocket to /ws/notifications/ (Vite proxies to the Next.js backend).
 * - Server pushes {"event", "payload"} into the user's personal group.
 * - Tracks connection state so pages can choose: WS events = primary, polling = fallback.
 * - Handles browser online/offline and tab visibility for automatic reconciliation.
 * - Exponential backoff reconnect (1s → 30s), ping keepalive every 25s.
 *
 * Events:
 *   notification.created   — new inbox row
 *   appointment.created    — booking was made involving me
 *   appointment.updated    — booking status changed
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { refreshAccessToken } from "../api/client";
import { tokenStore } from "../api/tokens";

export type RealtimeEvent =
  | "notification.created"
  | "appointment.created"
  | "appointment.updated"
  | string;

export type RealtimeHandler = (
  event: RealtimeEvent,
  payload: Record<string, unknown>
) => void;

const CLOSE_UNAUTHORIZED = 4001;
const MAX_BACKOFF_MS = 30_000;
const MAX_TOKEN_REFRESH_ATTEMPTS = 3;
const PING_INTERVAL_MS = 25_000;

type ConnectionListener = (connected: boolean) => void;

class RealtimeClient {
  private userId: number | null = null;
  private socket: WebSocket | null = null;
  private handlers = new Set<RealtimeHandler>();
  private connectionListeners = new Set<ConnectionListener>();
  private attempts = 0;
  private tokenRefreshAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private gaveUp = false;
  private _connected = false;
  private closing = false; // intentional close in progress
  private boundOnline: (() => void) | null = null;
  private boundOffline: (() => void) | null = null;
  private boundVisibility: (() => void) | null = null;

  /** Whether the notification WebSocket is currently open. */
  get connected(): boolean {
    return this._connected;
  }

  /** Subscribe to connection state changes. Returns unsubscribe. */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => { this.connectionListeners.delete(listener); };
  }

  private setConnected(val: boolean): void {
    if (this._connected === val) return;
    this._connected = val;
    for (const fn of this.connectionListeners) {
      try { fn(val); } catch { /* broken subscriber */ }
    }
  }

  /** Wire the socket to the signed-in user (null = signed out → disconnect). */
  setIdentity(userId: number | null): void {
    if (this.userId === userId) return;
    this.userId = userId;
    this.attempts = 0;
    this.tokenRefreshAttempts = 0;
    this.gaveUp = false;

    // Attach browser event listeners once.
    if (userId !== null && !this.boundOnline) {
      this.boundOnline = () => this.onBrowserOnline();
      this.boundOffline = () => this.onBrowserOffline();
      this.boundVisibility = () => this.onTabVisible();
      window.addEventListener("online", this.boundOnline);
      window.addEventListener("offline", this.boundOffline);
      document.addEventListener("visibilitychange", this.boundVisibility);
    }

    if (userId === null) {
      this.teardown();
      return;
    }
    this.open();
  }

  /** Subscribe a handler; returns the unsubscribe function. */
  subscribe(handler: RealtimeHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  /** Force an immediate reconnect attempt (e.g. after token refresh). */
  reconnect(): void {
    if (this.userId === null) return;
    this.closing = true;
    this.socket?.close();
    this.socket = null;
    this.closing = false;
    this.setConnected(false);
    this.attempts = 0;
    this.tokenRefreshAttempts = 0;
    this.gaveUp = false;
    this.open();
  }

  // ---- Private ----

  private open(): void {
    if (this.userId === null || this.socket) return;

    const token = tokenStore.getAccess();
    if (!token) {
      void refreshAccessToken().then((access) => {
        if (access && this.userId !== null) this.open();
        else this.gaveUp = true;
      });
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/notifications/?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
      this.startPing();
    };

    this.socket.onmessage = (message) => {
      let frame: { event?: string; payload?: Record<string, unknown> };
      try {
        frame = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (!frame.event || frame.event === "connected" || frame.event === "pong") return;
      const payload = frame.payload ?? {};
      for (const handler of [...this.handlers]) {
        try {
          handler(frame.event, payload);
        } catch {
          /* broken subscriber must not break others */
        }
      }
    };

    this.socket.onclose = (event) => {
      this.stopPing();
      this.socket = null;
      this.setConnected(false);

      // Intentional close (sign-out or teardown) — do not reconnect.
      if (this.closing || this.userId === null) return;

      // Token rejected: try to refresh once, with a hard limit to prevent loops.
      if (event.code === CLOSE_UNAUTHORIZED && !this.gaveUp) {
        if (this.tokenRefreshAttempts >= MAX_TOKEN_REFRESH_ATTEMPTS) {
          this.gaveUp = true;
          return;
        }
        this.tokenRefreshAttempts += 1;
        void refreshAccessToken().then((access) => {
          if (!access || this.userId === null) {
            this.gaveUp = true;
            return;
          }
          this.attempts = 0;
          this.open();
        });
        return;
      }
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.gaveUp || this.userId === null) return;
    const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private teardown(): void {
    this.closing = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.setConnected(false);
    this.closing = false;

    // Remove browser listeners.
    if (this.boundOnline) {
      window.removeEventListener("online", this.boundOnline);
      window.removeEventListener("offline", this.boundOffline!);
      document.removeEventListener("visibilitychange", this.boundVisibility!);
      this.boundOnline = null;
      this.boundOffline = null;
      this.boundVisibility = null;
    }
  }

  private onBrowserOnline(): void {
    // Network restored: reconnect immediately.
    if (this.userId !== null && !this._connected) {
      this.attempts = 0;
      this.gaveUp = false;
      this.open();
    }
  }

  private onBrowserOffline(): void {
    // Don't spam reconnection attempts while offline.
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private onTabVisible(): void {
    if (document.visibilityState === "visible" && this.userId !== null) {
      if (!this._connected) {
        // Tab became visible and WS is down: reconnect.
        this.attempts = 0;
        this.gaveUp = false;
        this.open();
      }
    }
  }
}

export const realtime = new RealtimeClient();

/**
 * React hook: run `handler` for every realtime event while mounted.
 * Stable across renders — the latest handler closure is always used.
 */
export function useRealtimeEvent(handler: RealtimeHandler): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(
    () =>
      realtime.subscribe((event, payload) => {
        ref.current(event, payload);
      }),
    []
  );
}

/**
 * React hook: returns the current WebSocket connection state.
 * Re-renders when connection state changes.
 */
export function useRealtimeConnected(): boolean {
  const [connected, setConnected] = useState(realtime.connected);
  useEffect(() => realtime.onConnectionChange(setConnected), []);
  return connected;
}

/**
 * React hook: connection-aware silent refresh.
 *
 * Strategy:
 * - On mount: initial load (shows skeleton).
 * - Every `interval` ms: silent refresh (no skeleton flicker).
 * - On realtime event matching `events`: immediate silent refresh.
 * - When WS reconnects after being down: immediate reconciliation refresh.
 * - When browser comes back online: immediate reconciliation refresh.
 * - All refreshes deduplicated (in-flight guard).
 */
export function useRealtimeSync({
  refresh,
  events = [],
  interval = 5_000,
  enabled = true,
}: {
  refresh: () => void;
  events?: string[];
  interval?: number;
  enabled?: boolean;
}): void {
  const connected = useRealtimeConnected();
  const inflight = useRef(false);
  const mounted = useRef(true);
  const wasConnected = useRef(connected);
  const lastRefresh = useRef(0);

  const safeRefresh = useCallback(() => {
    if (!enabled || inflight.current || !mounted.current) return;
    // Debounce: don't refresh more than once per 2 seconds
    const now = Date.now();
    if (now - lastRefresh.current < 2000) return;
    inflight.current = true;
    lastRefresh.current = now;
    try {
      refresh();
    } finally {
      // Reset inflight after a short delay to allow next refresh
      setTimeout(() => { inflight.current = false; }, 500);
    }
  }, [refresh, enabled]);

  // Polling fallback: always run, but the 2s debounce prevents flooding.
  useEffect(() => {
    if (!enabled) return;
    const poll = setInterval(safeRefresh, interval);
    return () => clearInterval(poll);
  }, [safeRefresh, interval, enabled]);

  // Realtime events: immediate refresh.
  useRealtimeEvent((event) => {
    if (events.length === 0 || events.includes(event)) {
      safeRefresh();
    }
  });

  // Reconnection reconciliation: WS was down, now back up.
  useEffect(() => {
    if (connected && !wasConnected.current) {
      // WS just reconnected — reconcile immediately.
      safeRefresh();
    }
    wasConnected.current = connected;
  }, [connected, safeRefresh]);

  // Browser online reconciliation.
  useEffect(() => {
    const handler = () => { if (navigator.onLine) safeRefresh(); };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [safeRefresh]);

  // Tab visibility reconciliation.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") safeRefresh();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [safeRefresh]);

  // Cleanup on unmount.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
}
