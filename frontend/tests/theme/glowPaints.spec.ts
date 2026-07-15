import { test, expect, type Page } from "@playwright/test";
import { getCssVariable } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const TRANSPARENT_GLOW = "0 0 0 rgba(0, 0, 0, 0)";

async function waitForAppReady(page: Page, path = "/") {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForSelector(".app-root", { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function enableNeonGlow(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-glow", "neon"),
  );
  await page.waitForTimeout(60);
}

async function disableNeonGlow(page: Page) {
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-glow"),
  );
  await page.waitForTimeout(60);
}

async function enableInnerGlow(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-inner-glow", "on"),
  );
  await page.waitForTimeout(60);
}

async function disableInnerGlow(page: Page) {
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-inner-glow"),
  );
  await page.waitForTimeout(60);
}

// Returns true when the box-shadow string contains a visible (non-transparent) color.
// Handles Chromium's oklab/oklch serialization of color-mix() results.
function shadowHasVisibleColor(bs: string): boolean {
  if (bs === "none") return false;
  const stripped = bs
    .replace(/rgba?\(0,\s*0,\s*0,?\s*0(?:\.0+)?\)/gi, "")
    .trim();
  return /(?:rgb|hsl|oklab|oklch|lch|lab|color|hwb)\s*\(/.test(stripped);
}

// ── Neon Glow: ::after box-shadow on/off ─────────────────────────────────

test.describe("Glow Paint: Neon Glow ::after rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("Overview: Neon Glow ON — some .accent-glow-target ::after has visible box-shadow", async ({
    page,
  }) => {
    await waitForAppReady(page, "/");
    await enableNeonGlow(page);

    const hasVisible = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll(".accent-glow-target"),
      );
      return targets.some((el) => {
        const bs = window.getComputedStyle(el, "::after").boxShadow;
        if (bs === "none") return false;
        const stripped = bs
          .replace(/rgba?\(0,\s*0,\s*0,?\s*0(?:\.0+)?\)/gi, "")
          .trim();
        return /(?:rgb|hsl|oklab|oklch|lch|lab|color|hwb)\s*\(/.test(stripped);
      });
    });

    expect(
      hasVisible,
      "Neon Glow ON: no .accent-glow-target had a visible ::after box-shadow",
    ).toBe(true);
  });

  test("Overview: Neon Glow OFF — no .accent-glow-target ::after has visible box-shadow", async ({
    page,
  }) => {
    await waitForAppReady(page, "/");
    await disableNeonGlow(page);

    const violations = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(".accent-glow-target"),
      );
      return targets
        .filter((el) => {
          const bs = window.getComputedStyle(el, "::after").boxShadow;
          if (bs === "none") return false;
          const stripped = bs
            .replace(/rgba?\(0,\s*0,\s*0,?\s*0(?:\.0+)?\)/gi, "")
            .trim();
          return /(?:rgb|hsl|oklab|oklch|lch|lab|color|hwb)\s*\(/.test(
            stripped,
          );
        })
        .map((el) => el.className);
    });

    expect(
      violations,
      `Neon Glow OFF: these targets still show a glow:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });
});

// ── Inner Glow: inset ::after on bar targets ──────────────────────────────
// Test 2c.2 — FAILS today (no bar is a glow target). Passes after Phase 1.

test.describe("Glow Paint: Inner Glow on bars (::after inset)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("CPU: Inner Glow ON — some bar target ::after has inset shadow", async ({
    page,
  }) => {
    await waitForAppReady(page, "/cpu");
    await enableInnerGlow(page);

    const hasInset = await page.evaluate(() => {
      const barTargets = Array.from(
        document.querySelectorAll(
          '.card-progress-bar.accent-glow-target, .accent-fill.accent-glow-target:not(.card-accent-spine)',
        ),
      );
      return barTargets.some((el) =>
        window.getComputedStyle(el, "::after").boxShadow.includes("inset"),
      );
    });

    expect(
      hasInset,
      "Inner Glow ON: no bar .accent-glow-target showed an inset ::after box-shadow — are bars tagged?",
    ).toBe(true);
  });

  test("CPU: Inner Glow OFF — no bar target ::after has inset shadow", async ({
    page,
  }) => {
    await waitForAppReady(page, "/cpu");
    await disableInnerGlow(page);

    const violations = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.card-progress-bar.accent-glow-target, .accent-fill.accent-glow-target:not(.card-accent-spine)',
        ),
      )
        .filter((el) =>
          window.getComputedStyle(el, "::after").boxShadow.includes("inset"),
        )
        .map((el) => el.className),
    );

    expect(
      violations,
      `Inner Glow OFF: bar targets still showing inset shadow:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });
});

// ── Positive control: --card-glow CSS variable ───────────────────────────
// Model-independent; does not require a live llama.cpp instance.

test.describe("Glow Paint: --card-glow positive control", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("--card-glow is transparent when Neon Glow is off", async ({ page }) => {
    await waitForAppReady(page, "/");
    await disableNeonGlow(page);

    const val = await getCssVariable(page, "--card-glow");
    expect(val).toBe(TRANSPARENT_GLOW);
  });

  test("--card-glow is non-transparent when Neon Glow is on", async ({
    page,
  }) => {
    await waitForAppReady(page, "/");
    await enableNeonGlow(page);

    const val = await getCssVariable(page, "--card-glow");
    expect(val).not.toBe(TRANSPARENT_GLOW);
  });
});
