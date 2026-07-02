import { test, expect } from "@playwright/test";
import {
  setAccentMode,
  expectNoBlackElements,
  expectAccentModeSet,
} from "../helpers/e2eThemeAssertions";

test.describe("GPU Page - Theme Modes", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const GPU_PATH = "#/gpu";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}${GPU_PATH}`);
    await page.waitForLoadState("networkidle");
  });

  test("Solid mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "solid");
    await expectAccentModeSet(page, "solid");
    await expectNoBlackElements(page);
  });

  test("Animated Gradient mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "animated-gradient");
    await expectAccentModeSet(page, "animated-gradient");
    await expectNoBlackElements(page);
  });

  test("Rainbow Wave mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "rainbow-wave");
    await expectAccentModeSet(page, "rainbow-wave");
    await expectNoBlackElements(page);
  });

  test("Spectrum Per-Element mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "spectrum");
    await expectAccentModeSet(page, "spectrum");
    await expectNoBlackElements(page);
  });

  test("Theme switching on GPU page does not introduce black elements", async ({
    page,
  }) => {
    const modes = ["solid", "animated-gradient", "rainbow-wave", "spectrum"];
    for (const mode of modes) {
      await setAccentMode(page, mode);
      await expectNoBlackElements(page);
    }
  });
});
