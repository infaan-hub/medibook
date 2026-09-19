import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MediBook frontend build configuration (TypeScript).
// The PWA layer (manifest.json, service-worker.js, offline.html) is served from public/
// and is added in PHASE 4 — React Foundation.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});