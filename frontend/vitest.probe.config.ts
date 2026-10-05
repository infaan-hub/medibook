import { defineConfig } from "vitest/config";
import path from "node:path";

// Live push probe. Separate from vitest.api.config.ts on purpose: this config
// talks to REAL push services (Google FCM / Apple APNs) over the network and
// sends real payloads to real enrolled devices, so it must never be picked up
// by `npm run test:api` or CI. Run it deliberately: `npm run probe:push`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/probe/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 90_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});