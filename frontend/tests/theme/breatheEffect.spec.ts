/**
 * Breathe effect correctness — TDD
 *
 * Confirmed defects under test:
 *   (b) Glow layers (::after box-shadow) must visibly change during the breathe cycle.
 *       Currently the ::after opacity is always 1 — glow is static while fills pulse.
 *   (c) Accent-fill bar elements (CPU/GPU per-core bars) must NOT breathe.
 *       Charts encode data; pulsing them misrepresents values.
 *   (e) Composition: both hold with all four glow effects enabled simultaneously.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function enableAllGlows(page: Page) {
  await page.evaluate(() => {
    const d = document.documentElement;
    d.setAttribute("data-glow", "neon");
    d.setAttribute("data-inner-glow", "on");
    d.setAttribute("data-gradient-border", "on");
    d.setAttribute("data-card-glow", "on");
    d.setAttribute("data-breathe", "on");
    d.style.setProperty("--breathe-speed", "1s"); // fast cycle for test stability
    d.style.setProperty("--breathe-intensity", "1");
  });
}

// ── (b) Glow must breathe ──────────────────────────────────────────────────────

test.describe("Breathe — glow ::after participates", () => {
  test("::after opacity changes during breathe cycle when neon glow is on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/llama-cpp`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-glow", "neon");
      d.setAttribute("data-breathe", "on");
      d.style.setProperty("--breathe-speed", "1s");
    });

    const t0 = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".accent-glow-target");
      if (!target) return null;
      return getComputedStyle(target, "::after").opacity;
    });

    await page.waitForTimeout(350); // ~35% into 1s cycle

    const t350 = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".accent-glow-target");
      if (!target) return null;
      return getComputedStyle(target, "::after").opacity;
    });

    expect(t0, "::after must have an opacity value").not.toBeNull();
    expect(t350, "::after must have an opacity value at T+350ms").not.toBeNull();
    expect(
      t0,
      "glow ::after opacity must change during breathe cycle (glow must breathe)",
    ).not.toBe(t350);
  });

  test("::after opacity changes with all four glow effects enabled (composition)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/llama-cpp`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await enableAllGlows(page);

    const t0 = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".accent-glow-target");
      if (!target) return null;
      return getComputedStyle(target, "::after").opacity;
    });

    await page.waitForTimeout(350);

    const t350 = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".accent-glow-target");
      if (!target) return null;
      return getComputedStyle(target, "::after").opacity;
    });

    expect(t0, "composition: ::after must have opacity").not.toBeNull();
    expect(
      t0,
      "composition: glow ::after opacity must change during breathe with all effects on",
    ).not.toBe(t350);
  });
});

// ── (c) Charts excluded ────────────────────────────────────────────────────────

test.describe("Breathe — accent-fill bars excluded", () => {
  test("accent-fill bar bright-breathe has animation:none (bars must not breathe)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-breathe", "on");
      document.documentElement.style.setProperty("--breathe-speed", "1s");
    });

    const animNames = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          ".accent-fill.accent-glow-target .bright-breathe",
        ),
      ).map((el) => getComputedStyle(el).animationName),
    );

    test.skip(animNames.length === 0, "No accent-fill bars present on CPU page");

    for (const name of animNames) {
      expect(
        name,
        "accent-fill bar bright-breathe must NOT run fx-breathe (charts excluded from breathe)",
      ).toBe("none");
    }
  });

  test("accent-fill bar opacity does not change during breathe cycle", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-breathe", "on");
      document.documentElement.style.setProperty("--breathe-speed", "1s");
    });

    const t0 = await page.evaluate(() => {
      const barBreathe = document.querySelector<HTMLElement>(
        ".accent-fill.accent-glow-target .bright-breathe",
      );
      return barBreathe ? getComputedStyle(barBreathe).opacity : null;
    });

    if (t0 === null) {
      test.skip(true, "No accent-fill bars present on CPU page");
      return;
    }

    await page.waitForTimeout(400);

    const t400 = await page.evaluate(() => {
      const barBreathe = document.querySelector<HTMLElement>(
        ".accent-fill.accent-glow-target .bright-breathe",
      );
      return barBreathe ? getComputedStyle(barBreathe).opacity : null;
    });

    expect(
      t0,
      "bar bright-breathe opacity must not change during breathe (charts excluded)",
    ).toBe(t400);
  });
});
