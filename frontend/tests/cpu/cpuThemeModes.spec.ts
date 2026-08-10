import { test } from "@playwright/test";
import {
  setAccentMode,
  expectNoBlackElements,
  expectAccentModeSet,
} from "../helpers/e2eThemeAssertions";

test.describe("CPU Page - Theme Modes", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const CPU_PATH = "#/cpu";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}${CPU_PATH}`);
    await page.waitForLoadState("networkidle");
  });

  test("Solid mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "solid");
    await expectAccentModeSet(page, "solid");
    await expectNoBlackElements(page);
  });

  test("Sheen mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "sheen");
    await expectAccentModeSet(page, "sheen");
    await expectNoBlackElements(page);
  });

  test("Flow mode - no black elements", async ({ page }) => {
    await setAccentMode(page, "flow");
    await expectAccentModeSet(page, "flow");
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

  test("Theme switching on CPU page does not introduce black elements", async ({
    page,
  }) => {
    const modes = ["solid", "sheen", "flow", "rainbow-wave", "spectrum"];
    for (const mode of modes) {
      await setAccentMode(page, mode);
      await expectNoBlackElements(page);
    }
  });
});
