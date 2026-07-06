import { test, expect, type Page } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

/**
 * Comprehensive tests for the Rainbow Wave and Spectrum per-element hue system.
 *
 * Each card/chart container on a page has an inline --el-index CSS custom property.
 * In Rainbow Wave and Spectrum modes, --accent-primary is computed as an OKLCH color
 * whose hue shifts by 34° per el-index step. MetricChart resolves series colors via
 * resolveAccentColors(), which must read CSS vars in the chart element's own DOM context
 * (not document.documentElement) so the correct per-element hue is used.
 *
 * The memory chart regression: before the fix, resolveAccentColors() always read from
 * documentElement (el-index=0), so the memory chart at el-index=2 incorrectly rendered
 * with the el-index=0 hue (same as the first GPU/overview card).
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

/**
 * Returns SVG path stroke colors grouped by the inline --el-index of the nearest
 * ancestor element that declares it. Gradient refs (url(...)) are excluded.
 */
async function getStrokesByElIndex(
  page: Page,
): Promise<Record<number, string[]>> {
  return page.evaluate(() => {
    const result: Record<number, string[]> = {};
    for (const p of Array.from(
      document.querySelectorAll<SVGPathElement>("path[stroke]"),
    )) {
      const stroke = p.getAttribute("stroke");
      if (!stroke || stroke === "none" || stroke.startsWith("url(")) continue;

      let el: Element | null = p.parentElement;
      let elIndex = 0;
      while (el && el !== document.documentElement) {
        const m = (el.getAttribute("style") || "").match(
          /--el-index\s*:\s*(-?\d+)/,
        );
        if (m) {
          elIndex = parseInt(m[1]);
          break;
        }
        el = el.parentElement;
      }

      if (!result[elIndex]) result[elIndex] = [];
      result[elIndex].push(stroke.toLowerCase());
    }
    return result;
  });
}

/** Returns all SVG path strokes that are near-black (all channels < 30). */
async function getNearBlackStrokes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGPathElement>("path[stroke]"))
      .map((p) => p.getAttribute("stroke") ?? "")
      .filter((s) => {
        if (!s || s === "none" || s.startsWith("url(")) return false;
        const m = s.match(/^#([0-9a-f]{6})$/i);
        if (!m) return false;
        const n = parseInt(m[1], 16);
        return (
          ((n >> 16) & 255) < 30 &&
          ((n >> 8) & 255) < 30 &&
          (n & 255) < 30
        );
      }),
  );
}

function hexToHslHue(hex: string): number | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Circular angular distance between two hex colors' hues (0–180°). */
function hueDist(a: string, b: string): number {
  const hA = hexToHslHue(a);
  const hB = hexToHslHue(b);
  if (hA === null || hB === null) return 999;
  const diff = Math.abs(hA - hB);
  return Math.min(diff, 360 - diff);
}

/**
 * Disables the CSS spin animation and sets --accent-spin to a fixed value so that
 * rainbow-wave colors are stable during assertions.
 */
async function freezeRainbowSpin(page: Page, spin = 100) {
  await page.evaluate((s) => {
    document.documentElement.style.animation = "none";
    document.documentElement.style.setProperty("--accent-spin", String(s));
  }, spin);
}

// ---------------------------------------------------------------------------
// Overview page — per-element hue spread
// ---------------------------------------------------------------------------

