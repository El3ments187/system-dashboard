import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Exclude the slow, real-model-requiring suite from every DEFAULT
  // invocation (test:e2e, test:fast, or a bare `npx playwright test`).
  // That suite (tests/llama-cpp-model/) needs a real llama-server process
  // already running — launching one is slow (multi-GB model load),
  // resource-heavy, and non-deterministic to fire as a side effect of
  // what should be a fast, isolated default test run. Without this
  // exclusion, testDir's directory scan picks it up regardless of the
  // "Run with: npm run test:slow" comment at the top of that file — a
  // comment enforces nothing; only config does. Its own
  // playwright.slow.config.ts scopes testDir directly to that one
  // directory and defines the real globalSetup — that remains the ONLY
  // way to opt into running it.
  testIgnore: ["**/llama-cpp-model/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: "list",
  timeout: 90000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
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
