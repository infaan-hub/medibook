/**
 * Realtime socket (PHASE 13 — live updates without refreshing).
 *
 * One WebSocket per signed-in session, connected to the backend's
 * /ws/notifications/ channel (vite proxies /ws to Daphne). The server pushes
 * {"event", "payload"} frames into the signed-in user's personal group:
 *
 *   notification.created   — a new inbox row for me (bell badge, inbox, toast)
 *   appointment.created    — a booking was made that involves me
 *   appointment.updated    — a booking I'm part of changed status
 *
 * - Identity: `realtime.setIdentity(user.id | null)` from SessionProvider.
 *   Passing null (sign-out) closes the socket so a logged-out tab stops
 *   receiving pushes immediately.
 * - Auth: browsers cannot set headers on the WS handshake, so the SimpleJWT
 *   access token rides in ?token=. On close 4001 (bad/expired token) the
 *   manager transparently refreshes the token via the shared single-flight
 *   refresh before the next attempt; if refresh fails it stops retrying.
 * - Resilience: exponential backoff (1s → 30s), and a ping keepalive every
 *   25s so proxies don't idle-drop the connection.
 */

import { useEffect, useRef } from "react";
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
const PING_INTERVAL_MS = 25_000;

class RealtimeClient {
  private userId: number | null = null;
  private socket: WebSocket | null = null;
  private handlers = new Set<RealtimeHandler>();
  private attempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private gaveUp = false;

  /** Wire the socket to the signed-in user (null = signed out → disconnect). */
  setIdentity(userId: number | null): void {
    if (this.userId === userId) return;
    this.userId = userId;
    this.attempts = 0;
    this.gaveUp = false;
    if (userId === null) {
      this.teardown();
      return;
    }
    this.open();
  }

  /** Subscribe a handler; returns the unsubscribe function. */
  subscribe(handler: RealtimeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private open(): void {
    if (this.userId === null || this.socket) return;

    const token = tokenStore.getAccess();
    if (!token) {
      // No access token in memory — try the silent refresh once, then retry.
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
      this.startPing();
    };

    this.socket.onmessage = (message) => {
      let frame: { event?: string; payload?: Record<string, unknown> };
      try {
        frame = JSON.parse(String(message.data));
      } catch {
        return; // Ignore malformed frames.
      }
      if (!frame.event || frame.event === "connected" || frame.event === "pong") return;
      const payload = frame.payload ?? {};
      for (const handler of [...this.handlers]) {
        try {
          handler(frame.event, payload);
        } catch {
          /* a broken subscriber must not break the others */
        }
      }
    };

    this.socket.onclose = (event) => {
      this.stopPing();
      this.socket = null;
      if (this.userId === null) return; // Signed out — stay closed.

      if (event.code === CLOSE_UNAUTHORIZED && !this.gaveUp) {
        // Token rejected: refresh once through the shared single-flight helper.
        void refreshAccessToken().then((access) => {
          if (!access) {
            this.gaveUp = true; // Session is really gone; polling covers us.
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
