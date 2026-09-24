/**
 * Realtime bridge — lets TypeScript service code push frames through the
 * WebSocket hub owned by server.js (same Node process; see globalThis
 * assignment there).
 *
 * Every frame is an envelope with id / type / timestamp / version / entity_id
 * so clients can deduplicate and reject stale (out-of-order) events.
 */
import { randomUUID } from "node:crypto";

export interface RealtimeHub {
  send(userIds: Iterable<number>, event: string, payload: Record<string, unknown>): void;
  /** Fan-out to every authenticated socket (e.g. availability updates). */
  broadcastAll?(event: string, payload: Record<string, unknown>): void;
  connectedUsers(): number;
}

export interface RealtimeEnvelope {
  id: string;
  type: string;
  event: string;
  timestamp: string;
  version: number;
  entity_id: string;
  payload: Record<string, unknown>;
}

export function buildEnvelope(
  type: string,
  payload: Record<string, unknown>,
  opts?: { version?: number; entityId?: string | number }
): RealtimeEnvelope {
  const entityId = opts?.entityId ?? payload.id ?? "";
  return {
    id: randomUUID(),
    type,
    event: type,
    timestamp: new Date().toISOString(),
    // Prefer an explicit monotonic version (entity updated_at); fall back to wall clock.
    version: typeof opts?.version === "number" && Number.isFinite(opts.version) ? opts.version : Date.now(),
    entity_id: String(entityId),
    payload,
  };
}

function hub(): RealtimeHub | undefined {
  return (globalThis as unknown as { __medibook_realtime?: RealtimeHub }).__medibook_realtime;
}

export function pushEvent(
  userIds: Iterable<number>,
  event: string,
  payload: Record<string, unknown>,
  opts?: { version?: number; entityId?: string | number }
): void {
  const targets = [...userIds].filter((id) => Number.isInteger(id));
  if (targets.length === 0) return;
  hub()?.send(targets, event, buildEnvelope(event, payload, opts) as unknown as Record<string, unknown>);
}

/** Broadcast to all authenticated sockets (no user targeting). */
export function pushEventAll(
  event: string,
  payload: Record<string, unknown>,
  opts?: { version?: number; entityId?: string | number }
): void {
  const h = hub();
  if (!h) return;
  const envelope = buildEnvelope(event, payload, opts) as unknown as Record<string, unknown>;
  if (h.broadcastAll) {
    h.broadcastAll(event, envelope);
    return;
  }
  // Fallback if hub only implements send — no-op rather than drop silently when possible.
}
