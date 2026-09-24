/**
 * Safe, namespaced Web Storage helpers (§21 "secure storage").
 *
 * - JSON values only, always wrapped in try/catch (private-mode Safari throws).
 * - Keys are namespaced under `mb.` so the app never collides with other
 *   origins when installed standalone.
 * - Availability is probed once; when storage is unavailable the helpers
 *   degrade to an in-memory map (session-only persistence).
 */

const NAMESPACE = "mb.";

const memoryFallback = new Map<string, string>();

function backend(store: "local" | "session"): Storage | null {
  try {
    const storage = store === "local" ? window.localStorage : window.sessionStorage;
    const probe = `${NAMESPACE}__probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const localBackend = backend("local");
const sessionBackend = backend("session");

export function readJSON<T>(key: string, store: "local" | "session" = "local"): T | null {
  const storage = store === "local" ? localBackend : sessionBackend;
  const raw = storage ? storage.getItem(NAMESPACE + key) : memoryFallback.get(NAMESPACE + key) ?? null;
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(
  key: string,
  value: unknown,
  store: "local" | "session" = "local",
): void {
  const storage = store === "local" ? localBackend : sessionBackend;
  const raw = JSON.stringify(value);
  if (storage) {
    storage.setItem(NAMESPACE + key, raw);
  } else {
    memoryFallback.set(NAMESPACE + key, raw);
  }
}

export function removeItem(key: string, store: "local" | "session" = "local"): void {
  const storage = store === "local" ? localBackend : sessionBackend;
  if (storage) {
    storage.removeItem(NAMESPACE + key);
  } else {
    memoryFallback.delete(NAMESPACE + key);
  }
}

/** Wipe every `mb.*` key — used on logout. */
export function clearNamespace(store: "local" | "session" = "local"): void {
  const storage = store === "local" ? localBackend : sessionBackend;
  if (storage) {
    [...Array(storage.length).keys()]
      .map((index) => storage.key(index))
      .filter((key): key is string => key !== null && key.startsWith(NAMESPACE))
      .forEach((key) => storage.removeItem(key));
  } else {
    [...memoryFallback.keys()]
      .filter((key) => key.startsWith(NAMESPACE))
      .forEach((key) => memoryFallback.delete(key));
  }
}
