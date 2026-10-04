import { defineConfig } from "vitest/config";

// UI test suite (jsdom). The API suite lives in vitest.api.config.ts because
// it needs a node environment and the `@` alias rather than jsdom.
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
