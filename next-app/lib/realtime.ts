/**
 * Realtime bridge — lets TypeScript service code push frames through the
 * WebSocket hub owned by server.js (same Node process; see globalThis
 * assignment there). Mirrors Django Channels' group_send to `user_<id>`.
 */
export interface RealtimeHub {
  send(userIds: Iterable<number>, event: string, payload: Record<string, unknown>): void;
  connectedUsers(): number;
}

export function pushEvent(
  userIds: Iterable<number>,
  event: string,
  payload: Record<string, unknown>
): void {
  const hub = (globalThis as unknown as { __medibook_realtime?: RealtimeHub }).__medibook_realtime;
  hub?.send(userIds, event, payload);
}
