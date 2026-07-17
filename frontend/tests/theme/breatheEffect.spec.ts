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

// ── (c) Normal bars breathe; warning/critical excluded ────────────────────────

test.describe("Breathe — normal bars animate, warning/critical excluded (REQ-FX-70/80)", () => {
  test("normal-state accent-fill bars run fx-breathe when data-breathe=on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-breathe", "on");
      document.documentElement.style.setProperty("--breathe-speed", "1s");
    });

    // ThemePage preview bars have fixed percent values (65, 32, 57, 36) — all normal state
    const animNames = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.accent-fill.accent-glow-target[data-state="normal"] .bright-breathe',
        ),
      ).map((el) => getComputedStyle(el).animationName),
    );

    expect(
      animNames.length,
      "Must have normal-state accent-fill glow-target bars on ThemePage",
    ).toBeGreaterThan(0);

    for (const name of animNames) {
      expect(
        name,
        "normal-state bar bright-breathe MUST run fx-breathe",
      ).toBe("fx-breathe");
    }
  });

  test("warning-state accent-fill bars have animation:none for bright-breathe", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-breathe", "on");
      // Inject a synthetic warning bar into the DOM to test CSS exclusion
      const bar = document.createElement("div");
      bar.className = "accent-fill accent-glow-target";
      bar.setAttribute("data-state", "warning");
      bar.style.cssText = "position:fixed;top:-20px;width:10px;height:4px";
      const breathe = document.createElement("span");
      breathe.className = "bright-breathe";
      bar.appendChild(breathe);
      document.body.appendChild(bar);
    });

    const animName = await page.evaluate(() => {
      const breathe = document.querySelector<HTMLElement>(
        '.accent-fill.accent-glow-target[data-state="warning"] .bright-breathe',
      );
      return breathe ? getComputedStyle(breathe).animationName : null;
    });

    expect(animName, "warning-state bar bright-breathe must NOT animate").toBe("none");
  });

  test("critical-state accent-fill bars have animation:none for bright-breathe", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-breathe", "on");
      const bar = document.createElement("div");
      bar.className = "accent-fill accent-glow-target";
      bar.setAttribute("data-state", "critical");
      bar.style.cssText = "position:fixed;top:-20px;width:10px;height:4px";
      const breathe = document.createElement("span");
      breathe.className = "bright-breathe";
      bar.appendChild(breathe);
      document.body.appendChild(bar);
    });

    const animName = await page.evaluate(() => {
      const breathe = document.querySelector<HTMLElement>(
        '.accent-fill.accent-glow-target[data-state="critical"] .bright-breathe',
      );
      return breathe ? getComputedStyle(breathe).animationName : null;
    });

    expect(animName, "critical-state bar bright-breathe must NOT animate").toBe("none");
  });
});

// ── Pulse — normal bars animate, warning/critical excluded ────────────────────
// Mirrors the Breathe describe above. Pulse animates .accent-glow-target::before
// (a white gradient shine), not a child span. No ::after half needed — Pulse does
// not touch ::after (that belongs to Neon Glow).

test.describe("Pulse — normal bars animate, warning/critical excluded (REQ-FX-70/80)", () => {
  test("3 (positive control): normal-state accent-fill bar runs accent-pulse on ::before when data-pulse=on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.removeAttribute("data-fx-safe"); // prevent FX Safe Mode from zeroing animation
      d.setAttribute("data-pulse", "on");
      d.style.setProperty("--pulse-speed", "1s");
    });

    // Confirm prefers-reduced-motion is not active — if it is, Tests 1-2 are meaningless
    const reducedMotion = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(
      reducedMotion,
      "prefers-reduced-motion must be false — if true all animations are suppressed and tests 1-2 are meaningless",
    ).toBe(false);

    // Inject a synthetic normal-state bar to read ::before without React interference
    await page.evaluate(() => {
      const bar = document.createElement("div");
      bar.className = "accent-fill accent-glow-target";
      bar.setAttribute("data-state", "normal");
      bar.style.cssText = "position:fixed;top:-20px;width:10px;height:4px";
      document.body.appendChild(bar);
    });

    const animName = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(
        '.accent-fill.accent-glow-target[data-state="normal"]',
      );
      return bar ? getComputedStyle(bar, "::before").animationName : null;
    });

    expect(
      animName,
      "normal-state bar ::before MUST run accent-pulse with Pulse ON",
    ).toBe("accent-pulse");
  });

  test("1: warning-state accent-fill bar has animation:none on ::before when data-pulse=on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.removeAttribute("data-fx-safe");
      d.setAttribute("data-pulse", "on");
      const bar = document.createElement("div");
      bar.className = "accent-fill accent-glow-target";
      bar.setAttribute("data-state", "warning");
      bar.style.cssText = "position:fixed;top:-20px;width:10px;height:4px";
      document.body.appendChild(bar);
    });

    const animName = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(
        '.accent-fill.accent-glow-target[data-state="warning"]',
      );
      return bar ? getComputedStyle(bar, "::before").animationName : null;
    });

    expect(
      animName,
      "warning-state bar ::before must NOT animate with Pulse ON",
    ).toBe("none");
  });

  test("2: critical-state accent-fill bar has animation:none on ::before when data-pulse=on", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.removeAttribute("data-fx-safe");
      d.setAttribute("data-pulse", "on");
      const bar = document.createElement("div");
      bar.className = "accent-fill accent-glow-target";
      bar.setAttribute("data-state", "critical");
      bar.style.cssText = "position:fixed;top:-20px;width:10px;height:4px";
      document.body.appendChild(bar);
    });

    const animName = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(
        '.accent-fill.accent-glow-target[data-state="critical"]',
      );
      return bar ? getComputedStyle(bar, "::before").animationName : null;
    });

    expect(
      animName,
      "critical-state bar ::before must NOT animate with Pulse ON",
    ).toBe("none");
  });
});
