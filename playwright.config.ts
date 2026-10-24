import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/renderer/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command:
      "corepack pnpm --filter @shakespeare/renderer preview --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
