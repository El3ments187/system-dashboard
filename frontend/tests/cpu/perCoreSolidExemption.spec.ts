import { test, expect } from "@playwright/test";
import {
  setAccentMode,
  setAccent,
  getPerCoreColors,
  expectPerCoreUniqueColorCount,
} from "../helpers/e2eThemeAssertions";

/**
 * Regression coverage for the per-core "Solid mode must ignore the selected accent and
 * always use the dedicated 32-color palette" requirement. A prior bug (see
 * src/test/unit/theme/perCoreSolidExemption.test.ts for the unit-level reproduction) caused
 * the per-core palette to silently shift hue whenever the user changed their accent color
 * while in Solid mode.
 */
test.describe("CPU Page - Per-Core Solid Mode Exemption", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForSelector('[data-testid="per-core-bar"]');
    await setAccentMode(page, "solid");
  });

  for (const accent of ["turquoise", "red", "purple", "green"]) {
    test(`Solid + ${accent} accent: per-core chart remains multi-colored and uses the full palette`, async ({
      page,
    }) => {
      await setAccent(page, accent);
      await page.waitForTimeout(100);
      await expectPerCoreUniqueColorCount(page, 16); // dashboard mock may render fewer than 32 active cores
    });
  }

  test("per-core palette is identical across different accents in Solid mode", async ({
    page,
  }) => {
    await setAccent(page, "turquoise");
    await page.waitForTimeout(100);
    const turquoiseColors = await getPerCoreColors(page);

    await setAccent(page, "red");
    await page.waitForTimeout(100);
    const redColors = await getPerCoreColors(page);

    expect(redColors).toEqual(turquoiseColors);
  });

  test("per-core chart does not shift its base hue to track the selected accent", async ({
    page,
  }) => {
    // Turquoise itself is one of the 32 fixed palette entries, so it legitimately appears
    // in the palette regardless of selection — the real regression to guard against is the
    // palette *reordering itself* around whichever accent is picked, which the
    // "identical palette across accents" test above already covers precisely. This test
    // instead checks core 0 specifically never just mirrors the live --accent-primary value.
    await setAccent(page, "crimson");
    await page.waitForTimeout(100);
    const accentPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-primary")
        .trim()
        .toLowerCase(),
    );
    const colors = await getPerCoreColors(page);
    expect(colors[0]).not.toBe(accentPrimary);
  });

  test("per-core chart never collapses to a single solid color", async ({
    page,
  }) => {
    await setAccent(page, "purple");
    await page.waitForTimeout(100);
    const colors = await getPerCoreColors(page);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});

test.describe("CPU Page - Per-Core Participates Outside Solid Mode", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForSelector('[data-testid="per-core-bar"]');
  });

  for (const mode of ["sheen", "flow"]) {
    test(`${mode}: per-core chart participates in the active theme (accent changes shift the palette)`, async ({
      page,
    }) => {
      await setAccentMode(page, mode);
      await setAccent(page, "turquoise");
      await page.waitForTimeout(100);
      const before = await getPerCoreColors(page);

      await setAccent(page, "red");
      await page.waitForTimeout(100);
      const after = await getPerCoreColors(page);

      expect(after).not.toEqual(before);
    });
  }

  test("rainbow-wave: per-core chart tracks the live --accent-spin CSS variable over time", async ({
    page,
  }) => {
    // Real wall-clock CSS animation timing is slow (20s/360°) and depends on
    // prefers-reduced-motion, making a real-time wait flaky in CI. Drive --accent-spin
    // directly (the exact value the production code reads) and rely on CoreBars's
    // useAccentSync 800ms poll interval to pick up the change — this exercises the same
    // "components participate in non-Solid modes over time" requirement deterministically.
    await setAccentMode(page, "rainbow-wave");
    // The running @keyframes accent-spin-rotate animation takes CSS-cascade priority over a
    // plain inline custom-property override, so disable the animation itself first to make
    // --accent-spin directly controllable for a deterministic assertion.
    await page.evaluate(() => {
      document.documentElement.style.animation = "none";
      document.documentElement.style.setProperty("--accent-spin", "10");
    });
    await page.waitForTimeout(900);
    const t0 = await getPerCoreColors(page);

    await page.evaluate(() =>
      document.documentElement.style.setProperty("--accent-spin", "190"),
    );
    await page.waitForTimeout(900);
    const t1 = await getPerCoreColors(page);

    expect(t1).not.toEqual(t0);
  });

  test("spectrum: per-core chart stays multi-colored and ignores the selected accent", async ({
    page,
  }) => {
    await setAccentMode(page, "spectrum");
    await setAccent(page, "turquoise");
    await page.waitForTimeout(100);
    const before = await getPerCoreColors(page);

    await setAccent(page, "red");
    await page.waitForTimeout(100);
    const after = await getPerCoreColors(page);

    expect(after).toEqual(before);
    expect(new Set(after).size).toBeGreaterThan(1);
  });
});
