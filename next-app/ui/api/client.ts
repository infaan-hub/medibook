/**
 * Axios API client (§28 envelope contract).
 *
 * - Base URL comes from NEXT_PUBLIC_API_BASE_URL (.env).
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

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;
  /**
   * Structured `data` the server attached to the failure — the §28 envelope
   * carries it on conflicts (e.g. the emergency eligibility that is blocking a
   * re-request), so screens can reconcile instead of only showing a message.
   */
  readonly data?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    errors: Record<string, string[]> = {},
    data?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
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
        { timeout: 30_000 }
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

    // Binary endpoints (the PDF report routes) answer errors with a JSON body
    // too — axios hands it over as a Blob, so decode it before reading fields.
    const raw = error.response?.data as unknown;
    let payload: (Envelope & Record<string, unknown>) | null = null;
    if (raw instanceof Blob) {
      try {
        payload = JSON.parse(await raw.text()) as Envelope & Record<string, unknown>;
      } catch {
        payload = null;
      }
    } else if (raw && typeof raw === "object") {
      payload = raw as Envelope & Record<string, unknown>;
    }
    // Surface the first field-level reason so validation failures read as
    // "Systolic and diastolic blood pressure are recorded together." instead
    // of the generic envelope message.
    const errors =
      payload && typeof payload === "object" ? payload.errors : undefined;
    const firstFieldError =
      errors && typeof errors === "object"
        ? Object.values(errors)
            .flat()
            .find((message): message is string => typeof message === "string")
        : undefined;
    const message =
      firstFieldError ??
      (payload && typeof payload === "object" ? payload.message : undefined) ??
      (status ? `Request failed (${status})` : "Network error — check your connection");
    const data =
      payload && typeof payload === "object" && payload.data !== null && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : undefined;
    throw new ApiError(message, status ?? 0, errors ?? {}, data);
  }
);

/**
 * Asserts a response body is the §28 envelope before screens touch it.
 *
 * A misdeployed backend (or a proxy answering with an HTML page) would
 * otherwise hand screens a value they go on to iterate, surfacing as a cryptic
 * "… is not iterable" instead of a readable API error.
 */
export function envelope<T>(body: unknown, url: string, status: number): Envelope<T> {
  const valid =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { success?: unknown }).success === "boolean";
  if (!valid) {
    throw new ApiError(
      `Unexpected response from ${url} — expected the API JSON envelope.`,
      status
    );
  }
  return body as Envelope<T>;
}

/** GET returning the unwrapped §28 envelope. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<Envelope<T>> {
  const { data } = await http.get<Envelope<T>>(url, { params });
  return envelope<T>(data, url, 200);
}

/** POST returning the unwrapped §28 envelope. */
export async function apiPost<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  const { data } = await http.post<Envelope<T>>(url, body ?? {});
  return envelope<T>(data, url, 200);
}

/** PATCH returning the unwrapped §28 envelope. */
export async function apiPatch<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  const { data } = await http.patch<Envelope<T>>(url, body ?? {});
  return envelope<T>(data, url, 200);
}

/** DELETE returning the §28 envelope where supplied by the API. */
export async function apiDelete<T = void>(url: string): Promise<Envelope<T> | undefined> {
  const response = await http.delete<Envelope<T>>(url);
  if (response.status === 204) return undefined;
  return envelope<T>(response.data, url, response.status);
}