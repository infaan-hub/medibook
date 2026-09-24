import { defineConfig } from "vitest/config";

// Next.js keeps tsconfig `jsx: "preserve"`, so tell Vite 8's oxc transform
// to compile JSX for tests (@vitejs/plugin-react is intentionally not used).
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
