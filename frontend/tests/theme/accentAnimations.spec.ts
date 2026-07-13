/**
 * Animated accent crash-hardening E2E guard tests — Phase 7.
 *
 * Verifies the Phase 2–5 fixes work in a real Chromium browser:
 *   – Rainbow Wave uses filter: hue-rotate() (hue-spin keyframe), not accent-spin-rotate
 *   – prefers-reduced-motion: reduce suppresses all accent animations
 *   – No console errors during animated theme operation
 *   – data-fx-safe="on" disables the hue-spin animation (kill-switch)
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// ── Phase 2: hue-spin wiring ──────────────────────────────────────────────────

test.describe("Rainbow Wave — hue-spin wiring (Phase 2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  });

  test("rainbow-wave animation name is hue-spin, not accent-spin-rotate", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent-mode", "rainbow-wave");
    });
    await page.waitForTimeout(100);

    const animName = await page.evaluate(
      () => getComputedStyle(document.documentElement).animationName,
    );

    expect(animName).toContain("hue-spin");
    expect(animName).not.toContain("accent-spin-rotate");
  });

  test("filter value on root element changes over time in rainbow-wave mode", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-accent-mode", "rainbow-wave");
      d.style.setProperty("--fx-speed", "0.4s");
    });
    await page.waitForTimeout(150);

    const f0 = await page.evaluate(
      () => getComputedStyle(document.documentElement).filter,
    );
    await page.waitForTimeout(150);
    const f1 = await page.evaluate(
      () => getComputedStyle(document.documentElement).filter,
    );

    expect(f0).not.toBe(f1);
  });
});

// ── Reduced motion ────────────────────────────────────────────────────────────

test.describe("Reduced motion — accent animations suppressed", () => {
  test("rainbow-wave animation is none under prefers-reduced-motion: reduce", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent-mode", "rainbow-wave");
    });
    await page.waitForTimeout(100);

    const animName = await page.evaluate(
      () => getComputedStyle(document.documentElement).animationName,
    );
    expect(animName).toBe("none");
  });
});

// ── Console errors ────────────────────────────────────────────────────────────

test.describe("Console errors — no errors during animated themes", () => {
  test("no console errors during 3 s of rainbow-wave with all glow effects", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-accent-mode", "rainbow-wave");
      d.setAttribute("data-glow", "neon");
      d.setAttribute("data-gradient-border", "on");
      d.setAttribute("data-inner-glow", "on");
      d.setAttribute("data-breathe", "on");
      d.style.setProperty("--fx-speed", "1s");
      d.style.setProperty("--breathe-speed", "1s");
    });

    await page.waitForTimeout(3_000);

    expect(
      errors,
      `Unexpected console errors: ${errors.join(" | ")}`,
    ).toHaveLength(0);
  });
});

// ── Phase 5: FX-Safe kill-switch ──────────────────────────────────────────────

test.describe("FX-Safe kill-switch (Phase 5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  });

  test("data-fx-safe=on disables rainbow-wave hue-spin animation", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-accent-mode", "rainbow-wave");
      d.setAttribute("data-fx-safe", "on");
    });
    await page.waitForTimeout(100);

    const animName = await page.evaluate(
      () => getComputedStyle(document.documentElement).animationName,
    );
    expect(animName).toBe("none");
  });

  test("removing data-fx-safe re-enables rainbow-wave animation", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-accent-mode", "rainbow-wave");
      d.setAttribute("data-fx-safe", "on");
    });
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-fx-safe");
    });
    await page.waitForTimeout(100);

    const animName = await page.evaluate(
      () => getComputedStyle(document.documentElement).animationName,
    );
    expect(animName).toContain("hue-spin");
  });

  test("data-fx-safe=on disables gradient-border animation on accent elements", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const d = document.documentElement;
      d.setAttribute("data-gradient-border", "on");
      d.setAttribute("data-fx-safe", "on");
    });
    await page.waitForTimeout(100);

    const accentEl = page.locator("[data-accent-el]").first();
    const count = await accentEl.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const animName = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-accent-el]");
      if (!el) return "";
      return getComputedStyle(el, "::before").animationName;
    });
    expect(animName).toBe("none");
  });
});