test.describe("Rainbow Wave — Overview per-element hue spread", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
  });

  test("memory (el-index=2) and CPU (el-index=1) chart strokes use distinct hues", async ({
    page,
  }) => {
    await freezeRainbowSpin(page, 100);
    await setAccentMode(page, "rainbow-wave");
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const mem = strokes[2]?.[0];
    const cpu = strokes[1]?.[0];

    expect(mem, "memory chart must have a resolved stroke color").toBeTruthy();
    expect(cpu, "CPU chart must have a resolved stroke color").toBeTruthy();
    expect(
      hueDist(mem!, cpu!),
      `memory (${mem}) and CPU (${cpu}) should differ in hue by > 15°`,
    ).toBeGreaterThan(15);
  });

  test("el-index 0, 1, 2 all produce distinct chart hues", async ({ page }) => {
    await freezeRainbowSpin(page, 60);
    await setAccentMode(page, "rainbow-wave");
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const c0 = strokes[0]?.[0];
    const c1 = strokes[1]?.[0];
    const c2 = strokes[2]?.[0];

    if (c0 && c1)
      expect(
        hueDist(c0, c1),
        `el-index 0 (${c0}) vs 1 (${c1}) must differ`,
      ).toBeGreaterThan(15);
    if (c1 && c2)
      expect(
        hueDist(c1, c2),
        `el-index 1 (${c1}) vs 2 (${c2}) must differ`,
      ).toBeGreaterThan(15);
    if (c0 && c2)
      expect(
        hueDist(c0, c2),
        `el-index 0 (${c0}) vs 2 (${c2}) must differ`,
      ).toBeGreaterThan(15);
  });

  test("regression: memory chart does NOT use the el-index=0 hue", async ({
    page,
  }) => {
    // Before the fix, resolveAccentColors() always read from documentElement (el-index=0).
    // The memory chart card is el-index=2, so its chart must render at a different hue.
    await freezeRainbowSpin(page, 100);
    await setAccentMode(page, "rainbow-wave");
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const mem = strokes[2]?.[0];
    const el0 = strokes[0]?.[0];

    expect(mem, "memory chart (el-index=2) must have a stroke color").toBeTruthy();
    if (mem && el0) {
      expect(
        hueDist(mem, el0),
        `Memory chart (${mem}) must NOT use el-index=0 color (${el0}); ` +
          `they should be ~68° apart (2 × 34° per step)`,
      ).toBeGreaterThan(15);
    }
  });

  test("spectrum: memory and CPU charts use distinct hues", async ({ page }) => {
    await setAccentMode(page, "spectrum");
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const mem = strokes[2]?.[0];
    const cpu = strokes[1]?.[0];

    if (mem && cpu) {
      expect(
        hueDist(mem, cpu),
        `spectrum: memory (${mem}) and CPU (${cpu}) should differ in hue`,
      ).toBeGreaterThan(15);
    }
  });

  test("solid: memory and CPU chart strokes share the same hue family", async ({
    page,
  }) => {
    await setAccentMode(page, "solid");
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-accent", "blue"),
    );
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const mem = strokes[2]?.[0];
    const cpu = strokes[1]?.[0];

    // In solid mode there is no el-index hue spread; primary and secondary variants
    // of the same accent are used, so they share a hue family (< 40° apart).
    if (mem && cpu) {
      expect(
        hueDist(mem, cpu),
        `solid: memory (${mem}) and CPU (${cpu}) should be in the same hue family`,
      ).toBeLessThan(40);
    }
  });

  test("colors update on Overview when switching from solid to rainbow-wave", async ({
    page,
  }) => {
    await setAccentMode(page, "solid");
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-accent", "blue"),
    );
    await page.waitForTimeout(300);
    const solidStrokes = Object.values(await getStrokesByElIndex(page)).flat();

    await freezeRainbowSpin(page, 200);
    await setAccentMode(page, "rainbow-wave");
    await page.waitForTimeout(300);
    const rainbowStrokes = Object.values(
      await getStrokesByElIndex(page),
    ).flat();

    if (solidStrokes.length > 0 && rainbowStrokes.length > 0) {
      const changed = solidStrokes.some((c, i) => rainbowStrokes[i] !== c);
      expect(
        changed,
        "At least one chart stroke must change when switching from solid-blue to rainbow-wave",
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Spectrum mode — hue spread verification
// ---------------------------------------------------------------------------

test.describe("Spectrum mode — per-element hue spread (Overview)", () => {
  test("at least 2 distinct hue groups across el-index regions", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await setAccentMode(page, "spectrum");
    await page.waitForTimeout(300);

    const strokes = await getStrokesByElIndex(page);
    const groupHues = Object.values(strokes)
      .filter((colors) => colors.length > 0)
      .map((colors) => hexToHslHue(colors[0]))
      .filter((h): h is number => h !== null);

    const uniqueBuckets = new Set(groupHues.map((h) => Math.floor(h / 30)));
    expect(
      uniqueBuckets.size,
      `Expected >= 2 distinct 30°-hue buckets in spectrum mode across el-index groups, got ${uniqueBuckets.size}`,
    ).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// All pages sanity — no near-black strokes in rainbow-wave / spectrum
// ---------------------------------------------------------------------------

test.describe("Rainbow Wave + Spectrum — all pages no broken colors", () => {
  const PAGES = [
    { name: "Overview", path: "/" },
    { name: "CPU", path: "/cpu" },
    { name: "GPU", path: "#/gpu" },
  ];

  for (const { name, path } of PAGES) {
    test(`${name}: no near-black chart strokes in rainbow-wave`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await freezeRainbowSpin(page, 120);
      await setAccentMode(page, "rainbow-wave");
      await page.waitForTimeout(400);

      const bad = await getNearBlackStrokes(page);
      expect(
        bad.length,
        `${name}: found near-black strokes in rainbow-wave: ${bad.join(", ")}`,
      ).toBe(0);
    });

    test(`${name}: no near-black chart strokes in spectrum`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await setAccentMode(page, "spectrum");
      await page.waitForTimeout(400);

      const bad = await getNearBlackStrokes(page);
      expect(
        bad.length,
        `${name}: found near-black strokes in spectrum: ${bad.join(", ")}`,
      ).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Rainbow Wave — spin rotation produces different colors at different times
// ---------------------------------------------------------------------------

test.describe("Rainbow Wave — spin rotation", () => {
  test("Overview chart colors differ at spin=0 vs spin=180", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);

    await freezeRainbowSpin(page, 0);
    await setAccentMode(page, "rainbow-wave");
    await page.waitForTimeout(300);
    const strokesAt0 = Object.values(await getStrokesByElIndex(page)).flat();

    await freezeRainbowSpin(page, 180);
    // Trigger accent sync by toggling a watched attribute
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-accent", "blue"),
    );
    await page.waitForTimeout(300);
    const strokesAt180 = Object.values(
      await getStrokesByElIndex(page),
    ).flat();

    if (strokesAt0.length > 0 && strokesAt180.length > 0) {
      const anyChanged = strokesAt0.some((c, i) => strokesAt180[i] !== c);
      expect(
        anyChanged,
        "rainbow-wave chart colors must shift when --accent-spin changes from 0 to 180",
      ).toBe(true);
    }
  });
});
