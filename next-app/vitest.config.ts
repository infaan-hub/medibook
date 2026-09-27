import { defineConfig } from "vitest/config";
import path from "node:path";

// MediBook backend test suite.
// - Unit tests run in-process (node).
// - Integration tests hit a separately spawned server (see tests/global-setup.ts)
//   running against the medibook_test PostgreSQL database.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  // Match Next.js: TSX compiles with the automatic JSX runtime (tsconfig keeps
  // jsx: "preserve" for Next's own transform, which would otherwise make
  // esbuild fall back to the classic React.createElement runtime in tests).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // All suites share one test database + server: keep files sequential so
    // fixture data stays deterministic (mirrors Django's manage.py test run).
    fileParallelism: false,
  },
});
