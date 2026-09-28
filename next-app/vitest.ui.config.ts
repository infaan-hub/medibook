import { defineConfig } from "vitest/config";
import path from "node:path";

// The mirrored UI suite (next-app/ui/**): the same jsdom setup the frontend
// app uses, kept apart from vitest.config.ts because that one runs under
// `environment: node` and spawns an API server + test database in globalSetup.
//
// Nothing used to include this directory — `include` only matched
// tests/**/*.test.ts — so ui/__tests__ was written, never run.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // Match Next.js: TSX compiles with the automatic JSX runtime (tsconfig keeps
  // jsx: "preserve", which would otherwise make esbuild use the classic runtime).
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["ui/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["ui/test/setup.ts"],
    css: true,
  },
});
