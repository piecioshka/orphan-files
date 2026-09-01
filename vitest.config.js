import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/fixtures/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js", "index.js"],
      exclude: ["**/node_modules/**", "**/fixtures/**", "**/tests/**"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
