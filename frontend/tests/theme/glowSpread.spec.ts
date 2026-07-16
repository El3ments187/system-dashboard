/**
 * Glow spread + affine-blur tests.
 *
 * Tests 1, 2, 2b, 3, 4 FAIL before the fix (no spread, linear blur) and PASS after.
 * Tests 2c and 5 pass both before and after (guard / regression tests).
 *
 * Approach for parsing computed box-shadow:
 *   - `rgba()` / `oklab()` color functions never use the `px` unit, so every
 *     `Npx` token in the serialised string is a shadow measurement.
 *   - Each layer contributes exactly 4 `px` values: offset-x, offset-y, blur, spread.
 *   - With Neon ON only: 3 layers → 12 px tokens.
 *       indices 0-3: tight card-glow  (spread at [3])
 *       indices 4-7: wide card-glow   (spread at [7], blur at [6])
 *       indices 8-11: transparent inner-glow (all 0)
 *   - With Neon ON + Inner Glow ON: still 2 layers on ::after (inner glow now uses
 *       background-image on card containers, not inset box-shadow on ::after).
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const THEME_URL = `${BASE_URL}/theme`;
const GLOW_TARGET_SEL = ".accent-glow-target";
const LLAMA_CARD_SEL = 'div[data-accent-el][style*="linear-gradient"]';

async function waitForTheme(page: Page) {
  await page.goto(THEME_URL);
  await page.waitForSelector(".theme-page", { timeout: 8000 });
}

async function setAttrs(
  page: Page,
  attrs: Record<string, string | null>,
) {
  await page.evaluate((map) => {
    for (const [k, v] of Object.entries(map)) {
      if (v === null) document.documentElement.removeAttribute(k);
      else document.documentElement.setAttribute(k, v);
    }
  }, attrs);
}

async function setCssVar(page: Page, name: string, value: string) {
  await page.evaluate(
    ([n, v]) => document.documentElement.style.setProperty(n, v),
    [name, value],
  );
}

/** Extract all Npx values from a box-shadow string in document order. */
async function getAfterPx(page: Page, sel: string): Promise<number[]> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return [];
    const shadow = window.getComputedStyle(el, "::after").boxShadow;
    return [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) =>
      parseFloat(m[1]),
    );
  }, sel);
}

/** Extract all Npx values from the element's own box-shadow. */
async function getElementPx(page: Page, sel: string): Promise<number[]> {
  return page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return [];
    const shadow = window.getComputedStyle(el).boxShadow;
    return [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) =>
      parseFloat(m[1]),
    );
  }, sel);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests 1, 2/2b, 2c, 3 — ::after on .accent-glow-target via the Theme page.
// ──────────────────────────────────────────────────────────────────────────────

