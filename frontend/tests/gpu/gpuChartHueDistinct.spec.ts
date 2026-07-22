/**
 * GPU-page chart hue distinctness — the net that was missing when the
 * spectrum/rainbow chart bug shipped. Existing guards provably could not
 * catch it: charts/rainbowAccentPerElement targets Overview only, and
 * spectrum.long's page-level ">=2 unique el-index" was satisfied by the GPU
 * summary BARS while all three charts resolved the root scope (one hue, one
 * phase). This spec asserts the charts themselves.
 * Authored from the accentScope fix; run once locally before trusting in CI.
 */
import { test, expect } from "@playwright/test";

test("GPU page: three history charts carry distinct --el-index scopes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dashboard-accent-mode", "spectrum"));
  await page.goto("/gpu");
  // Wait for the indexer to stamp at least one chart container
  await page.waitForSelector(".chart-container[style*='--el-index']", { timeout: 30_000 });
  await page.waitForTimeout(500); // let all three render + indexer settle

  const indices = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".chart-container[style*='--el-index']"),
    )
      .map((el) => {
        const m = el.getAttribute("style")?.match(/--el-index:\s*(\d+)/);
        return m ? Number(m[1]) : null;
      })
      .filter((v): v is number => v !== null),
  );

  const distinct = new Set(indices);
  expect(
    distinct.size,
    `chart containers must have >=3 distinct --el-index values (got: [${[...distinct].join(", ")}]) — ` +
      `fewer means accentScope wiring regressed and charts collapsed to one hue/one phase`,
  ).toBeGreaterThanOrEqual(3);
});
