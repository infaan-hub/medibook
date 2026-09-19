/**
 * Typed token store (§21 secure storage).
 *
 * - `access` lives in sessionStorage: short-lived, tied to the tab session.
 * - `refresh` lives in localStorage: survives restarts so the session can be
 *   restored, and is rotated by the server on every use.
 * - The in-memory mirror lets the axios interceptor read the access token
 *   synchronously without a storage round-trip per request.
 */

import { readJSON, removeItem, writeJSON } from "../lib/storage";
import type { AuthPair, User } from "./types";

const ACCESS_KEY = "auth.access";
const REFRESH_KEY = "auth.refresh";
const USER_KEY = "auth.user";

let memoryAccess: string | null = null;

export const tokenStore = {
  getAccess(): string | null {
    return memoryAccess ?? readJSON<string>(ACCESS_KEY, "session");
  },
  setAccess(token: string): void {
    memoryAccess = token;
    writeJSON(ACCESS_KEY, token, "session");
  },
  getRefresh(): string | null {
    return readJSON<string>(REFRESH_KEY, "local");
  },
  setRefresh(token: string): void {
    writeJSON(REFRESH_KEY, token, "local");
  },
  getUser(): User | null {
    return readJSON<User>(USER_KEY, "local");
  },
  setUser(user: User): void {
    writeJSON(USER_KEY, user, "local");
  },
  setPair(pair: AuthPair): void {
    this.setAccess(pair.access);
    this.setRefresh(pair.refresh);
  },
  clear(): void {
    memoryAccess = null;
    removeItem(ACCESS_KEY, "session");
    removeItem(REFRESH_KEY, "local");
    removeItem(USER_KEY, "local");
  },
};
