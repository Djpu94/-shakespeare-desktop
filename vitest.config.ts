import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shakespeare/shared": resolve("packages/shared/src/index.ts"),
      "@shakespeare/domain": resolve("packages/domain/src/index.ts"),
    },
  },
  test: {
    include: [
      "apps/**/*.{test,spec}.{ts,tsx}",
      "packages/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["**/e2e/**", "**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
