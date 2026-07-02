import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/llama-cpp-model",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 300_000,
  globalSetup: "./tests/llama-cpp-model/globalSetup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
