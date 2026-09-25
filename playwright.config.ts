import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { browserName: "chromium", headless: true, trace: "retain-on-failure" },
  outputDir: "test-results",
});
