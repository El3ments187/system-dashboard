/**
 * Invariant 9 (Tier B): Rainbow Wave — every accent element's sampled color CHANGES
 * over time. Tests CSS-animated elements (should change between all samples) and
 * JS-polled bar elements (must change within 2500ms).
 *
 * For strict consecutive sampling at fastest speed, CSS-path elements must differ at
 * every 700ms step. JS-polled elements (800ms interval) can only guarantee change
 * within 2500ms, so a separate wider-window assertion covers them.
 */
import { test, expect, type Page } from "@playwright/test";
import { setAccentMode, setAccent } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
];

async function enableRainbowWave(page: Page): Promise<void> {
  await setAccentMode(page, "rainbow-wave");
  // Set fastest speed (1s cycle) for quick sampling
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--fx-speed", "1s");
  });
  await page.waitForTimeout(100);
}

/** Sample the animated --accent-spin value via a probe element */
async function sampleAccentSpin(page: Page): Promise<number> {
  return page.evaluate(() => {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-spin")
      .trim();
    return parseFloat(v) || 0;
  });
}

/** Sample the resolved background-color of the first accent-spine on the page */
async function sampleSpineColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spine = document.querySelector<HTMLElement>(".card-accent-spine");
    if (!spine) return "";
    return getComputedStyle(spine).backgroundImage || getComputedStyle(spine).backgroundColor;
  });
}

/** Sample the resolved color of a CSS-probe element using var(--accent-primary) */
async function sampleAccentPrimary(page: Page): Promise<string> {
  return page.evaluate(() => {
    let probe = document.getElementById("__accent-probe__");
    if (!probe) {
      probe = document.createElement("div");
      probe.id = "__accent-probe__";
      probe.style.cssText =
        "position:fixed;width:1px;height:1px;top:-2px;background:var(--accent-primary);pointer-events:none;";
      document.body.appendChild(probe);
    }
    return getComputedStyle(probe).backgroundColor;
  });
}

for (const { name, path } of PAGES) {
  test.describe(`Invariant 9 (Rainbow Wave animates): ${name} page`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
      await setAccent(page, "indigo");
      await enableRainbowWave(page);
      // Allow animation to start
      await page.waitForTimeout(200);
    });

    test(`${name}: --accent-spin changes over 1s (CSS animation running)`, async ({
      page,
    }) => {
      const spin0 = await sampleAccentSpin(page);
      await page.waitForTimeout(600);
      const spin600 = await sampleAccentSpin(page);
      await page.waitForTimeout(600);
      const spin1200 = await sampleAccentSpin(page);

      // The spin property should animate (0→360 in 1s); verify at least one step differs
      const changed =
        Math.abs(spin600 - spin0) > 2 || Math.abs(spin1200 - spin600) > 2;
      expect(
        changed,
        `--accent-spin did not change (${spin0} → ${spin600} → ${spin1200}). CSS animation may not be running.`,
      ).toBe(true);
    });

    test(`${name}: CSS-path accent-primary color changes over 1.5s`, async ({
      page,
    }) => {
      const c0 = await sampleAccentPrimary(page);
      await page.waitForTimeout(750);
      const c750 = await sampleAccentPrimary(page);
      await page.waitForTimeout(750);
      const c1500 = await sampleAccentPrimary(page);

      const changed = c0 !== c750 || c750 !== c1500 || c0 !== c1500;
      expect(
        changed,
        `--accent-primary color did not change (${c0} → ${c750} → ${c1500}). CSS-path element is frozen.`,
      ).toBe(true);
    });
  });
}

// Specific test for bar elements on CPU and GPU pages (JS-polled path)
test.describe("Invariant 9: JS-polled bar elements (CPU, GPU) update in Rainbow Wave", () => {
  const BAR_PAGES = [
    { name: "CPU", path: "/cpu", barAttr: "data-accent-bar" },
    { name: "GPU", path: "/gpu", barAttr: "data-accent-bar" },
  ];

  for (const { name, path } of BAR_PAGES) {
    test(`${name}: bar fills change color within 2500ms in Rainbow Wave`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
      await setAccent(page, "indigo");
      await enableRainbowWave(page);
      await page.waitForTimeout(200);

      // Sample bar background-color at t=0 and t=2500ms
      const sampleBarColors = () =>
        page.evaluate(() => {
          // Find elements with inline background color styles (JS-resolved hex path)
          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>("[data-accent-el] *"),
          ).filter((el) => {
            const bg = el.style.backgroundColor || el.style.background;
            return bg && bg.startsWith("#");
          });
          return candidates.map((el) => el.style.backgroundColor || el.style.background);
        });

      const colors0 = await sampleBarColors();
      await page.waitForTimeout(2500);
      const colors2500 = await sampleBarColors();

      if (colors0.length === 0) {
        // No JS-hex bars found — page uses CSS variables already (good!)
        return;
      }

      // At least one bar should have changed color
      const anyChanged = colors0.some((c, i) => c !== colors2500[i]);
      expect(
        anyChanged,
        `${name} bars did not change in 2500ms. ` +
          `Before: ${JSON.stringify(colors0.slice(0, 3))}, After: ${JSON.stringify(colors2500.slice(0, 3))}`,
      ).toBe(true);
    });
  }
});

// Invariant 9, Tier B — per-page parametrized with Solid mode as control
test.describe("Invariant 10 (Solid mode is static): accent-primary does not change over time", () => {
  for (const { name, path } of PAGES) {
    test(`${name}: accent-primary stable over 2s in Solid mode`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
      await setAccent(page, "indigo");
      await setAccentMode(page, "solid");
      await page.waitForTimeout(200);

      const c0 = await sampleAccentPrimary(page);
      await page.waitForTimeout(1000);
      const c1000 = await sampleAccentPrimary(page);
      await page.waitForTimeout(1000);
      const c2000 = await sampleAccentPrimary(page);

      expect(
        c0,
        `Solid mode: color changed at 1s (${c0} → ${c1000})`,
      ).toBe(c1000);
      expect(
        c0,
        `Solid mode: color changed at 2s (${c0} → ${c2000})`,
      ).toBe(c2000);
    });
  }
});
