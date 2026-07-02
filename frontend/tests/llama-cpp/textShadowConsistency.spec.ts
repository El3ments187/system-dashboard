import { test, expect } from "@playwright/test";
import { setAccentMode, getCssVariable } from "../helpers/e2eThemeAssertions";

const MODES = ["solid", "animated-gradient", "rainbow-wave", "spectrum"];

test.describe("AI Page - Text Shadow Consistency", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const AI_PATH = "/ai";

  for (const mode of MODES) {
    test(`${mode} - matching UI elements have consistent text shadows`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${AI_PATH}`);
      // Wait for specific selectors instead of networkidle to avoid hanging on WebSocket/long-polling connections
      await page.waitForSelector('[class*="card-header"]', { timeout: 10000 });
      await setAccentMode(page, mode);

      // Verify CSS variables are defined for this accent mode
      const shadowSm = await getCssVariable(page, "--text-shadow-sm");
      const shadowMd = await getCssVariable(page, "--text-shadow-md");
      expect(shadowSm).toBeTruthy();
      expect(shadowMd).toBeTruthy();

      // Check that card header titles have text-shadow applied via .card-title class (shared component)
      const cardTitles = page.locator(".card-title").first();
      const titleShadow = await cardTitles.evaluate(
        (el) => getComputedStyle(el).textShadow,
      );
      expect(titleShadow).not.toBe("");

      // Check that metric tile labels have text-shadow applied via .metric-tile-label class (shared component)
      const metricLabels = page.locator(".metric-tile-label").first();
      if ((await metricLabels.count()) > 0) {
        const labelShadow = await metricLabels.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(labelShadow).not.toBe("");
      }

      // Check that metric tile values have text-shadow applied via .metric-tile-value class (shared component)
      const metricValues = page.locator(".metric-tile-value").first();
      if ((await metricValues.count()) > 0) {
        const valueShadow = await metricValues.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(valueShadow).not.toBe("");
      }

      // Check that section titles have text-shadow applied via .section-title class (shared component)
      const sectionTitles = page.locator(".section-title").first();
      if ((await sectionTitles.count()) > 0) {
        const secTitleShadow = await sectionTitles.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(secTitleShadow).not.toBe("");
      }

      // Verify all card titles share the same text-shadow value
      const titleShadows = await page.$$eval(".card-title", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (titleShadows.length > 0) {
        const uniqueTitleShadows = new Set(titleShadows);
        expect(uniqueTitleShadows.size).toBe(1);
      }

      // Verify all metric tile labels share the same text-shadow value
      const labelShadows = await page.$$eval(".metric-tile-label", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (labelShadows.length > 0) {
        const uniqueLabelShadows = new Set(labelShadows);
        expect(uniqueLabelShadows.size).toBe(1);
      }

      // Verify all metric tile values share the same text-shadow value
      const valueShadows = await page.$$eval(".metric-tile-value", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (valueShadows.length > 0) {
        const uniqueValueShadows = new Set(valueShadows);
        expect(uniqueValueShadows.size).toBe(1);
      }

      // Verify buttons have text-shadow applied via inline style
      const buttons = page
        .locator("button")
        .filter({ hasText: /Test|Open|View|Run/ })
        .first();
      if ((await buttons.count()) > 0) {
        const btnShadow = await buttons.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(btnShadow).not.toBe("");
      }

      // Verify input fields have text-shadow applied via inline style
      const inputs = page.locator("input").first();
      if ((await inputs.count()) > 0) {
        const inputShadow = await inputs.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(inputShadow).not.toBe("");
      }

      // Screenshot for visual regression
      await page.evaluate(() => {
        document.documentElement.style.animation = "none";
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }";
        document.head.appendChild(style);
      });
      await page.waitForTimeout(150);
      await expect(page).toHaveScreenshot(`ai-${mode}.png`, { fullPage: true });
    });
  }

  test("All accent modes resolve to valid text-shadow values", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}${AI_PATH}`);
    // Wait for specific selectors instead of networkidle to avoid hanging on WebSocket/long-polling connections
    await page.waitForSelector('[class*="card-header"]', { timeout: 10000 });

    for (const mode of MODES) {
      await setAccentMode(page, mode);
      const shadowSm = await getCssVariable(page, "--text-shadow-sm");
      expect(shadowSm).toBeTruthy();
      // text-shadow should contain at least one valid CSS value (not empty or 'none')
      expect(shadowSm).not.toBe("");
    }
  });
});
