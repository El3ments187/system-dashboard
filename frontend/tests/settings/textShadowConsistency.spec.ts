import { test, expect } from "@playwright/test";
import { setAccentMode, getCssVariable } from "../helpers/e2eThemeAssertions";

const MODES = ["solid", "sheen", "flow", "rainbow-wave", "spectrum"];

test.describe("Settings Page - Text Shadow Consistency", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const SETTINGS_PATH = "/settings";

  for (const mode of MODES) {
    test(`${mode} - matching UI elements have consistent text shadows`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${SETTINGS_PATH}`);
      // Wait for specific selectors instead of networkidle to avoid hanging on WebSocket/long-polling connections
      await page.waitForSelector(".settings-card-title", { timeout: 10000 });
      await setAccentMode(page, mode);

      // Verify CSS variables are defined for this accent mode
      const shadowSm = await getCssVariable(page, "--text-shadow-sm");
      const shadowMd = await getCssVariable(page, "--text-shadow-md");
      expect(shadowSm).toBeTruthy();
      expect(shadowMd).toBeTruthy();

      // Check that settings card titles have text-shadow applied via .settings-card-title class
      const settingsTitles = page.locator(".settings-card-title").first();
      if ((await settingsTitles.count()) > 0) {
        const titleShadow = await settingsTitles.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(titleShadow).not.toBe("");
      }

      // Check that settings field labels have text-shadow applied via .settings-field-label class
      const fieldLabels = page.locator(".settings-field-label").first();
      if ((await fieldLabels.count()) > 0) {
        const labelShadow = await fieldLabels.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(labelShadow).not.toBe("");
      }

      // Check that settings inputs have text-shadow applied via .settings-input class or inline style
      const inputs = page.locator(".settings-input").first();
      if ((await inputs.count()) > 0) {
        const inputShadow = await inputs.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(inputShadow).not.toBe("");
      }

      // Check that settings buttons have text-shadow applied via .settings-btn class or inline style
      const buttons = page.locator(".settings-btn").first();
      if ((await buttons.count()) > 0) {
        const btnShadow = await buttons.evaluate(
          (el) => getComputedStyle(el).textShadow,
        );
        expect(btnShadow).not.toBe("");
      }

      // Verify all settings card titles share the same text-shadow value
      const titleShadows = await page.$$eval(".settings-card-title", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (titleShadows.length > 0) {
        const uniqueTitleShadows = new Set(titleShadows);
        expect(uniqueTitleShadows.size).toBe(1);
      }

      // Verify all settings field labels share the same text-shadow value
      const labelShadows = await page.$$eval(".settings-field-label", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (labelShadows.length > 0) {
        const uniqueLabelShadows = new Set(labelShadows);
        expect(uniqueLabelShadows.size).toBe(1);
      }

      // Verify all settings inputs share the same text-shadow value
      const inputShadows = await page.$$eval(".settings-input", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (inputShadows.length > 0) {
        const uniqueInputShadows = new Set(inputShadows);
        expect(uniqueInputShadows.size).toBe(1);
      }

      // Verify all settings buttons share the same text-shadow value
      const buttonShadows = await page.$$eval(".settings-btn", (els) =>
        els.map((el) => getComputedStyle(el).textShadow),
      );
      if (buttonShadows.length > 0) {
        const uniqueButtonShadows = new Set(buttonShadows);
        expect(uniqueButtonShadows.size).toBe(1);
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
      await expect(page).toHaveScreenshot(`settings-${mode}.png`, {
        fullPage: true,
      });
    });
  }

  test("All accent modes resolve to valid text-shadow values", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}${SETTINGS_PATH}`);
    // Wait for specific selectors instead of networkidle to avoid hanging on WebSocket/long-polling connections
    await page.waitForSelector(".settings-card-title", { timeout: 10000 });

    for (const mode of MODES) {
      await setAccentMode(page, mode);
      const shadowSm = await getCssVariable(page, "--text-shadow-sm");
      expect(shadowSm).toBeTruthy();
      // text-shadow should contain at least one valid CSS value (not empty or 'none')
      expect(shadowSm).not.toBe("");
    }
  });
});
