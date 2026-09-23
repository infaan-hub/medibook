/// <reference types="vite/client" />

// Typed access to the Vite environment variables used by MediBook.
// Values are defined per environment in frontend/.env (see frontend/.env.example).
interface ImportMetaEnv {
  /** Backend API base URL, including the /api prefix. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}