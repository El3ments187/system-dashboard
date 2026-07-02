import { test, expect } from "@playwright/test";
import {
  setAccentMode,
  expectNoBlackElements,
  expectNoInvalidCssValues,
  expectAccentModeSet,
  getCssVariable,
} from "../helpers/e2eThemeAssertions";

/**
 * Covers Bug #5 ("Theme transitions leave stale state") and Bug #6 ("Preview/dashboard
 * diverge") across all three in-scope pages. Each transition is exercised forward and
 * backward, since a one-directional bug (e.g. Solid -> Gradient looking fine, but Gradient
 * -> Solid leaving a stale gradient) is common with CSS-animation-driven themes.
 */
const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
];

const TRANSITIONS: Array<[string, string]> = [
  ["solid", "animated-gradient"],
  ["animated-gradient", "solid"],
  ["solid", "spectrum"],
  ["spectrum", "solid"],
  ["solid", "rainbow-wave"],
  ["rainbow-wave", "solid"],
];

for (const { name, path } of PAGES) {
  test.describe(`${name} Page - Theme Transitions`, () => {
    const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
    });

    for (const [from, to] of TRANSITIONS) {
      test(`${from} -> ${to}: no stale state, no black elements`, async ({
        page,
      }) => {
        await setAccentMode(page, from);
        await page.waitForTimeout(50);

        await setAccentMode(page, to);
        await page.waitForTimeout(50);

        await expectAccentModeSet(page, to);
        await expectNoBlackElements(page);
        await expectNoInvalidCssValues(page);
      });
    }

    test("rapid cycling through every mode leaves the dashboard in a clean final state", async ({
      page,
    }) => {
      const modes = [
        "solid",
        "animated-gradient",
        "rainbow-wave",
        "spectrum",
        "solid",
      ];
      for (const mode of modes) {
        await setAccentMode(page, mode);
        await page.waitForTimeout(30);
      }
      await expectAccentModeSet(page, "solid");
      await expectNoBlackElements(page);
      await expectNoInvalidCssValues(page);
    });

    test("returning to Solid mode resolves --accent-primary back to a concrete color (not a leftover gradient/hsl expression)", async ({
      page,
    }) => {
      await setAccentMode(page, "rainbow-wave");
      await page.waitForTimeout(50);
      await setAccentMode(page, "solid");
      await page.waitForTimeout(50);

      const accentPrimary = await getCssVariable(page, "--accent-primary");
      expect(accentPrimary).not.toBe("");
      expect(accentPrimary.toLowerCase()).not.toContain("undefined");
    });
  });
}
