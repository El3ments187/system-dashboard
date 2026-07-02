import { test, expect } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

/**
 * Visual regression baselines. `npx playwright test --update-snapshots` regenerates the
 * baseline images after an intentional visual change; CI runs compare against them with
 * the maxDiffPixelRatio configured in playwright.config.ts. A regression that makes any
 * component render black, lose its accent, or show stale colors will produce a pixel diff
 * here even if it's too subtle for the DOM-inspection-based specs elsewhere to catch.
 */
const PAGES = [
  { name: "overview", path: "/" },
  { name: "gpu", path: "/gpu" },
  { name: "cpu", path: "/cpu" },
];

const MODES = ["solid", "animated-gradient", "rainbow-wave", "spectrum"];

for (const { name, path } of PAGES) {
  test.describe(`${name} screenshots`, () => {
    const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

    for (const mode of MODES) {
      test(`${name} - ${mode}`, async ({ page }) => {
        await page.goto(`${BASE_URL}${path}`);
        await page.waitForLoadState("networkidle");
        await setAccentMode(page, mode);
        // Freeze CSS animations so Animated Gradient / Rainbow Wave screenshots are
        // deterministic rather than landing on an arbitrary animation frame.
        await page.evaluate(() => {
          document.documentElement.style.animation = "none";
          const style = document.createElement("style");
          style.textContent =
            "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }";
          document.head.appendChild(style);
        });
        await page.waitForTimeout(150);
        await expect(page).toHaveScreenshot(`${name}-${mode}.png`, {
          fullPage: true,
        });
      });
    }
  });
}

test.describe("dual-line chart screenshots", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  for (const mode of MODES) {
    test(`memory chart (primary solid + secondary dashed) - ${mode}`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForSelector("text=MEMORY UTILIZATION HISTORY");
      await setAccentMode(page, mode);
      await page.evaluate(() => {
        document.documentElement.style.animation = "none";
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }";
        document.head.appendChild(style);
      });
      await page.waitForTimeout(150);
      const chart = page
        .locator("text=MEMORY UTILIZATION HISTORY")
        .locator("..")
        .locator("..");
      await expect(chart).toHaveScreenshot(`memory-chart-${mode}.png`);
    });
  }
});

test.describe("cpu per-core screenshots", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  for (const mode of MODES) {
    test(`per-core chart - ${mode}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/cpu`);
      await page.waitForSelector('[data-testid="per-core-bar"]');
      await setAccentMode(page, mode);
      await page.evaluate(() => {
        document.documentElement.style.animation = "none";
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }";
        document.head.appendChild(style);
      });
      await page.waitForTimeout(150);
      const chart = page
        .locator("text=PER-CORE UTILIZATION")
        .locator("..")
        .locator("..");
      await expect(chart).toHaveScreenshot(`cpu-per-core-${mode}.png`);
    });
  }
});
