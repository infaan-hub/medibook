/// <reference types="vite/client" />

// Typed access to the Vite environment variables used by MediBook.
// Values are defined per environment in frontend/.env (see frontend/.env.example).
interface ImportMetaEnv {
  /** Backend API base URL, including the /api prefix. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Optional absolute/host WebSocket base when realtime is not same-origin
   * (e.g. wss://ws.example.com on a dedicated Node host). Unset = same-origin
   * /ws/notifications/ (Vite proxy in development).
   */
  readonly VITE_WS_URL?: string;
  /** Optional offline override for the VAPID public key (normally fetched from the API). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}