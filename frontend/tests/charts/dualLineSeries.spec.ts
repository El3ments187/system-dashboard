import { test, expect, type Page } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

/**
 * Regression coverage for: dual-line charts using an unrelated contrasting hue for the
 * secondary series (MetricChart's dataKeys/dualData paths), or the *identical* color for
 * both lines (StorageHistoryChart's read/write). Both violate the "primary themed color +
 * related secondary variant + dashed secondary" requirement. Full-page screenshot diffing
 * is too insensitive to catch this (two thin lines are a tiny fraction of total pixels), so
 * this suite inspects the rendered SVG stroke/stroke-dasharray attributes directly.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const MODES = ["solid", "animated-gradient", "rainbow-wave", "spectrum"];

async function getDashedAndSolidStrokes(page: Page) {
  return page.evaluate(() => {
    const paths = Array.from(
      document.querySelectorAll<SVGPathElement>("path[stroke]"),
    );
    const solid: string[] = [];
    const dashed: string[] = [];
    for (const p of paths) {
      const stroke = p.getAttribute("stroke");
      const dash = p.getAttribute("stroke-dasharray");
      if (!stroke || stroke === "none" || stroke.startsWith("url(")) continue;
      if (dash && dash !== "0") dashed.push(stroke.toLowerCase());
      else solid.push(stroke.toLowerCase());
    }
    return { solid, dashed };
  });
}

function hexToRgbTuple(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rough hue-family check: same dominant channel ordering implies a related shade, not an unrelated hue. */
function sameHueFamily(a: string, b: string): boolean {
  const rgbA = hexToRgbTuple(a);
  const rgbB = hexToRgbTuple(b);
  if (!rgbA || !rgbB) return false;
  const rank = (rgb: [number, number, number]) =>
    [0, 1, 2].sort((i, j) => rgb[j] - rgb[i]);
  return JSON.stringify(rank(rgbA)) === JSON.stringify(rank(rgbB));
}

test.describe("Memory chart (Overview) - dual-line series", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector("text=MEMORY UTILIZATION HISTORY");
  });

  for (const mode of MODES) {
    test(`${mode}: secondary line is dashed and in the same color family as the primary`, async ({
      page,
    }) => {
      await setAccentMode(page, mode);
      await page.waitForTimeout(150);
      const { solid, dashed } = await getDashedAndSolidStrokes(page);

      expect(solid.length).toBeGreaterThan(0);
      expect(dashed.length).toBeGreaterThan(0);
      expect(dashed).not.toContain(solid[0]);
      expect(sameHueFamily(solid[0], dashed[0])).toBe(true);
    });
  }

  test("secondary line colors update when switching accent in Solid mode", async ({
    page,
  }) => {
    await setAccentMode(page, "solid");
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-accent", "turquoise"),
    );
    await page.waitForTimeout(150);
    const before = await getDashedAndSolidStrokes(page);

    await page.evaluate(() =>
      document.documentElement.setAttribute("data-accent", "crimson"),
    );
    await page.waitForTimeout(150);
    const after = await getDashedAndSolidStrokes(page);

    expect(after.dashed[0]).not.toBe(before.dashed[0]);
  });
});

test.describe("CPU dual-axis chart (Utilization + Temperature) - dual-line series", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForSelector("text=CPU UTILIZATION");
  });

  for (const mode of MODES) {
    test(`${mode}: secondary (temperature) line is dashed and related to the primary`, async ({
      page,
    }) => {
      await setAccentMode(page, mode);
      await page.waitForTimeout(150);
      const { solid, dashed } = await getDashedAndSolidStrokes(page);

      expect(solid.length).toBeGreaterThan(0);
      expect(dashed.length).toBeGreaterThan(0);
      expect(sameHueFamily(solid[0], dashed[0])).toBe(true);
    });
  }
});

test.describe("Dual-line series - theme transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector("text=MEMORY UTILIZATION HISTORY");
  });

  const TRANSITIONS: Array<[string, string]> = [
    ["solid", "animated-gradient"],
    ["animated-gradient", "solid"],
    ["solid", "spectrum"],
    ["spectrum", "solid"],
    ["solid", "rainbow-wave"],
    ["rainbow-wave", "solid"],
  ];

  for (const [from, to] of TRANSITIONS) {
    test(`${from} -> ${to}: secondary line stays dashed and related, never becomes identical to primary`, async ({
      page,
    }) => {
      await setAccentMode(page, from);
      await page.waitForTimeout(100);
      await setAccentMode(page, to);
      await page.waitForTimeout(100);

      const { solid, dashed } = await getDashedAndSolidStrokes(page);
      expect(dashed.length).toBeGreaterThan(0);
      expect(dashed).not.toContain(solid[0]);
    });
  }
});
