/**
 * Soak harness — NOT a crash test.
 *
 * Runs all animated theme effects for 60 s and measures JS heap growth.
 * The Chrome renderer SIGILL crash is a native driver bug, not a JS OOM —
 * this test only guards against JS memory leaks while animated effects run.
 * Record MTBC per phase in docs/crash-bisect.md as you bisect the native crash.
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

test.describe("Soak harness — JS leak guard (NOT a crash test)", () => {
  test("heap growth stays under 30 MB over 60 s with all animated effects", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-accent-mode", "rainbow-wave");
      d.setAttribute("data-glow", "neon");
      d.setAttribute("data-inner-glow", "on");
      d.setAttribute("data-gradient-border", "on");
      d.setAttribute("data-card-glow", "on");
      d.setAttribute("data-breathe", "on");
      d.setAttribute("data-pulse", "on");
      d.style.setProperty("--fx-speed", "2s");
      d.style.setProperty("--breathe-speed", "1s");
      d.style.setProperty("--pulse-speed", "1s");
    });

    await page.waitForTimeout(3_000);

    const heapBefore = await page.evaluate(() => {
      const mem = (
        performance as unknown as {
          memory?: { usedJSHeapSize: number };
        }
      ).memory;
      return mem?.usedJSHeapSize ?? 0;
    });

    await page.waitForTimeout(60_000);

    const heapAfter = await page.evaluate(() => {
      const mem = (
        performance as unknown as {
          memory?: { usedJSHeapSize: number };
        }
      ).memory;
      return mem?.usedJSHeapSize ?? 0;
    });

    const growthMB = (heapAfter - heapBefore) / 1_048_576;
    console.log(
      `Heap: before=${(heapBefore / 1_048_576).toFixed(1)} MB  ` +
        `after=${(heapAfter / 1_048_576).toFixed(1)} MB  ` +
        `growth=${growthMB.toFixed(1)} MB`,
    );
    expect(
      growthMB,
      `JS heap grew ${growthMB.toFixed(1)} MB — possible JS leak`,
    ).toBeLessThan(30);
  });
});
