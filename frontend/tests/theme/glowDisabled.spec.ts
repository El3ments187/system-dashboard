import { test, expect, type Page } from "@playwright/test";
import { getCssVariable } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const EFFECT_LS_KEYS = [
  "dashboard-glow",
  "dashboard-card-glow",
  "dashboard-inner-glow",
  "dashboard-pulse",
  "dashboard-breathe",
  "dashboard-surge",
];

const GLOW_ATTRS = [
  "data-glow",
  "data-card-glow",
  "data-inner-glow",
  "data-pulse",
  "data-breathe",
  "data-surge",
];

// Transparent placeholder used for all glow tokens when effects are off
const TRANSPARENT_SHADOW = "rgba(0, 0, 0, 0)";

// Minimal mock that forces a quant-bearing model name onto the page
// (model_path basename "test-Q4_K_XL.gguf" → quant = "Q4_K_XL")
const MOCK_AI_METRICS = {
  data: {
    model_path: "/models/test-Q4_K_XL.gguf",
    llama_server: { available: true },
  },
};

async function waitForAppReady(page: Page) {
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

/** Sweeps every element; fails if any non-black text-shadow is found.
 *  Handles modern CSS color formats (oklab, oklch) that Chromium may emit. */
async function assertNoAccentTextShadows(page: Page) {
  const violations = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const ts = getComputedStyle(el).textShadow;
      if (ts === "none") continue;
      // Remove black/near-black shadows in every format the browser may emit.
      // rgba(0,0,0,…) / rgb(0,0,0) — the only format --text-shadow-sm/md ever produce
      let cleaned = ts.replace(/rgba?\(0,\s*0,\s*0[^)]*\)/g, "");
      // oklab(L …) — Chromium serialises color-mix() results in oklab; L < 0.05 ≈ black
      cleaned = cleaned.replace(
        /oklab\(\s*([\d.]+(?:e[+-]?\d+)?)[^)]*\)/g,
        (m, L) => (parseFloat(L) < 0.05 ? "" : m),
      );
      // oklch(L …) — same rule, L is the lightness channel
      cleaned = cleaned.replace(
        /oklch\(\s*([\d.]+(?:e[+-]?\d+)?)[^)]*\)/g,
        (m, L) => (parseFloat(L) < 0.05 ? "" : m),
      );
      // Flag if any colour function remains after stripping all black entries
      if (/(?:rgba?|hsla?|oklch|oklab|lch|lab|color|hwb)\(/.test(cleaned)) {
        const tag = el.tagName.toLowerCase();
        const cls =
          typeof el.className === "string" && el.className.trim()
            ? "." + el.className.trim().replace(/\s+/g, ".")
            : "";
        offenders.push(`${tag}${cls}: ${ts}`);
      }
    }
    return offenders;
  });
  expect(
    violations,
    `Non-black text-shadows found with all effects off:\n${violations.join("\n")}`,
  ).toEqual([]);
}

