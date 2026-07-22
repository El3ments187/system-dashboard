/**
 * E2E pin of the Live/Pause control — the app's core data control and the
 * diagnostic instrument that attributed the second leak. No existing spec
 * touches it. Asserts the NETWORK contract: pausing stops /api/metrics
 * traffic; resuming restarts it. Selector is the verified title-flip pair
 * from Header.tsx. Authored; run once locally before trusting in CI.
 */
import { test, expect } from "@playwright/test";

test("Live toggle stops and restarts metric polling", async ({ page }) => {
  let metricRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/metrics")) metricRequests++;
  });

  await page.goto("/");
  await page.waitForSelector("text.recharts-cartesian-axis-tick-value", { timeout: 30_000 });

  metricRequests = 0;
  await page.waitForTimeout(4_000);
  const liveCount = metricRequests;
  expect(liveCount, "live polling must produce steady /api/metrics traffic").toBeGreaterThan(4);

  await page.getByTitle("Pause live updates").click();
  await page.getByTitle("Resume live updates").waitFor({ timeout: 5_000 });
  await page.waitForTimeout(500); // drain in-flight
  metricRequests = 0;
  await page.waitForTimeout(4_000);
  expect(metricRequests, "paused: metric polling must stop").toBeLessThanOrEqual(1);

  await page.getByTitle("Resume live updates").click();
  await page.getByTitle("Pause live updates").waitFor({ timeout: 5_000 });
  metricRequests = 0;
  await page.waitForTimeout(4_000);
  expect(metricRequests, "resumed: polling must restart").toBeGreaterThan(4);
});
