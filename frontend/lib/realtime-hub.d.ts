/** Type surface for realtime-hub.js (allowJs infers poorly from CommonJS). */

export interface RealtimeSink {
  userId: number | null;
  send(frame: string): void;
  isOpen?(): boolean;
}

export interface RealtimeHubHandle {
  add(sink: RealtimeSink): () => void;
  remove(sink: RealtimeSink): void;
  send(userIds: Iterable<number>, event: string, payload: Record<string, unknown>): void;
  broadcastAll(event: string, payload: Record<string, unknown>): void;
  connectedUsers(): number;
}

export interface SseIo {
  write(chunk: string): void;
  end(): void;
  isOpen?(): boolean;
}

export declare const HEARTBEAT_MS: number;

export declare function toFrame(
  event: string,
  payload: Record<string, unknown> | undefined | null
): string;

export declare function createHub(): RealtimeHubHandle;

export declare function getHub(): RealtimeHubHandle;

export declare function startSse(userId: number, io: SseIo): () => void;
