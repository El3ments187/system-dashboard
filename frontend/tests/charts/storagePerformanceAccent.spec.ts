import { test, expect, type Page } from "@playwright/test";
import { setAccentMode, setAccent } from "../helpers/e2eThemeAssertions";

function hexToRgbTuple(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sameHueFamily(a: string, b: string): boolean {
  const rgbA = hexToRgbTuple(a);
  const rgbB = hexToRgbTuple(b);
  if (!rgbA || !rgbB) return false;
  const rank = (rgb: [number, number, number]) =>
    [0, 1, 2].sort((i, j) => rgb[j] - rgb[i]);
  return JSON.stringify(rank(rgbA)) === JSON.stringify(rank(rgbB));
}

/**
 * Regression coverage for: in Solid mode, the Storage Performance chart's per-device
 * colors stayed a fixed blue/teal palette regardless of the selected accent. Root cause:
 * the per-core-only "ignore the accent, use the fixed 32-color palette" exemption was
 * applied to *any* resolveAccentColors() call with count > 2, which incorrectly also
 * captured StorageHistoryChart's per-device color resolution (count = 8). Only the CPU
 * per-core chart should get that exemption.
 */
async function getStorageChartStrokes(page: Page) {
  return page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("*")).find(
      (el) => el.textContent?.trim() === "STORAGE PERFORMANCE",
    );
    const container = card?.closest(".metric-card") || document;
    const paths = Array.from(
      container.querySelectorAll<SVGPathElement>("path[stroke]"),
    );
    return paths
      .map((p) => p.getAttribute("stroke"))
      .filter((s): s is string => !!s && s !== "none" && !s.startsWith("url("));
  });
}

test.describe("Storage Performance chart - accent participation in Solid mode", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const visible = await page
      .locator("text=STORAGE PERFORMANCE")
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(!visible, "STORAGE PERFORMANCE section not available in this environment");
    await setAccentMode(page, "solid");
  });

  test("device colors change when the selected accent changes", async ({
    page,
  }) => {
    await setAccent(page, "blue");
    await page.waitForTimeout(150);
    const blueStrokes = await getStorageChartStrokes(page);

    await setAccent(page, "orange");
    await page.waitForTimeout(150);
    const orangeStrokes = await getStorageChartStrokes(page);

    expect(orangeStrokes).not.toEqual(blueStrokes);
  });

  test("device colors are not pinned to the fixed per-core palette (blue/teal) when accent is orange", async ({
    page,
  }) => {
    await setAccent(page, "orange");
    await page.waitForTimeout(150);
    const strokes = await getStorageChartStrokes(page);
    // The fixed per-core palette's first two entries are blue/sky (#3B82F6 / #60A5FA).
    // An orange-derived spread should not produce exactly those values.
    expect(strokes.map((s) => s.toLowerCase())).not.toContain("#3b82f6");
  });
});

test.describe("Storage Performance chart - read/write dual-line relationship", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const visible = await page
      .locator("text=STORAGE PERFORMANCE")
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(!visible, "STORAGE PERFORMANCE section not available in this environment");
    await setAccentMode(page, "solid");
    await setAccent(page, "turquoise");
    await page.waitForTimeout(150);
  });

  /**
   * Direct regression coverage for the original bug: each device's read and write lines
   * used the *exact same* stroke color, distinguished only by fill opacity — making them
   * hard to tell apart and violating "secondary must be a related-but-distinct variant."
   */
  test("each device has a solid read line and a dashed write line in a related (not identical) color", async ({
    page,
  }) => {
    // Under heavy parallel test load, the write series can take a poll cycle longer than
    // the read series to populate — wait for at least one dashed stroke to actually exist
    // before asserting on the read/write pairing, instead of racing a fixed timeout.
    await page.waitForFunction(
      () => {
        const heading = Array.from(document.querySelectorAll("*")).find(
          (el) =>
            el.textContent?.trim().toLowerCase() === "storage performance",
        );
        const container = heading?.closest(".metric-card") || document;
        return (
          container.querySelectorAll(
            '.recharts-area-curve[stroke-dasharray="6 4"]',
          ).length > 0
        );
      },
      { timeout: 10000 },
    );

    const pairs = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("*")).find(
        (el) => el.textContent?.trim().toLowerCase() === "storage performance",
      );
      const container = heading?.closest(".metric-card") || document;
      const paths = Array.from(
        container.querySelectorAll<SVGPathElement>(".recharts-area-curve"),
      );
      return paths
        .map((p) => ({
          stroke: p.getAttribute("stroke"),
          dash: p.getAttribute("stroke-dasharray"),
        }))
        .filter((p) => p.stroke && p.stroke !== "none");
    });

    // Solid (read) and dashed (write) lines should come in matched pairs, one per device.
    const solid = pairs
      .filter((p) => !p.dash || p.dash === "0")
      .map((p) => p.stroke!.toLowerCase());
    const dashed = pairs
      .filter((p) => p.dash && p.dash !== "0")
      .map((p) => p.stroke!.toLowerCase());

    expect(solid.length).toBeGreaterThan(0);
    expect(dashed).toHaveLength(solid.length);

    for (let i = 0; i < solid.length; i++) {
      expect(dashed[i]).not.toBe(solid[i]); // never identical (the original bug)
      expect(sameHueFamily(solid[i], dashed[i])).toBe(true); // but still related
    }
  });

  test("write line dash pattern matches the dashboard-wide secondary line convention", async ({
    page,
  }) => {
    const dashPatterns = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("*")).find(
        (el) => el.textContent?.trim().toLowerCase() === "storage performance",
      );
      const container = heading?.closest(".metric-card") || document;
      const paths = Array.from(
        container.querySelectorAll<SVGPathElement>(
          ".recharts-area-curve[stroke-dasharray]",
        ),
      );
      return paths
        .map((p) => p.getAttribute("stroke-dasharray"))
        .filter((d): d is string => !!d && d !== "0");
    });
    expect(dashPatterns.length).toBeGreaterThan(0);
    for (const dash of dashPatterns) {
      expect(dash).toBe("6 4");
    }
  });
});
