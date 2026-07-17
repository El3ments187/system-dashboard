import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// Any element with an accent hue AND a spine as a direct child.
// [data-accent-el] (presence) matches both ="" (cards) and ="inherit" (ChartFrame).
// :has(> .card-accent-spine) excludes nav buttons, tiles and KvRows.
const CARD_SEL = '[data-accent-el]:has(> .card-accent-spine)';

// ChartFrame selector (data-accent-el="inherit") — receives the wash via CARD_SEL presence match
const CHART_SEL = '[data-accent-el="inherit"]';

async function waitForAppReady(page: Page) {
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "llama.cpp", path: "/llama-cpp" },
  { name: "AI", path: "/ai" },
  { name: "Settings", path: "/settings" },
  { name: "Theme", path: "/theme" },
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
 * gradient string. Chromium serialises color-mix(in srgb, …) results as
 * color(srgb R G B / alpha). It serialises oklch relative-colour results as
 * oklab(). The transparent second stop is always rgba(0,0,0,0) and must not
 * be matched first — so we check color(srgb) and oklab/oklch before rgba.
 */
function parseFirstColorAlpha(bgImage: string): number | null {
  // color(srgb R G B / alpha) — Chromium serialises color-mix(in srgb, …) results here
  const srgbMatch = bgImage.match(
    /color\(srgb\s+[\d.]+\s+[\d.]+\s+[\d.]+\s*\/\s*([\d.]+)/,
  );
  if (srgbMatch) return parseFloat(srgbMatch[1]);
  // oklab(L a b / alpha) or oklch(L C H / alpha) — oklch relative-colour results
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
 * Handles color(srgb R G B) (Chromium color-mix serialisation), oklab/oklch,
 * and rgba — in that order so the transparent second stop never matches first.
 */
function parseFirstColorKey(bgImage: string): string | null {
  // color(srgb R G B …) — Chromium serialises color-mix(in srgb, …) results here
  const srgbMatch = bgImage.match(
    /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/,
  );
  if (srgbMatch) return `${srgbMatch[1]},${srgbMatch[2]},${srgbMatch[3]}`;
  // oklab(L a b …) or oklch(L C H …)
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

  // ── Test 1 ────────────────────────────────────────────────────────────────
  // Pre-fix: llama.cpp cards block CSS via inline background: shorthand; Inner
  // Glow ON has no toggle-driven effect there. All other pages work with current impl.
  // Post-fix: inline shorthand removed → CSS gradient applies on every page.
  test("1: Inner Glow ON → every card on every page has linear-gradient backgroundImage", async ({
    page,
  }) => {
    for (const { name, path } of PAGES) {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await enableInnerGlow(page);
      await page.waitForTimeout(100);

      const cards = page.locator(CARD_SEL);
      const count = await cards.count();
      expect(
        count,
        `${name}: expected at least one card matching "${CARD_SEL}"`,
      ).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const bgImage = await cards
          .nth(i)
          .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(
          bgImage,
          `${name} card[${i}]: backgroundImage should contain linear-gradient with Inner Glow ON`,
        ).toContain("linear-gradient");
      }
    }
  });

  // ── Test 2 (RED pre-fix) ──────────────────────────────────────────────────
  // Pre-fix: llama.cpp panel cards hardcode `background: linear-gradient(…)` as
  // an inline shorthand. The shorthand wins over any CSS rule, so the gradient
  // remains even with Inner Glow OFF. Post-fix: backgroundColor lets the toggle govern.
  test("2: Inner Glow OFF → every card backgroundImage is none", async ({
    page,
  }) => {
    for (const { name, path } of PAGES) {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await disableInnerGlow(page);
      await page.waitForTimeout(100);

      const cards = page.locator(CARD_SEL);
      const count = await cards.count();
      expect(
        count,
        `${name}: expected at least one card matching "${CARD_SEL}"`,
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

  // ── Test 3 ────────────────────────────────────────────────────────────────
  // Post-fix: min(60%, 7%*2)=14% → α≈0.14; min(60%, 7%*4)=28% → α≈0.28 (double).
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

    expect(
      alpha4!,
      "Alpha at intensity 4 should be double alpha at intensity 2 (both under clamp)",
    ).toBeCloseTo(alpha2! * 2, 1);
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  // Post-fix: min(60%, 7%*9) = min(60%, 63%) = 60% → α = 0.60 (clamped, not 0.63).
  // The min() clamp is mandatory: without it color-mix() receives >100% and silently
  // drops the whole declaration.
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

  // ── Test 5 ────────────────────────────────────────────────────────────────
  // var(--accent-primary) resolves at the card itself (variables.css re-declares it
  // per --el-index under spectrum/rainbow-wave). ChartFrame uses data-accent-el="inherit"
  // and opts out of --el-index, so charts share the base hue — use exact ="" to test
  // only elements that carry their own per-element hue.
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

    // Cards only (exact ="" match) — charts opt out of --el-index and share base hue
    const cards = page.locator('[data-accent-el=""]:has(> .card-accent-spine)');
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

  // ── Test 6 ────────────────────────────────────────────────────────────────
  // Inner Glow uses background-image on the card element itself; Gradient Border
  // owns ::before. Different CSS properties — they cannot clobber each other.
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
  // The spine's outer Neon Glow box-shadow must be identical regardless of the
  // Inner Glow toggle — Inner Glow does not touch box-shadow.
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
      "Spine ::after boxShadow must be identical with Inner Glow on vs off",
    ).toBe(boxShadowOff);
  });

  // ── Test 8 (GREEN pre-fix, must stay green) ───────────────────────────────
  // Guards the :has(> .card-accent-spine) part: elements with data-accent-el=""
  // but without a spine child must never receive the wash.
  test("8: Nothing else gets washed: nav button and MetricTile backgroundImage are none with Inner Glow ON", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await enableInnerGlow(page);
    await page.waitForTimeout(100);

    // Active nav button: data-accent-el="" with inline background: shorthand, no spine child
    const navBtn = page.locator(".dash-nav-btn.active").first();
    await expect(navBtn, "Active nav button must exist").toBeVisible();
    const navBgImage = await navBtn.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(
      navBgImage,
      "Active nav button must not receive Inner Glow wash",
    ).toBe("none");

    // MetricTile with accent: data-accent-el="" with inline background:, no spine child
    const tile = page.locator(".metric-tile[data-accent-el]").first();
    if ((await tile.count()) > 0) {
      const tileBgImage = await tile.evaluate(
        (el) => getComputedStyle(el).backgroundImage,
      );
      expect(tileBgImage, "MetricTile must not receive Inner Glow wash").toBe(
        "none",
      );
    }
  });

  // ── Test 9 ────────────────────────────────────────────────────────────────
  // ChartFrame uses data-accent-el="inherit" and IS matched by the presence selector
  // [data-accent-el]:has(> .card-accent-spine). The SVG/chart background is transparent,
  // so the wash on the ChartFrame element itself is what shows through.
  test("9: Charts included: chart-container elements have linear-gradient ON and none OFF", async ({
    page,
  }) => {
    for (const path of ["/", "/cpu", "/gpu"]) {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);

      const charts = page.locator(CHART_SEL);
      const count = await charts.count();
      if (count === 0) continue; // page has no charts

      // ON: each ChartFrame must receive the wash
      await enableInnerGlow(page);
      await page.waitForTimeout(100);
      for (let i = 0; i < count; i++) {
        const bgImage = await charts
          .nth(i)
          .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(
          bgImage,
          `${path} chart[${i}] (data-accent-el="inherit"): must have linear-gradient with Inner Glow ON`,
        ).toContain("linear-gradient");
      }

      // OFF: each ChartFrame wash must disappear
      await disableInnerGlow(page);
      await page.waitForTimeout(100);
      for (let i = 0; i < count; i++) {
        const bgImage = await charts
          .nth(i)
          .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(
          bgImage,
          `${path} chart[${i}] (data-accent-el="inherit"): must have backgroundImage none with Inner Glow OFF`,
        ).toBe("none");
      }
    }
  });

  // ── Test 10 ───────────────────────────────────────────────────────────────
  // The Theme page's Live Preview must show chart parity: its chart must use a
  // real ChartFrame (data-accent-el="inherit" + spine child) so it receives the
  // same wash as real chart cards on other pages.
  // Pre-fix: preview uses a bespoke .preview-chart div (no spine) → count = 0.
  test("10: Preview parity: /theme has ≥1 chart-container matching presence selector, washed ON and none OFF", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await waitForAppReady(page);

    // Structural: must have at least one real chart-container
    const count = await page.evaluate(
      () => document.querySelectorAll(".chart-container").length,
    );
    expect(
      count,
      "/theme must have at least one .chart-container element (requires real ChartFrame)",
    ).toBeGreaterThanOrEqual(1);

    // Each chart-container must match the presence selector
    const charts = page.locator(CHART_SEL);
    const chartCount = await charts.count();
    expect(
      chartCount,
      "/theme chart-container must match [data-accent-el]:has(> .card-accent-spine)",
    ).toBeGreaterThanOrEqual(1);

    // ON: must be washed
    await enableInnerGlow(page);
    await page.waitForTimeout(100);
    for (let i = 0; i < chartCount; i++) {
      const bgImage = await charts
        .nth(i)
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(
        bgImage,
        `/theme chart[${i}]: must have linear-gradient with Inner Glow ON`,
      ).toContain("linear-gradient");
    }

    // OFF: must disappear
    await disableInnerGlow(page);
    await page.waitForTimeout(100);
    for (let i = 0; i < chartCount; i++) {
      const bgImage = await charts
        .nth(i)
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(
        bgImage,
        `/theme chart[${i}]: must have backgroundImage none with Inner Glow OFF`,
      ).toBe("none");
    }
  });
});
