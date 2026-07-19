/**
 * Chart axis tspan leak — axis-density guard (Tier 4)
 *
 * The detached-<tspan> leak was identified via Chrome DevTools Detached
 * Elements (hundreds of retained, detached SVG tspan nodes growing every
 * poll). The root cause: XAxis rendered one tick per data point (~120) whose
 * text content slid every poll, so recharts detached and rebuilt ~120 tspans
 * on every render. Both MetricChart and OverviewStorageChart were affected.
 *
 * RSS measurement note: The RSS proxy (all chromium renderers via ps) is
 * unreliable in automation — it captures long-running user browser processes
 * whose accumulated RSS dwarfs the test signal. The authoritative RSS soak
 * and Detached Elements check must be done manually in DevTools (Phase 3.2).
 *
 * This automated test verifies the fix is ACTIVE in the live browser by
 * counting CONNECTED tspans on the Overview page:
 *
 *   Pre-fix:  ~120 tspans/XAxis × 5 XAxes (Overview) → 600+ → RED
 *   Post-fix: ~6  tspans/XAxis × 5 XAxes             → ~30  → GREEN
 *
 * A sparse axis can only leak sparely; a dense axis leaks densely.
 * This is the fastest reliable CI proxy for the real-world fix.
 * Tier 1 (lint) + Tier 2 (prop tests) are what prevent silent regression.
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

test.describe("Chart axis tspan leak — axis density guard", () => {
  test("connected tspan count on Overview stays sparse after fix", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Overview has the most XAxes:
    //   MetricChart ×3 (GPU util, CPU util, Memory) → 3 XAxes
    //   OverviewStorageChart ×N devices (typically 2-4) → N XAxes
    // Pre-fix:  ~120 tspans/axis × ~5 axes = 600+ connected tspans
    // Post-fix: ~6  tspans/axis × ~5 axes = 30  connected tspans
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Wait for charts to fully render and the interval to fire a few times
    await page.waitForTimeout(10_000);

    const tspanCount = await page.evaluate(
      () => document.querySelectorAll("tspan").length,
    );
    console.log(`Connected tspan count on Overview: ${tspanCount}`);

    // Threshold: 200 comfortably catches pre-fix (600+) while allowing post-fix
    // (~30) plus any legend/tooltip/YAxis tspans we didn't count above.
    expect(
      tspanCount,
      `Too many connected tspans (${tspanCount}) — XAxis is still dense (pre-fix code in effect)`,
    ).toBeLessThan(200);
  });
});
