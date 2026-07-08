/**
 * Bright layer coverage — every .accent-glow-target on every page must have
 * both a .bright-breathe and a .bright-surge child span so that the Breathe
 * and Surge effects work everywhere, not just on a subset of components.
 *
 * Pages covered: Overview, GPU, CPU, LlamaCpp, Settings, Theme.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "Settings", path: "/settings" },
  { name: "Theme", path: "/theme" },
];

async function waitForPage(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  // Allow MetricChart + animations to mount
  await page.waitForTimeout(300);
}

async function enableBreathe(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-breathe", "on"),
  );
  await page.waitForTimeout(80);
}

async function enableSurge(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-surge", "on"),
  );
  await page.waitForTimeout(80);
}

// ── Structural: every .accent-glow-target must have bright children ───────────

for (const { name, path } of PAGES) {
  test.describe(`Bright layer coverage: ${name}`, () => {
    test(`${name}: every .accent-glow-target has a .bright-breathe child`, async ({
      page,
    }) => {
      await waitForPage(page, path);

      const result = await page.evaluate(() => {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(".accent-glow-target"),
        );
        const missing = targets.filter(
          (el) => !el.querySelector(".bright-breathe"),
        );
        return {
          total: targets.length,
          missingCount: missing.length,
          missingClasses: missing.map((el) => el.className).slice(0, 5),
        };
      });

      expect(
        result.total,
        `${name}: no .accent-glow-target found on page`,
      ).toBeGreaterThan(0);
      expect(
        result.missingCount,
        `${name}: ${result.missingCount} .accent-glow-target elements missing .bright-breathe child:\n  ${result.missingClasses.join("\n  ")}`,
      ).toBe(0);
    });

    test(`${name}: every .accent-glow-target has a .bright-surge child`, async ({
      page,
    }) => {
      await waitForPage(page, path);

      const result = await page.evaluate(() => {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(".accent-glow-target"),
        );
        const missing = targets.filter(
          (el) => !el.querySelector(".bright-surge"),
        );
        return {
          total: targets.length,
          missingCount: missing.length,
          missingClasses: missing.map((el) => el.className).slice(0, 5),
        };
      });

      expect(
        result.total,
        `${name}: no .accent-glow-target found on page`,
      ).toBeGreaterThan(0);
      expect(
        result.missingCount,
        `${name}: ${result.missingCount} .accent-glow-target elements missing .bright-surge child:\n  ${result.missingClasses.join("\n  ")}`,
      ).toBe(0);
    });

    // ── Animation: when enabled, ALL .bright-breathe / .bright-surge animate ──

    test(`${name}: data-breathe=on animates ALL .bright-breathe layers`, async ({
      page,
    }) => {
      await waitForPage(page, path);
      await enableBreathe(page);

      const result = await page.evaluate(() => {
        const layers = Array.from(
          document.querySelectorAll<HTMLElement>(".bright-breathe"),
        );
        const notRunning = layers.filter((el) => {
          const cs = window.getComputedStyle(el);
          return (
            cs.animationName !== "fx-breathe" ||
            cs.animationPlayState !== "running"
          );
        });
        return {
          total: layers.length,
          notRunningCount: notRunning.length,
          notRunningClasses: notRunning
            .map((el) => {
              const cs = window.getComputedStyle(el);
              return `${el.parentElement?.className} → anim:${cs.animationName} state:${cs.animationPlayState}`;
            })
            .slice(0, 5),
        };
      });

      expect(
        result.total,
        `${name}: no .bright-breathe found`,
      ).toBeGreaterThan(0);
      expect(
        result.notRunningCount,
        `${name}: ${result.notRunningCount} .bright-breathe layers not running fx-breathe:\n  ${result.notRunningClasses.join("\n  ")}`,
      ).toBe(0);
    });

    test(`${name}: data-surge=on animates ALL .bright-surge layers`, async ({
      page,
    }) => {
      await waitForPage(page, path);
      await enableSurge(page);

      const result = await page.evaluate(() => {
        const layers = Array.from(
          document.querySelectorAll<HTMLElement>(".bright-surge"),
        );
        const notRunning = layers.filter((el) => {
          const cs = window.getComputedStyle(el);
          return (
            cs.animationName !== "fx-surge" ||
            cs.animationPlayState !== "running"
          );
        });
        return {
          total: layers.length,
          notRunningCount: notRunning.length,
          notRunningClasses: notRunning
            .map((el) => {
              const cs = window.getComputedStyle(el);
              return `${el.parentElement?.className} → anim:${cs.animationName} state:${cs.animationPlayState}`;
            })
            .slice(0, 5),
        };
      });

      expect(
        result.total,
        `${name}: no .bright-surge found`,
      ).toBeGreaterThan(0);
      expect(
        result.notRunningCount,
        `${name}: ${result.notRunningCount} .bright-surge layers not running fx-surge:\n  ${result.notRunningClasses.join("\n  ")}`,
      ).toBe(0);
    });
  });
}

// ── Cross-page count sanity: bright layer count == accent-glow-target count ───

for (const { name, path } of PAGES) {
  test(`${name}: .bright-breathe count equals .accent-glow-target count`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const { targetCount, breatheCount } = await page.evaluate(() => ({
      targetCount: document.querySelectorAll(".accent-glow-target").length,
      breatheCount: document.querySelectorAll(
        ".accent-glow-target .bright-breathe",
      ).length,
    }));

    expect(targetCount, `${name}: no .accent-glow-target found`).toBeGreaterThan(0);
    expect(
      breatheCount,
      `${name}: breathe count (${breatheCount}) must equal glow-target count (${targetCount})`,
    ).toBe(targetCount);
  });

  test(`${name}: .bright-surge count equals .accent-glow-target count`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const { targetCount, surgeCount } = await page.evaluate(() => ({
      targetCount: document.querySelectorAll(".accent-glow-target").length,
      surgeCount: document.querySelectorAll(
        ".accent-glow-target .bright-surge",
      ).length,
    }));

    expect(targetCount, `${name}: no .accent-glow-target found`).toBeGreaterThan(0);
    expect(
      surgeCount,
      `${name}: surge count (${surgeCount}) must equal glow-target count (${targetCount})`,
    ).toBe(targetCount);
  });
}
