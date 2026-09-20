/**
 * Axios API client (§28 envelope contract).
 *
 * - Base URL comes from VITE_API_BASE_URL (frontend/.env).
 * - Attaches the JWT access token to every request.
 * - On a 401 it transparently refreshes the token once (single-flight: parallel
 *   401s share one refresh call), then replays the original request.
 * - Unwraps responses to the §28 envelope; network/5xx errors surface as a
 *   normalized ApiError so screens only handle one error shape.
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type { Envelope } from "./types";
import { tokenStore } from "./tokens";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;

  constructor(message: string, status: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const access = tokenStore.getAccess();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

// Single-flight refresh: one shared promise for all concurrent 401s.
let refreshInFlight: Promise<string | null> | null = null;

/** Visible to the realtime socket: transparent single-flight token refresh. */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const refresh = tokenStore.getRefresh();
      if (!refresh) return null;
      const { data } = await axios.post<Envelope<{ access: string; refresh: string }>>(
        `${API_BASE_URL}/auth/token/refresh/`,
        { refresh },
        { timeout: 15_000 }
      );
      if (!data.success) return null;
      tokenStore.setAccess(data.data.access);
      tokenStore.setRefresh(data.data.refresh);
      return data.data.access;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<Envelope>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Only the refresh call itself is excluded: a 401 anywhere else (including
    // /auth/me/ during boot) should transparently refresh + replay once.
    if (status === 401 && config && !config._retried && !config.url?.includes("/auth/token/refresh/")) {
      config._retried = true;
      const access = await refreshAccessToken();
      if (access) {
        config.headers.Authorization = `Bearer ${access}`;
        return http.request(config);
      }
      tokenStore.clear();
    }

    const payload = error.response?.data;
    const message =
      payload?.message ?? (status ? `Request failed (${status})` : "Network error — check your connection");
    throw new ApiError(message, status ?? 0, payload?.errors ?? {});
  }
);

/** GET returning the unwrapped §28 envelope. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<Envelope<T>> {
  const { data } = await http.get<Envelope<T>>(url, { params });
  return data;
}

/** POST returning the unwrapped §28 envelope. */
export async function apiPost<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  const { data } = await http.post<Envelope<T>>(url, body ?? {});
  return data;
}

/** PATCH returning the unwrapped §28 envelope. */
export async function apiPatch<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  const { data } = await http.patch<Envelope<T>>(url, body ?? {});
  return data;
}

/** DELETE returning the unwrapped Â§28 envelope where supplied by the API. */
export async function apiDelete<T = void>(url: string): Promise<Envelope<T> | undefined> {
  const response = await http.delete<Envelope<T>>(url);
  return response.status === 204 ? undefined : response.data;
}
