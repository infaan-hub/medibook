import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MediBook frontend build configuration (TypeScript).
// The PWA layer (manifest.json, service-worker.js, offline.html) is served from public/.
// The /api dev+preview proxy forwards to the Django backend (PHASE 5 — React
// Authentication): same-origin calls, no CORS needed in development.
const API_PROXY_TARGET = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
      "/media": { target: API_PROXY_TARGET, changeOrigin: true },
    }
  },
  preview: {
    port: 4180,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
      "/media": { target: API_PROXY_TARGET, changeOrigin: true },
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});