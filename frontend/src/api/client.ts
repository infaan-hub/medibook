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

    const payload = error.response?.data;
    // Surface the first field-level reason so validation failures read as
    // "Enter a temperature between 25 and 45 °C." instead of the generic
    // envelope message.
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

const TRAINING_CACHE_TTL = 15_000;
const trainingCache = new Map<string, { data: unknown; ts: number }>();
let trainingCacheGeneration = 0;

export function invalidateTrainingCache() {
  trainingCacheGeneration += 1;
  trainingCache.clear();
}

const PSYCHOTHERAPY_CACHE_TTL = 15_000;
const psychotherapyCache = new Map<string, { data: unknown; ts: number }>();
let psychotherapyCacheGeneration = 0;

export function invalidatePsychotherapyCache() {
  psychotherapyCacheGeneration += 1;
  psychotherapyCache.clear();
}

const inFlightGets = new Map<string, Promise<Envelope<unknown>>>();

function invalidateForWrite(url: string) {
  if (url.includes("/training")) invalidateTrainingCache();
  if (url.includes("/psychotherapy")) invalidatePsychotherapyCache();
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<Envelope<T>> {
  const isTraining = url.includes("/training");
  const isPsy = url.includes("/psychotherapy");
  // Never reuse authenticated response data across accounts in this tab.
  const identityScope = tokenStore.getAccess() ?? "anonymous";
  const generation = isTraining ? trainingCacheGeneration : isPsy ? psychotherapyCacheGeneration : 0;
  const cacheKey = isTraining
    ? `${identityScope}:TRAINING:${generation}:${url}:${JSON.stringify(params ?? {})}`
    : isPsy
      ? `${identityScope}:PSY:${generation}:${url}:${JSON.stringify(params ?? {})}`
      : null;
  const requestKey = `${identityScope}:${generation}:${http.getUri({ url, params })}`;
  if (cacheKey) {
    const cache = isPsy ? psychotherapyCache : trainingCache;
    const ttl = isPsy ? PSYCHOTHERAPY_CACHE_TTL : TRAINING_CACHE_TTL;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < ttl) {
      return hit.data as Envelope<T>;
    }
    if (hit) cache.delete(cacheKey);
  }
  const pending = inFlightGets.get(requestKey);
  if (pending) return pending as Promise<Envelope<T>>;

  const generationAtStart = isTraining ? trainingCacheGeneration : isPsy ? psychotherapyCacheGeneration : null;
  const request = http.get<Envelope<T>>(url, { params }).then(({ data }) => {
    const result = envelope<T>(data, url, 200);
    // A write during this GET advances the generation, preventing stale data
    // from repopulating a cache that was already invalidated.
    const generationStillCurrent = isTraining
      ? generationAtStart === trainingCacheGeneration
      : isPsy
        ? generationAtStart === psychotherapyCacheGeneration
        : false;
    if (cacheKey && generationStillCurrent) {
      const cache = isPsy ? psychotherapyCache : trainingCache;
      cache.set(cacheKey, { data: result, ts: Date.now() });
    }
    return result;
  }).finally(() => {
    if (inFlightGets.get(requestKey) === request) inFlightGets.delete(requestKey);
  });
  inFlightGets.set(requestKey, request as Promise<Envelope<unknown>>);
  return request;
}

/** POST returning the unwrapped §28 envelope. */
export async function apiPost<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  invalidateForWrite(url);
  const { data } = await http.post<Envelope<T>>(url, body ?? {});
  invalidateForWrite(url);
  return envelope<T>(data, url, 200);
}

/** PATCH returning the unwrapped §28 envelope. */
export async function apiPatch<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  invalidateForWrite(url);
  const { data } = await http.patch<Envelope<T>>(url, body ?? {});
  invalidateForWrite(url);
  return envelope<T>(data, url, 200);
}

/** DELETE returning the §28 envelope where supplied by the API. */
export async function apiDelete<T = void>(url: string): Promise<Envelope<T> | undefined> {
  invalidateForWrite(url);
  const response = await http.delete<Envelope<T>>(url);
  invalidateForWrite(url);
  if (response.status === 204) return undefined;
  return envelope<T>(response.data, url, response.status);
}
