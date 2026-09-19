/**
 * Global state management (§47 — React Context + reducers; no external store
 * for the MVP). Two providers:
 *  - ToastProvider: transient user-facing messages (success/error/info).
 *  - SessionProvider: the auth session (§54) — boot-time restore validated
 *    against /auth/me/, login/register/logout, profile updates.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "../api/auth";
import { tokenStore } from "../api/tokens";
import type { RegisterPayload, User } from "../api/types";

/* ---------------- Toasts ---------------- */

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type ToastAction = { type: "push"; toast: Toast } | { type: "dismiss"; id: number };

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "push":
      return [...state, action.toast];
    case "dismiss":
      return state.filter((toast) => toast.id !== action.id);
  }
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (kind: ToastKind, message: string, timeoutMs?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => dispatch({ type: "dismiss", id }), []);

  const notify = useCallback(
    (kind: ToastKind, message: string, timeoutMs = 4_000) => {
      const id = nextId.current++;
      dispatch({ type: "push", toast: { id, kind, message } });
      window.setTimeout(() => dispatch({ type: "dismiss", id }), timeoutMs);
    },
    []
  );

  const value = useMemo(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

/* ---------------- Session (§54 — React Authentication) ---------------- */

/**
 * booting → boot probe in flight; authed → valid session; guest → signed out.
 */
export type SessionStatus = "booting" | "authed" | "guest";

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Replace the cached user (profile edits, verification, …). */
  setUser: (user: User) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("booting");
  const [user, setUserState] = useState<User | null>(null);
  const booted = useRef(false);

  // Boot probe (§54 token restore): a stored refresh token means a previous
  // session exists. Validate it against /auth/me/ — the axios interceptor
  // transparently refreshes an expired access token first; any failure clears
  // storage and drops to guest. Runs exactly once (StrictMode-safe).
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (!tokenStore.getRefresh()) {
      setStatus("guest");
      return;
    }
    getMe()
      .then((envelope) => {
        setUserState(envelope.data);
        tokenStore.setUser(envelope.data);
        setStatus("authed");
      })
      .catch(() => {
        tokenStore.clear();
        setUserState(null);
        setStatus("guest");
      });
  }, []);

  const applyAuth = useCallback(
    (payload: { access: string; refresh: string; user: User }) => {
      tokenStore.setPair({ access: payload.access, refresh: payload.refresh });
      tokenStore.setUser(payload.user);
      setUserState(payload.user);
      setStatus("authed");
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const envelope = await loginRequest(email, password);
      applyAuth(envelope.data);
    },
    [applyAuth]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const envelope = await registerRequest(payload);
      applyAuth(envelope.data);
    },
    [applyAuth]
  );

  // Best-effort server-side blacklist; the local session is always cleared.
  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh();
    if (refresh) {
      try {
        await logoutRequest(refresh);
      } catch {
        /* token already invalid/expired — nothing left to blacklist */
      }
    }
    tokenStore.clear();
    setUserState(null);
    setStatus("guest");
  }, []);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    tokenStore.setUser(next);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, setUser }),
    [status, user, login, register, logout, setUser]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}