import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForAppReady(page: Page) {
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

const PAGES = [
  { name: "Overview", path: "/", selector: ".ov-card" },
  { name: "CPU", path: "/cpu", selector: ".metric-card.card" },
  { name: "GPU", path: "/gpu", selector: ".metric-card.card" },
  { name: "Settings", path: "/settings", selector: ".settings-card" },
  { name: "AI", path: "/ai", selector: '[role="article"]' },
  { name: "Theme", path: "/theme", selector: '[role="article"]' },
] as const;

async function enableInnerGlow(page: Page) {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-inner-glow", "on");
  });
}

async function disableInnerGlow(page: Page) {
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-inner-glow");
  });
}

/**
 * Parse the alpha channel from the first colour stop in a CSS backgroundImage
 * gradient string. Chromium serialises color-mix() results as oklab() when the
 * source colour is oklch-based, so we try that format before falling back to rgba().
 * The transparent second stop is always rgba(0,0,0,0) and must not be matched first.
 */
function parseFirstColorAlpha(bgImage: string): number | null {
  // oklab(L a b / alpha) or oklch(L C H / alpha) — the accent-colour first stop
  const okMatch = bgImage.match(/(?:oklab|oklch)\([^/]+\/\s*([\d.]+)/);
  if (okMatch) return parseFloat(okMatch[1]);
  // rgba(R, G, B, alpha) fallback
  const rgbaMatch = bgImage.match(
    /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/,
  );
  if (!rgbaMatch) return null;
  return rgbaMatch[1] !== undefined ? parseFloat(rgbaMatch[1]) : 1;
}

/**
 * Return a string that uniquely identifies the hue of the first colour stop so
 * we can compare two cards for different accent colours in Spectrum mode.
 * Handles both oklab(L a b /…) (Chromium serialisation of oklch sources) and rgba().
 */
function parseFirstColorKey(bgImage: string): string | null {
  // oklab(L a b / alpha) — L, a, b encode the hue
  const okMatch = bgImage.match(
    /(?:oklab|oklch)\(\s*(-?[\d.e+]+)\s+(-?[\d.e+]+)\s+(-?[\d.e+]+)/,
  );
  if (okMatch) return `${okMatch[1]},${okMatch[2]},${okMatch[3]}`;
  // rgba(R, G, B, …)
  const rgbaMatch = bgImage.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/,
  );
  if (rgbaMatch) return `${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]}`;
  return null;
}

test.describe("Inner Glow Wash", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.evaluate(() => {
      localStorage.removeItem("dashboard-inner-glow");
      localStorage.removeItem("dashboard-accent-mode");
    });
  });

  // ── Test 1 (RED pre-fix) ──────────────────────────────────────────────────
  // Pre-fix the CSS rule sets --accent-inner-glow (a box-shadow variable), never
  // background-image, so backgroundImage stays "none" on every card.
  test("1: Inner Glow ON → every card on every page has linear-gradient backgroundImage", async ({
    page,
  }) => {
    for (const { name, path, selector } of PAGES) {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await enableInnerGlow(page);
      await page.waitForTimeout(100);

      const cards = page.locator(selector);
      const count = await cards.count();
      expect(
        count,
        `${name}: expected at least one card matching "${selector}"`,
      ).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const bgImage = await cards
          .nth(i)
          .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(
          bgImage,
          `${name} card[${i}] (${selector}): backgroundImage should contain linear-gradient with Inner Glow ON`,
        ).toContain("linear-gradient");
      }
    }
  });

  // ── Test 2 (GREEN pre-fix, must stay green) ───────────────────────────────
  test("2: Inner Glow OFF → every card backgroundImage is none", async ({
    page,
  }) => {
    for (const { name, path, selector } of PAGES) {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await disableInnerGlow(page);
      await page.waitForTimeout(100);

      const cards = page.locator(selector);
      const count = await cards.count();
      expect(
        count,
        `${name}: expected at least one card matching "${selector}"`,
      ).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const bgImage = await cards
          .nth(i)
          .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(
          bgImage,
          `${name} card[${i}]: backgroundImage should be none with Inner Glow OFF`,
        ).toBe("none");
      }
    }
  });

  // ── Test 3 (RED pre-fix) ──────────────────────────────────────────────────
  // Pre-fix: backgroundImage is "none" so no alpha can be parsed — fails immediately.
  // Post-fix: at intensity 2 → 14% alpha; at intensity 4 → 28% alpha (doubles).
  test("3: Intensity = brightness: doubling intensity doubles first-colour alpha (both under clamp)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await enableInnerGlow(page);

    const card = page.locator(".ov-card").first();

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--inner-glow-intensity", "2");
    });
    await page.waitForTimeout(100);

    const bgAt2 = await card.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(bgAt2, "linear-gradient must be present at intensity 2").toContain(
      "linear-gradient",
    );
    const alpha2 = parseFirstColorAlpha(bgAt2);
    expect(
      alpha2,
      "Should parse an alpha value from backgroundImage at intensity 2",
    ).not.toBeNull();

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--inner-glow-intensity", "4");
    });
    await page.waitForTimeout(100);

    const bgAt4 = await card.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(bgAt4, "linear-gradient must be present at intensity 4").toContain(
      "linear-gradient",
    );
    const alpha4 = parseFirstColorAlpha(bgAt4);
    expect(
      alpha4,
      "Should parse an alpha value from backgroundImage at intensity 4",
    ).not.toBeNull();

    // min(60%, 7%*2)=14% → α≈0.14; min(60%, 7%*4)=28% → α≈0.28 (double)
    expect(
      alpha4!,
      "Alpha at intensity 4 should be double alpha at intensity 2 (both under clamp)",
    ).toBeCloseTo(alpha2! * 2, 1);
  });

  // ── Test 4 (RED pre-fix) ──────────────────────────────────────────────────
  // Post-fix: min(60%, 7%*9) = min(60%, 63%) = 60% → α = 0.60 (clamped, not 0.63).
  // The min() is mandatory: without it color-mix() would receive >100% and silently
  // drop the whole declaration.
  test("4: Clamp holds: intensity 9 → first-colour alpha ≈ 0.60 and linear-gradient still present", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await enableInnerGlow(page);

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--inner-glow-intensity", "9");
    });
    await page.waitForTimeout(100);

    const card = page.locator(".ov-card").first();
    const bgImage = await card.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(
      bgImage,
      "linear-gradient must still be present at intensity 9 (declaration must not drop)",
    ).toContain("linear-gradient");

    const alpha = parseFirstColorAlpha(bgImage);
    expect(
      alpha,
      "Should parse an alpha value from backgroundImage at intensity 9",
    ).not.toBeNull();
    expect(
      alpha!,
      "Alpha at intensity 9 must be clamped to ~0.60, not 0.63",
    ).toBeCloseTo(0.6, 1);
  });

  // ── Test 5 (RED pre-fix) ──────────────────────────────────────────────────
  // var(--accent-primary) resolves at the card itself (variables.css:1006 re-declares
  // it per --el-index under spectrum/rainbow-wave). No twin block needed.
  test("5: Per-element hue: in Spectrum mode two cards on the same page have different first-colour RGB", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent-mode", "spectrum");
      document.documentElement.setAttribute("data-inner-glow", "on");
    });
    await page.waitForTimeout(200);

    const cards = page.locator(".ov-card");
    const count = await cards.count();
    expect(
      count,
      "Need at least 2 Overview cards for per-element hue test",
    ).toBeGreaterThanOrEqual(2);

    const bgImages: string[] = await cards.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundImage),
    );

    const colorKeys = bgImages
      .map(parseFirstColorKey)
      .filter(Boolean) as string[];
    expect(
      colorKeys.length,
      "Should get parseable colour keys from at least 2 cards",
    ).toBeGreaterThanOrEqual(2);

    const uniqueKeys = new Set(colorKeys);
    expect(
      uniqueKeys.size,
      "Cards in Spectrum mode must have different first-colour key (per-element hue automatic via --el-index)",
    ).toBeGreaterThanOrEqual(2);
  });

  // ── Test 5b (GREEN pre-fix, must stay green) ──────────────────────────────
  // llama.cpp PANEL_CARD_STYLE hardcodes background: linear-gradient(…) as an
  // inline shorthand. The inline shorthand wins over CSS background-image rules,
  // so the wash is always present regardless of the Inner Glow toggle.
  // This asymmetry is accepted and out of scope (see Phase 2 notes).
  test("5b: llama.cpp panel cards always have linear-gradient backgroundImage (toggle-independent)", async ({
    page,
  }) => {
    for (const innerGlow of ["off", "on"] as const) {
      await page.goto(`${BASE_URL}/llama-cpp`);
      await waitForAppReady(page);

      if (innerGlow === "on") {
        await enableInnerGlow(page);
      } else {
        await disableInnerGlow(page);
      }
      await page.waitForTimeout(100);

      const gradientCount = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            "[data-accent-el]:not(.accent-spine):not(.accent-fill):not(.accent-glow-target)",
          ),
        ).filter((el) =>
          getComputedStyle(el).backgroundImage.includes("linear-gradient"),
        ).length,
      );

      expect(
        gradientCount,
        `Inner Glow ${innerGlow}: at least one llama-cpp panel card must always have linear-gradient (hardcoded, toggle-independent)`,
      ).toBeGreaterThan(0);
    }
  });

  // ── Test 6 (RED pre-fix) ──────────────────────────────────────────────────
  // Pre-fix: card backgroundImage is "none" (Inner Glow only sets a box-shadow variable).
  // Post-fix: Inner Glow sets background-image on the card; Gradient Border owns ::before.
  // The two effects use different CSS properties so they cannot clobber each other.
  test("6: No collision: Inner Glow + Gradient Border both ON → ::before has ring and card has wash", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-inner-glow", "on");
      document.documentElement.setAttribute("data-gradient-border", "on");
    });
    await page.waitForTimeout(200);

    const card = page.locator(".ov-card").first();

    const cardBgImage = await card.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(
      cardBgImage,
      "Card backgroundImage must contain linear-gradient wash with Inner Glow ON",
    ).toContain("linear-gradient");

    const beforeBgImage = await card.evaluate(
      (el) => getComputedStyle(el, "::before").backgroundImage,
    );
    expect(
      beforeBgImage,
      "Card ::before must still contain the Gradient Border ring gradient (not clobbered by Inner Glow)",
    ).toContain("linear-gradient");
  });

  // ── Test 7 (GREEN pre-fix, must stay green) ───────────────────────────────
  // After Phase 2c removes --accent-inner-glow from .accent-glow-target::after,
  // the spine's outer Neon Glow box-shadow is identical regardless of Inner Glow
  // toggle state. Pre-fix: --accent-inner-glow is still in the box-shadow formula
  // so if this is RED pre-fix, it signals the current code DOES alter the spine's
  // box-shadow — exactly the bug Phase 2c fixes.
  test("7: Neon Glow unaffected: spine ::after boxShadow identical with Inner Glow on vs off", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
    });
    await page.waitForTimeout(100);

    await disableInnerGlow(page);
    const boxShadowOff = await page
      .locator(".card-accent-spine")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").boxShadow);

    await enableInnerGlow(page);
    await page.waitForTimeout(100);
    const boxShadowOn = await page
      .locator(".card-accent-spine")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").boxShadow);

    expect(
      boxShadowOn,
      "Spine ::after boxShadow must be identical with Inner Glow on vs off (Neon Glow must not be affected by Inner Glow toggle)",
    ).toBe(boxShadowOff);
  });
});
