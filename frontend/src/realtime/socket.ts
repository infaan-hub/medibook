/**
 * Realtime socket — single authenticated WebSocket per signed-in session.
 *
 * - ONE WebSocket to /ws/notifications/ (Vite proxies to the Next.js backend).
 * - Server frames are §realtime envelopes: {id, type, event, timestamp, version, entity_id, payload}.
 * - Legacy frames {event, payload} are accepted and treated as versionless.
 * - Dedup by envelope id; drop stale versions per entity key (entity type from event prefix).
 * - Connection status: connected | connecting | disconnected | reconnecting | offline.
 * - Polling is a FALLBACK only (useRealtimeSync): low-frequency, offline/visibility aware.
 * - Jittered exponential backoff reconnect (1s → 30s), ping keepalive every 25s.
 *
 * Events (no chat):
 *   notification.created / notification.updated
 *   appointment.created / appointment.updated / appointment.deleted
 *   doctor.availability.updated
 *   connected / pong (control frames, not delivered to app handlers)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { refreshAccessToken } from "../api/client";
import { tokenStore } from "../api/tokens";

export type RealtimeEvent =
  | "notification.created"
  | "notification.updated"
  | "appointment.created"
  | "appointment.updated"
  | "appointment.deleted"
  | "doctor.availability.updated"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "doctor.created"
  | "doctor.updated"
  | "doctor.deleted"
  | string;

export type RealtimeHandler = (
  event: RealtimeEvent,
  payload: Record<string, unknown>,
  meta?: { id?: string; version?: number; entityId?: string | number; timestamp?: string }
) => void;

export type RealtimeStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting"
  | "offline";

export interface RealtimeEnvelope {
  id?: string;
  type?: string;
  event: string;
  timestamp?: string;
  version?: number;
  entity_id?: string | number | null;
  payload?: Record<string, unknown>;
}

const CLOSE_UNAUTHORIZED = 4001;
const MAX_BACKOFF_MS = 30_000;
const MAX_TOKEN_REFRESH_ATTEMPTS = 3;
const PING_INTERVAL_MS = 25_000;
const DEDUP_MAX = 500;

/** Fallback poll interval when WS is down (useRealtimeSync). */
export const FALLBACK_POLL_INTERVAL_MS = 12_000;

type ConnectionListener = (connected: boolean) => void;
type StatusListener = (status: RealtimeStatus) => void;

function entityKey(event: string, entityId: string | number | null | undefined): string | null {
  if (entityId === null || entityId === undefined || entityId === "") return null;
  // Event shapes: appointment.updated → appointment; doctor.availability.updated → doctor
  const prefix = event.split(".")[0];
  if (!prefix) return null;
  return `${prefix}:${String(entityId)}`;
}

class RealtimeClient {
  private userId: number | null = null;
  private socket: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private handlers = new Set<RealtimeHandler>();
  private connectionListeners = new Set<ConnectionListener>();
  private statusListeners = new Set<StatusListener>();
  private attempts = 0;
  private tokenRefreshAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private gaveUp = false;
  private _connected = false;
  private _status: RealtimeStatus = "disconnected";
  private closing = false;
  private boundOnline: (() => void) | null = null;
  private boundOffline: (() => void) | null = null;
  private boundVisibility: (() => void) | null = null;
  /** Seen envelope ids (ring buffer) for at-least-once → effectively-once. */
  private seenIds = new Set<string>();
  private seenOrder: string[] = [];
  /** Highest applied version per entity key. */
  private versions = new Map<string, number>();

  get connected(): boolean {
    return this._connected;
  }