test.describe("Effects disabled — no accent glows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    await page.evaluate((keys) => {
      for (const k of keys) localStorage.removeItem(k);
    }, EFFECT_LS_KEYS);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
  });

  for (const targetPath of ["/llama-cpp", "/overview", "/cpu"]) {
    test(`no accent glow renders on ${targetPath}`, async ({ page }) => {
      await page.goto(`${BASE_URL}${targetPath}`);
      await waitForAppReady(page);

      // 1. No effect attributes on <html> — also catches state-desync bugs
      const attrMap = await page.evaluate((attrs) => {
        return Object.fromEntries(
          attrs.map((a) => [a, document.documentElement.getAttribute(a)]),
        );
      }, GLOW_ATTRS);
      for (const [attr, value] of Object.entries(attrMap)) {
        expect(
          value,
          `<html> must not have ${attr} with all effects off`,
        ).toBeNull();
      }

      // 2. Glow CSS tokens resolve to the transparent placeholder
      for (const varName of ["--card-glow", "--card-halo"]) {
        const val = await getCssVariable(page, varName);
        expect(
          val,
          `${varName} should be transparent when effects are off`,
        ).toContain(TRANSPARENT_SHADOW);
      }

      // --accent-inner-glow no longer exists: Inner Glow now sets background-image
      // directly on card elements (not a CSS variable). The equivalent guard: with
      // all effects off, .ov-card's computed backgroundImage must be "none" — Inner
      // Glow is not painting a gradient wash. Previously this was tested by asserting
      // the --accent-inner-glow variable resolved to the transparent placeholder.
      if (targetPath === "/overview") {
        const ovCards = page.locator(".ov-card");
        const cardCount = await ovCards.count();
        for (let ci = 0; ci < cardCount; ci++) {
          const bg = await ovCards
            .nth(ci)
            .evaluate((el) => getComputedStyle(el).backgroundImage);
          expect(
            bg,
            ".ov-card backgroundImage must be none with all effects off",
          ).toBe("none");
        }
      }

      // 3. No accent-coloured text-shadow on any element
      await assertNoAccentTextShadows(page);

      // 4. Quant span (.accent-text-glow) — conditional on a loaded model
      if (targetPath === "/llama-cpp") {
        const glowSpans = page.locator(".accent-text-glow");
        const count = await glowSpans.count();
        if (count > 0) {
          for (const span of await glowSpans.all()) {
            const ts = await span.evaluate(
              (el) => getComputedStyle(el).textShadow,
            );
            expect(
              ts,
              ".accent-text-glow must have no text-shadow with Neon Glow off",
            ).toBe("none");
          }
        }
      }
    });
  }

  // 5. Positive control — model-independent; proves the toggle has real effect
  test("positive control: enabling Neon Glow restores --card-glow", async ({
    page,
  }) => {
    // beforeEach leaves us on /theme with all effects cleared
    const glowRow = page.locator(".mode-row", { hasText: "Neon Glow" }).first();
    await glowRow.click();
    await page.waitForTimeout(200);

    const cardGlowOn = await getCssVariable(page, "--card-glow");
    expect(
      cardGlowOn,
      "--card-glow must be a real shadow value when Neon Glow is on",
    ).not.toContain(TRANSPARENT_SHADOW);

    // If the quant span is present, it should glow
    await page.goto(`${BASE_URL}/llama-cpp`);
    await waitForAppReady(page);
    const glowSpans = page.locator(".accent-text-glow");
    if ((await glowSpans.count()) > 0) {
      const ts = await glowSpans
        .first()
        .evaluate((el) => getComputedStyle(el).textShadow);
      expect(
        ts,
        ".accent-text-glow should have a text-shadow with Neon Glow on",
      ).not.toBe("none");
    }
  });

  // Mocked proof: forces the quant span to render so assertions 3 & 4 catch the original bug.
  // On the pre-fix tree (inline textShadow on the span), this test FAILS.
  // On the fixed tree (span uses .accent-text-glow CSS class gated by [data-glow="neon"]),
  // this test PASSES.
  test.describe("quant span proof (mocked model)", () => {
    test.beforeEach(async ({ page }) => {
      // outer beforeEach already cleared LS; set up mock then navigate
      await page.route("**/api/ai/metrics", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_AI_METRICS),
        });
      });
      await page.goto(`${BASE_URL}/llama-cpp`);
      await waitForAppReady(page);
    });

    test("text-shadow sweep catches accent glow on quant span", async ({
      page,
    }) => {
      // Wait for the quant text to appear — works on both broken and fixed tree
      // (broken: span.accent-text with inline style; fixed: span.accent-text.accent-text-glow)
      await expect(page.getByText("Q4_K_XL").first()).toBeVisible({
        timeout: 8000,
      });

      // Assertion 3: sweep must find no non-black text-shadows (handles oklab/oklch)
      // Pre-fix: inline textShadow on .accent-text computes to oklab(…) → non-black → FAILS
      // Post-fix: .accent-text-glow CSS rule is gated; no inline style remains → PASSES
      await assertNoAccentTextShadows(page);

      // Direct targeted check: the quant text itself must have textShadow === "none"
      // Pre-fix: inline style → "oklab(…) 0px 0px 18px" (not "none") → FAILS
      // Post-fix: CSS gated, no inline style → "none" → PASSES
      const quantText = page.getByText("Q4_K_XL").first();
      const ts = await quantText.evaluate(
        (el) => getComputedStyle(el).textShadow,
      );
      expect(
        ts,
        "quant text must have no text-shadow with all effects off",
      ).toBe("none");
    });
  });
});
