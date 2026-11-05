import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "ferramentas/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