  get status(): RealtimeStatus {
    return this._status;
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => { this.connectionListeners.delete(listener); };
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this._status);
    return () => { this.statusListeners.delete(listener); };
  }

  private setStatus(status: RealtimeStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const fn of this.statusListeners) {
      try { fn(status); } catch { /* broken subscriber */ }
    }
  }

  private setConnected(val: boolean): void {
    if (this._connected === val) return;
    this._connected = val;
    for (const fn of this.connectionListeners) {
      try { fn(val); } catch { /* broken subscriber */ }
    }
  }

  setIdentity(userId: number | null): void {
    if (this.userId === userId) return;
    this.userId = userId;
    this.attempts = 0;
    this.tokenRefreshAttempts = 0;
    this.gaveUp = false;
    this.seenIds.clear();
    this.seenOrder = [];
    this.versions.clear();

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

  subscribe(handler: RealtimeHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

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

  /** Test/debug: reset ordering state (dedup + versions). */
  resetOrderingState(): void {
    this.seenIds.clear();
    this.seenOrder = [];
    this.versions.clear();
  }

  /** Returns false when the envelope was a duplicate or a stale version. */
  private shouldDeliver(frame: RealtimeEnvelope): boolean {
    const id = frame.id;
    if (id) {
      if (this.seenIds.has(id)) return false;
      this.seenIds.add(id);
      this.seenOrder.push(id);
      if (this.seenOrder.length > DEDUP_MAX) {
        const oldest = this.seenOrder.shift();
        if (oldest) this.seenIds.delete(oldest);
      }
    }

    const key = entityKey(frame.event, frame.entity_id);
    const version = typeof frame.version === "number" ? frame.version : undefined;
    if (key && version !== undefined) {
      const prev = this.versions.get(key);
      if (prev !== undefined && version < prev) return false;
      this.versions.set(key, Math.max(prev ?? 0, version));
    }
    return true;
  }

  private deliver(frame: RealtimeEnvelope): void {
    if (frame.event === "connected" || frame.event === "pong") return;
    if (!frame.event) return;
    if (!this.shouldDeliver(frame)) return;
    const payload = frame.payload ?? {};
    const meta = {
      id: frame.id,
      version: frame.version,
      entityId: frame.entity_id ?? undefined,
      timestamp: frame.timestamp,
    };
    for (const handler of [...this.handlers]) {
      try {
        handler(frame.event, payload, meta);
      } catch {
        /* broken subscriber must not break others */
      }
    }
  }

  /** Open SSE (EventSource) fallback when WebSocket is unavailable (e.g. Vercel). */
  private openSSE(): void {
    if (this.userId === null || this.eventSource) return;

    this.setStatus(this.attempts > 0 ? "reconnecting" : "connecting");
    const token = tokenStore.getAccess();
    if (!token) {
      void refreshAccessToken().then((access) => {
        if (access && this.userId !== null) this.openSSE();
        else this.gaveUp = true;
      });
      return;
    }

    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const base = process.env.NEXT_PUBLIC_WS_URL 
      ? process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, "").replace(/^wss?:/, protocol)
      : `${protocol}://${window.location.host}`;
    const url = `${base}/ws/notifications/sse/?token=${encodeURIComponent(token)}`;

    try {
      this.eventSource = new EventSource(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.eventSource.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
      this.setStatus("connected");
    };

    this.eventSource.onmessage = (message) => {
      let frame: RealtimeEnvelope;
      try {
        frame = JSON.parse(message.data) as RealtimeEnvelope;
      } catch {
        return;
      }
      this.deliver(frame);
    };

    this.eventSource.onerror = (_event) => {
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.cleanupSSE();
        if (!this.closing && this.userId !== null) {
          this.scheduleReconnect();
        }
      }
    };
  }

  private cleanupSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setConnected(false);
  }

  private open(): void {
    if (this.userId === null || this.socket) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return;
    }

    this.setStatus(this.attempts > 0 ? "reconnecting" : "connecting");

    const token = tokenStore.getAccess();
    if (!token) {
      void refreshAccessToken().then((access) => {
        if (access && this.userId !== null) this.open();
        else this.gaveUp = true;
      });
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    // Production may host the persistent WS on another origin (Vercel HTTP API
    // cannot host long-lived sockets). Prefer NEXT_PUBLIC_WS_URL when set; otherwise
    // same-origin /ws/notifications/.
    const configured = process.env.NEXT_PUBLIC_WS_URL as string | undefined;
    let base = configured?.replace(/\/+$/, "");
    if (!base) {
      base = `${protocol}://${window.location.host}`;
    } else if (base.startsWith("ws://") || base.startsWith("wss://")) {
      // keep as-is
    } else {
      base = `${protocol}://${base}`;
    }
    const url = `${base}/ws/notifications/?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.openSSE();
      return;
    }

    this.socket.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
      this.setStatus("connected");
      this.startPing();
    };

    this.socket.onmessage = (message) => {
      let frame: RealtimeEnvelope;
      try {
        frame = JSON.parse(String(message.data)) as RealtimeEnvelope;
      } catch {
        return;
      }
      // Legacy frames {event, payload} without envelope fields still work.
      this.deliver(frame);
    };

    this.socket.onclose = (event) => {
      this.stopPing();
      this.socket = null;
      this.setConnected(false);

      if (this.closing || this.userId === null) {
        this.setStatus("disconnected");
        return;
      }

      if (event.code === CLOSE_UNAUTHORIZED && !this.gaveUp) {
        this.setStatus("reconnecting");
        if (this.tokenRefreshAttempts >= MAX_TOKEN_REFRESH_ATTEMPTS) {
          this.gaveUp = true;
          this.setStatus("disconnected");
          return;
        }
        this.tokenRefreshAttempts += 1;
        void refreshAccessToken().then((access) => {
          if (!access || this.userId === null) {
            this.gaveUp = true;
            this.setStatus("disconnected");
            return;
          }
          this.attempts = 0;
          this.open();
        });
        return;
      }
      // Fallback to SSE on unexpected close
      this.openSSE();
    };

    this.socket.onerror = () => {
      this.socket?.close();
      // Fallback to SSE on error
      this.openSSE();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.gaveUp || this.userId === null) return;
    this.setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "reconnecting");
    const base = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    const jitter = Math.floor(Math.random() * Math.min(base * 0.3, 3_000));
    const delay = base + jitter;
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
    this.cleanupSSE();
    this.setConnected(false);
    this.setStatus("disconnected");
    this.closing = false;

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
    if (this.userId !== null && !this._connected) {
      this.attempts = 0;
      this.gaveUp = false;
      this.open();
    }
  }

  private onBrowserOffline(): void {
    this.setStatus("offline");
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private onTabVisible(): void {
    if (document.visibilityState === "visible" && this.userId !== null) {
      if (!this._connected) {
        this.attempts = 0;
        this.gaveUp = false;
        this.open();
      }
    }
  }
}

export const realtime = new RealtimeClient();

/** React hook: run `handler` for every realtime event while mounted. */
export function useRealtimeEvent(handler: RealtimeHandler): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(
    () =>
      realtime.subscribe((event, payload, meta) => {
        ref.current(event, payload, meta);
      }),
    []
  );
}

/** React hook: current WebSocket open state. */
export function useRealtimeConnected(): boolean {
  const [connected, setConnected] = useState(realtime.connected);
  useEffect(() => realtime.onConnectionChange(setConnected), []);
  return connected;
}

/** React hook: detailed connection status (connected/connecting/…). */
export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState(realtime.status);
  useEffect(() => realtime.onStatusChange(setStatus), []);
  return status;
}

/**
 * React hook: connection-aware sync.
 *
 * - Realtime events matching `events` → immediate silent refresh.
 * - WS reconnect / browser online / tab visible → reconciliation refresh.
 * - Polling runs ONLY as a fallback while WS is disconnected and online
 *   (never when connected — WS is the primary transport).
 */
export function useRealtimeSync({
  refresh,
  events = [],
  interval = FALLBACK_POLL_INTERVAL_MS,
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
    const now = Date.now();
    if (now - lastRefresh.current < 2000) return;
    inflight.current = true;
    lastRefresh.current = now;
    try {
      refresh();
    } finally {
      setTimeout(() => { inflight.current = false; }, 500);
    }
  }, [refresh, enabled]);

  // Fallback polling: only when WS is down AND the browser is online.
  useEffect(() => {
    if (!enabled) return;
    if (connected) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const poll = setInterval(safeRefresh, interval);
    // One immediate catch-up when entering fallback mode.
    safeRefresh();
    return () => clearInterval(poll);
  }, [safeRefresh, interval, enabled, connected]);

  useRealtimeEvent((event) => {
    if (events.length === 0 || events.includes(event)) {
      safeRefresh();
    }
  });

  useEffect(() => {
    if (connected && !wasConnected.current) {
      safeRefresh();
    }
    wasConnected.current = connected;
  }, [connected, safeRefresh]);

  useEffect(() => {
    const handler = () => { if (navigator.onLine) safeRefresh(); };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [safeRefresh]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") safeRefresh();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [safeRefresh]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
}

/** Exported for unit tests: entity version key + stale-version rule. */
export const __test = { entityKey, RealtimeClient };
