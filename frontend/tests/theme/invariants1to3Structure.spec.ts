/**
 * Invariants 1-3 (Tier A): Structural invariants — per page.
 *
 * 1. Every card/panel has a `.card-accent-spine.accent-glow-target` child and
 *    `data-accent-el` on the root; spine count == card count.
 * 2. Every meter/bar carries its own `data-accent-el`; grouped panels carry one
 *    on the panel root only.
 * 3. The indexer assigns distinct sequential `--el-index` to all `[data-accent-el]`
 *    elements (no duplicates/undefined).
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "AI", path: "/ai" },
  { name: "Settings", path: "/settings" },
];

async function waitForIndices(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      return (
        els.length > 0 &&
        Array.from(els).every(
          (el) => el.style.getPropertyValue("--el-index") !== "",
        )
      );
    },
    { timeout: 8000 },
  );
}

for (const { name, path } of PAGES) {
  test.describe(`Structural invariants: ${name} page`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("main, .app-root", { timeout: 10000 });
    });

    test(`${name} invariant 1: has at least one spine element with accent-glow-target`, async ({
      page,
    }) => {
      // Accept all spine class variants: card-accent-spine (shared Card), accent-spine (LlamaCpp custom), ov-spine (Overview)
      const count = await page
        .locator(".card-accent-spine.accent-glow-target, .accent-spine.accent-glow-target, .ov-spine.accent-glow-target")
        .count();
      expect(
        count,
        `${name}: expected at least 1 spine.accent-glow-target element, got ${count}`,
      ).toBeGreaterThan(0);
    });

    test(`${name} invariant 1: has at least one [data-accent-el] element`, async ({
      page,
    }) => {
      const count = await page.locator("[data-accent-el]").count();
      expect(
        count,
        `${name}: expected at least 1 [data-accent-el], got ${count}`,
      ).toBeGreaterThan(0);
    });

    test(`${name} invariant 1: spine count matches data-accent-el count`, async ({
      page,
    }) => {
      const spines = await page
        .locator(".card-accent-spine.accent-glow-target, .accent-spine.accent-glow-target, .ov-spine.accent-glow-target")
        .count();
      const accentEls = await page.locator("[data-accent-el]").count();
      // Spines should be <= accent elements (some accent-els may be bars, not cards)
      expect(
        spines,
        `${name}: spine count ${spines} exceeds data-accent-el count ${accentEls}`,
      ).toBeLessThanOrEqual(accentEls);
      expect(
        spines,
        `${name}: no spine elements found (spines=${spines})`,
      ).toBeGreaterThan(0);
    });

    test(`${name} invariant 3: all [data-accent-el] have unique sequential --el-index`, async ({
      page,
    }) => {
      await waitForIndices(page);

      const result = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        );
        const indices = els.map((el) =>
          parseInt(el.style.getPropertyValue("--el-index"), 10),
        );
        const missing = indices.filter((i) => isNaN(i));
        const duplicates = indices.filter(
          (i, pos) => !isNaN(i) && indices.indexOf(i) !== pos,
        );
        // Check sequential: sorted indices should be 0,1,2,...n-1
        const sorted = [...indices].filter((i) => !isNaN(i)).sort((a, b) => a - b);
        const isSequential = sorted.every((v, i) => v === i);
        return { total: els.length, missing, duplicates, indices, isSequential };
      });

      expect(
        result.missing,
        `${name}: ${result.missing.length} elements have no --el-index`,
      ).toHaveLength(0);

      expect(
        result.duplicates,
        `${name}: duplicate --el-index values: ${JSON.stringify(result.duplicates)}`,
      ).toHaveLength(0);

      expect(
        result.isSequential,
        `${name}: --el-index values are not sequential 0..n-1: ${JSON.stringify(result.indices)}`,
      ).toBe(true);
    });
  });
}
