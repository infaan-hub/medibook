/**
 * RealtimeProvider — provides realtime connection status via context.
 * Mount inside SessionProvider + ToastProvider (identity still set by SessionProvider).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { realtime, useRealtimeStatus, useRealtimeConnected, type RealtimeStatus } from "./socket";

export interface RealtimeContextValue {
  status: RealtimeStatus;
  connected: boolean;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const status = useRealtimeStatus();
  const connected = useRealtimeConnected();

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      connected,
      reconnect: () => realtime.reconnect(),
    }),
    [status, connected]
  );

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

export function useRealtimeOptional(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}