test.describe("Glow spread + affine blur", () => {
  test.beforeEach(async ({ page }) => {
    await waitForTheme(page);
    await page.evaluate(() => {
      localStorage.setItem("dashboard-accent-mode", "single");
    });
  });

  test("1: Neon Glow ON — glow-target ::after has non-zero spread", async ({
    page,
  }) => {
    // BEFORE fix: box-shadow `0 0 calc(6px*I) ...` has no spread (0px at index 3).
    // AFTER  fix: spread = calc(1px*I) > 0.
    await waitForTheme(page);
    await setAttrs(page, { "data-glow": "neon" });
    await setCssVar(page, "--glow-intensity", "1.4");

    const px = await getAfterPx(page, GLOW_TARGET_SEL);
    expect(px.length, "::after not found or no px values").toBeGreaterThan(3);
    // Index 3 is the spread of the first (tight) card-glow layer.
    expect(px[3], "tight spread should be non-zero after fix").toBeGreaterThan(
      0,
    );
  });

  test("2: Spread doubles when intensity doubles; blur grows sub-linearly (2b)", async ({
    page,
  }) => {
    // Spread contract: spread = k·I, so doubling I doubles spread.
    // Blur contract:   blur  = base + k·I, so doubling I < doubles blur.
    // BEFORE fix: spread always 0 (fails spread>0 check); blur is k·I (exactly doubles, fails <2×).
    await waitForTheme(page);
    await setAttrs(page, { "data-glow": "neon" });

    await setCssVar(page, "--glow-intensity", "2");
    const px2 = await getAfterPx(page, GLOW_TARGET_SEL);

    await setCssVar(page, "--glow-intensity", "4");
    const px4 = await getAfterPx(page, GLOW_TARGET_SEL);

    expect(px2.length, "::after not found at intensity 2").toBeGreaterThan(7);
    expect(px4.length, "::after not found at intensity 4").toBeGreaterThan(7);

    const spread2 = px2[3]; // tight spread at intensity 2
    const spread4 = px4[3]; // tight spread at intensity 4
    const blur2 = px2[6];   // wide blur at intensity 2
    const blur4 = px4[6];   // wide blur at intensity 4

    // Test 2: spread is non-zero and doubles
    expect(spread2, "spread at intensity 2 must be > 0").toBeGreaterThan(0);
    expect(spread4).toBeCloseTo(spread2 * 2, 1);

    // Test 2b: blur is strictly sub-linear (base + k·I, not k·I)
    expect(blur4, "blur must grow sub-linearly: blur@4 < 2 × blur@2").toBeLessThan(blur2 * 2);
  });

  test("2c: Default size guard — wide card-glow blur ≈ 28px at intensity 1.4", async ({
    page,
  }) => {
    // Passes BOTH before and after the fix (bases chosen to preserve default size).
    // Today: 20 × 1.4 = 28.0px.  After: 14 + 10 × 1.4 = 28.0px.
    await waitForTheme(page);
    await setAttrs(page, { "data-glow": "neon" });
    await setCssVar(page, "--glow-intensity", "1.4");

    const px = await getAfterPx(page, GLOW_TARGET_SEL);
    expect(px.length).toBeGreaterThan(7);
    expect(px[6]).toBeCloseTo(28, 0); // ±0.5px tolerance
  });

  test("3: Inner Glow ON — ::after has only card-glow layers (no inset); card container has gradient wash", async ({
    page,
  }) => {
    // Inner Glow was changed from an inset box-shadow on ::after to a
    // background-image gradient on card containers. The old assertion checked for
    // inset spread on the spine's ::after — that mechanism no longer exists.
    // New assertions: ::after has no inset, and a card container has the gradient.
    await waitForTheme(page);
    await setAttrs(page, {
      "data-glow": "neon",
      "data-inner-glow": "on",
    });
    await setCssVar(page, "--inner-glow-intensity", "1.4");

    const shadow = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? window.getComputedStyle(el, "::after").boxShadow : "";
    }, GLOW_TARGET_SEL);

    expect(shadow, "::after not found").not.toBe("");
    expect(
      shadow,
      "::after must not contain inset — Inner Glow now uses background-image, not inset box-shadow",
    ).not.toContain("inset");

    const cardHasGradient = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-accent-el]:not(.accent-spine):not(.accent-fill):not(.accent-glow-target)",
        ),
      );
      return cards.some((el) =>
        getComputedStyle(el).backgroundImage.includes("linear-gradient"),
      );
    });
    expect(
      cardHasGradient,
      "Inner Glow ON: a card container must have linear-gradient backgroundImage",
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4 — per-element parity in Spectrum mode.
// ──────────────────────────────────────────────────────────────────────────────

test("4: Spectrum mode — per-element card-glow spread is non-zero", async ({
  page,
}) => {
  // In Spectrum mode, site 2 re-declares --card-glow on [style*="--el-index"]
  // descendants.  Before fix, site 2 has no spread → spread = 0.
  // After fix, both site 1 and site 2 have spread.
  await waitForTheme(page);
  await setAttrs(page, {
    "data-accent-mode": "spectrum",
    "data-glow": "neon",
  });
  await setCssVar(page, "--glow-intensity", "1.4");

  const px = await getAfterPx(page, GLOW_TARGET_SEL);
  expect(px.length, "::after not found in Spectrum mode").toBeGreaterThan(3);
  expect(px[3], "spread must be non-zero for per-element glow in Spectrum mode").toBeGreaterThan(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 5 — ambient card-halo layer keeps spread 0 (passes both before and after).
// ──────────────────────────────────────────────────────────────────────────────

test("5: Card Glow ON — ambient halo layer spread is always 0", async ({
  page,
}) => {
  // The ambient layer (rgba(primary-rgb, 0.12)) must never have spread.
  // This guards against accidentally adding spread to the ambient layer.
  // Card container box-shadow: shadow-card(2) + card-glow(2) + card-halo(2) = 6 layers = 24 px tokens.
  // The ambient is the last layer: spread at index 23.
  await page.goto(`${BASE_URL}/llama-cpp`);
  await page.waitForSelector(".app-root", { timeout: 10000 });
  await setAttrs(page, {
    "data-card-glow": "on",
    "data-glow": "neon",
    "data-accent-mode": "single",
  });
  await setCssVar(page, "--glow-intensity", "1.4");

  const px = await getElementPx(page, LLAMA_CARD_SEL);
  // 6 layers × 4 px tokens = 24 tokens.
  expect(px.length, "expected 24 px tokens (6 shadow layers)").toBe(24);
  // Last layer (ambient) spread at index 23.
  expect(px[23], "ambient halo layer must have spread 0").toBe(0);
});
