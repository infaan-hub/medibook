import { defineConfig } from "vitest/config";
import path from "node:path";

// API test suite, run against THIS app's own copies of lib/, services/,
// repositories/, reports/ and validators/ — not next-app's.
//
// Separate from vitest.config.ts because the environments differ: API tests are
// plain node with the `@` alias; the UI tests need jsdom.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  // tsconfig keeps jsx: "preserve" for Next's own transform, so tell the
  // transform to use the automatic runtime. This app runs Vitest 5, which
  // compiles with oxc (not esbuild), and some API tests import .tsx modules
  // such as src/components/AppShell, so JSX must be handled here too.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // The suites share one Prisma client; keep files sequential so fixture data
    // stays deterministic.
    fileParallelism: false,
  },
});