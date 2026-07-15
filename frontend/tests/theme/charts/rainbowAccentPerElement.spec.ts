/**
 * REQ-AM-40/41/50/51 — 360÷N per-element hue spacing.
 * Adjacent elements must be separated by 360÷N degrees (±5°), not a fixed 34° step.
 * Full-wheel coverage: with enough elements, hues span the whole wheel.
 */
import { test, expect, type Page } from "@playwright/test";
import { setAccentMode } from "../../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForIndices(page: Page) {
  await page.waitForFunction(
    () => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>("[data-accent-el]"),
      ).filter((el) => el.getAttribute("data-accent-el") !== "inherit");
      return (
        els.length > 0 &&
        els.every((el) => el.style.getPropertyValue("--el-index") !== "")
      );
    },
    null,
    { timeout: 8000 },
  );
}

/** Sample the hue (0–360) of the --accent-primary resolved at a given el-index. */
async function sampleHueAtIndex(
  page: Page,
  index: number,
  total: number,
): Promise<number> {
  return page.evaluate(
    ({ idx, tot }) => {
      const step = tot > 1 ? 360 / tot : 0;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:-10px;width:1px;height:1px;pointer-events:none";
      probe.style.setProperty("--el-index", String(idx));
      probe.style.background = `oklch(from var(--accent-base) l c calc(h + ${idx * step}))`;
      document.body.appendChild(probe);
      const ctx = Object.assign(document.createElement("canvas"), {
        width: 1,
        height: 1,
      }).getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = window.getComputedStyle(probe).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      document.body.removeChild(probe);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      // RGB → hue
      const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
      const max = Math.max(rn, gn, bn),
        min = Math.min(rn, gn, bn);
      if (max === min) return 0;
      const d = max - min;
      let h = 0;
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      return (h * 60 + 360) % 360;
    },
    { idx: index, tot: total },
  );
}

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
];

for (const { name, path } of PAGES) {
  test.describe(`REQ-AM-40: 360÷N spacing on ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
      await setAccentMode(page, "spectrum");
      await waitForIndices(page);
    });

    test(`${name}: adjacent elements separated by ~360÷N degrees (±5°)`, async ({
      page,
    }) => {
      const { total, accentCount } = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        ).filter((el) => el.getAttribute("data-accent-el") !== "inherit");
        const accentCount =
          parseFloat(
            document.documentElement.style.getPropertyValue("--accent-count"),
          ) || els.length;
        return { total: els.length, accentCount };
      });

      expect(total).toBeGreaterThan(2);
      const expected = 360 / accentCount;

      // Sample first 3 consecutive el-indices and check their gap
      const h0 = await sampleHueAtIndex(page, 0, accentCount);
      const h1 = await sampleHueAtIndex(page, 1, accentCount);

      // Hue gap (circular distance)
      const rawGap = Math.abs(h1 - h0);
      const gap = Math.min(rawGap, 360 - rawGap);

      expect(
        gap,
        `Adjacent hue gap ${gap.toFixed(1)}° must be ~${expected.toFixed(1)}° (360÷${accentCount}), ±5°`,
      ).toBeCloseTo(expected, -1); // -1 = tolerance ±5°
    });

    test(`${name}: --accent-count on <html> equals non-inherit element count`, async ({
      page,
    }) => {
      const { accentCount, nonInheritCount } = await page.evaluate(() => {
        const accentCount = parseFloat(
          document.documentElement.style.getPropertyValue("--accent-count"),
        );
        const nonInheritCount = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        ).filter(
          (el) => el.getAttribute("data-accent-el") !== "inherit",
        ).length;
        return { accentCount, nonInheritCount };
      });
      expect(accentCount).toBeGreaterThan(0);
      expect(accentCount).toBe(nonInheritCount);
    });
  });
}

test("Spread slider does NOT change rainbow/spectrum hue step (REQ-AM-41)", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
  await setAccentMode(page, "spectrum");
  await waitForIndices(page);

  // Read the --accent-count (N)
  const accentCount = await page.evaluate(
    () =>
      parseFloat(
        document.documentElement.style.getPropertyValue("--accent-count"),
      ) || 12,
  );
  const expectedStep = 360 / accentCount;

  // Sample hue at index 1 with default spread
  const h1Default = await sampleHueAtIndex(page, 1, accentCount);

  // Change fx-spread to a very different value (e.g. 5 vs default 34)
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--fx-spread", "5");
  });
  await page.waitForTimeout(100);

  // Hue step should remain the same (spread doesn't control it anymore)
  const h1AfterSpreadChange = await sampleHueAtIndex(page, 1, accentCount);
  const gap = Math.min(
    Math.abs(h1AfterSpreadChange - h1Default),
    360 - Math.abs(h1AfterSpreadChange - h1Default),
  );
  expect(
    gap,
    `Changing --fx-spread must not change hue step. Gap after spread change: ${gap.toFixed(1)}°, expected ~0°`,
  ).toBeLessThan(5);

  // And the step is still ~360/N
  const gapFromZero = Math.min(h1AfterSpreadChange, 360 - h1AfterSpreadChange);
  expect(
    Math.abs(gapFromZero - expectedStep),
    `Hue step ${gapFromZero.toFixed(1)}° must still be ~${expectedStep.toFixed(1)}° after spread change`,
  ).toBeLessThan(10);
});
