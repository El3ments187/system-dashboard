/**
 * Breathe (unison brightness) and Surge (traveling pulse) effects — TDD.
 * Tests written RED-first. All pass after implementation.
 *
 * Test coverage per spec:
 *  3. Breathe = unison: fx-breathe with delay 0s on all; off → no animation.
 *  4. Surge = staggered: elements with different --el-index have different delays ≤ 0.
 *  5. Both at once: concurrent on same host, separate layers.
 *  6. Content untouched: text elements have no running animation.
 *  7. Stacks with Pulse + glows: ::before still runs accent-pulse alongside bright layers.
 *  8. Intensity scales: background alpha differs between low and high intensity.
 *  9. Reduced motion: no running animation on either layer.
 * 10. Everywhere: tests 3-5 run on ≥2 pages + Theme preview.
 *  +  Controls: Breathe/Surge toggles, sliders, persistence, no old Brightness Pulse/Ember.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForAccentEls(page: Page) {
  await page.waitForSelector("[data-accent-el]", { timeout: 10000 });
}

async function enableBreathe(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-breathe", "on"),
  );
  await page.waitForTimeout(100);
}

async function enableSurge(page: Page) {
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-surge", "on"),
  );
  await page.waitForTimeout(100);
}

// ── Test 3 + 10: Breathe = unison, ≥2 pages ──────────────────────────────────

const BREATHE_PAGES = [
  { name: "Overview", path: "/" },
  { name: "Theme", path: "/theme" },
  { name: "CPU", path: "/cpu" },
];

for (const { name, path } of BREATHE_PAGES) {
  test.describe(`Breathe unison: ${name}`, () => {
    test(`${name}: .bright-breathe layers exist in DOM`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAccentEls(page);
      const count = await page.evaluate(
        () => document.querySelectorAll(".bright-breathe").length,
      );
      expect(count, `${name}: no .bright-breathe elements found`).toBeGreaterThan(0);
    });

    test(`${name}: bright-breathe runs fx-breathe with delay 0s on all layers when data-breathe=on`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAccentEls(page);
      await enableBreathe(page);

      const result = await page.evaluate(() => {
        // Exclude accent-fill bars — charts are intentionally excluded from breathe
        const layers = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".accent-glow-target:not(.accent-fill) .bright-breathe",
          ),
        );
        return layers.map((el) => {
          const cs = window.getComputedStyle(el);
          return {
            animationName: cs.animationName,
            animationPlayState: cs.animationPlayState,
            animationDelay: cs.animationDelay,
          };
        });
      });

      expect(result.length, `${name}: no .bright-breathe elements`).toBeGreaterThan(0);
      for (const r of result) {
        expect(r.animationName, `${name}: animation should be fx-breathe`).toBe("fx-breathe");
        expect(r.animationPlayState, `${name}: animation should be running`).toBe("running");
        // Unison: every element must have the same delay (0s — no per-element stagger)
        expect(r.animationDelay, `${name}: breathe delay must be 0s (unison)`).toBe("0s");
      }
    });

    test(`${name}: bright-breathe has no animation when data-breathe is absent`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAccentEls(page);
      // Do NOT enable breathe

      const result = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".bright-breathe")).map(
          (el) => window.getComputedStyle(el).animationName,
        ),
      );

      expect(result.length, `${name}: no .bright-breathe found`).toBeGreaterThan(0);
      for (const anim of result) {
        expect(anim, `${name}: bright-breathe must not animate when off`).toBe("none");
      }
    });
  });
}

// ── Test 4 + 10: Surge = staggered, ≥2 pages ─────────────────────────────────

const SURGE_PAGES = [
  { name: "Overview", path: "/" },
  { name: "Theme", path: "/theme" },
];

for (const { name, path } of SURGE_PAGES) {
  test.describe(`Surge stagger: ${name}`, () => {
    test(`${name}: .bright-surge layers exist in DOM`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAccentEls(page);
      const count = await page.evaluate(
        () => document.querySelectorAll(".bright-surge").length,
      );
      expect(count, `${name}: no .bright-surge elements found`).toBeGreaterThan(0);
    });

    test(`${name}: bright-surge runs fx-surge with staggered delays ≤ 0 when data-surge=on`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAccentEls(page);
      await enableSurge(page);

      const result = await page.evaluate(() => {
        const hosts = Array.from(
          document.querySelectorAll<HTMLElement>("[style*='--el-index']"),
        );
        return hosts
          .map((host) => {
            const elIndex = parseInt(
              host.style.getPropertyValue("--el-index"),
              10,
            );
            const surgeLayer = host.querySelector<HTMLElement>(".bright-surge");
            if (!surgeLayer) return null;
            const cs = window.getComputedStyle(surgeLayer);
            return {
              elIndex,
              animationName: cs.animationName,
              animationDelay: cs.animationDelay,
            };
          })
          .filter(Boolean);
      });

      expect(
        result.length,
        `${name}: need at least 2 indexed elements with .bright-surge`,
      ).toBeGreaterThanOrEqual(2);

      for (const r of result) {
        expect(r!.animationName, `${name}: animation should be fx-surge`).toBe("fx-surge");
      }

      // Elements with different --el-index must have different delays
      const sorted = result
        .filter((r) => r !== null)
        .sort((a, b) => a!.elIndex - b!.elIndex);
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;

      expect(first.elIndex, `${name}: need at least 2 distinct --el-index values`).not.toBe(last.elIndex);
      expect(
        first.animationDelay,
        `${name}: elements with different --el-index must have different delays`,
      ).not.toBe(last.animationDelay);

      // All delays must be ≤ 0 (spec: index * travel - period, always negative)
      for (const r of result) {
        const seconds = parseFloat(r!.animationDelay);
        expect(
          seconds,
          `${name}: surge delay ${r!.animationDelay} must be ≤ 0`,
        ).toBeLessThanOrEqual(0.001); // tiny tolerance for float rounding
      }
    });
  });
}

// ── Test 5 + 10: Both at once on ≥2 pages ────────────────────────────────────

for (const { name, path } of SURGE_PAGES) {
  test(`${name}: bright-breathe + bright-surge run concurrently on the same host element`, async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}${path}`);
    await waitForAccentEls(page);
    await enableBreathe(page);
    await enableSurge(page);

    const result = await page.evaluate(() => {
      const hosts = Array.from(
        document.querySelectorAll<HTMLElement>(".accent-glow-target"),
      );
      for (const host of hosts) {
        const breathe = host.querySelector<HTMLElement>(".bright-breathe");
        const surge = host.querySelector<HTMLElement>(".bright-surge");
        if (breathe && surge) {
          return {
            breatheAnim: window.getComputedStyle(breathe).animationName,
            breatheState: window.getComputedStyle(breathe).animationPlayState,
            surgeAnim: window.getComputedStyle(surge).animationName,
            surgeState: window.getComputedStyle(surge).animationPlayState,
          };
        }
      }
      return null;
    });

    expect(
      result,
      `${name}: no element found with both .bright-breathe and .bright-surge children`,
    ).not.toBeNull();
    expect(result!.breatheAnim, `${name}: bright-breathe must run fx-breathe`).toBe("fx-breathe");
    expect(result!.breatheState, `${name}: bright-breathe must be running`).toBe("running");
    expect(result!.surgeAnim, `${name}: bright-surge must run fx-surge`).toBe("fx-surge");
    expect(result!.surgeState, `${name}: bright-surge must be running`).toBe("running");
  });
}

// ── Test 6: Content untouched ─────────────────────────────────────────────────

test("Content text has no running animation while breathe + surge are both on", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/theme`);
  await waitForAccentEls(page);
  await enableBreathe(page);
  await enableSurge(page);

  const animatedText = await page.evaluate(() => {
    const textEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".card-title, .card-value, .card-unit, .card-detail-value, .mode-name, .theme-page-title, h1, h2, h3",
      ),
    );
    return textEls
      .filter((el) => {
        const cs = window.getComputedStyle(el);
        return (
          cs.animationName !== "none" && cs.animationPlayState === "running"
        );
      })
      .map((el) => ({
        cls: el.className,
        anim: window.getComputedStyle(el).animationName,
      }));
  });

  expect(
    animatedText,
    `Text/content elements must not have running animations:\n${JSON.stringify(animatedText)}`,
  ).toHaveLength(0);
});

// ── Test 7: Stacks with Pulse + Neon Glow ────────────────────────────────────

test("Breathe + Surge stack with Pulse: ::before still runs accent-pulse", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/theme`);
  await waitForAccentEls(page);

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-glow", "neon");
    document.documentElement.setAttribute("data-pulse", "on");
  });
  await enableBreathe(page);
  await enableSurge(page);
  await page.waitForTimeout(100);

  const result = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(".accent-glow-target");
    if (!target) return null;
    const breathe = target.querySelector<HTMLElement>(".bright-breathe");
    const surge = target.querySelector<HTMLElement>(".bright-surge");
    return {
      beforeAnim: window.getComputedStyle(target, "::before").animationName,
      breatheAnim: breathe ? window.getComputedStyle(breathe).animationName : null,
      surgeAnim: surge ? window.getComputedStyle(surge).animationName : null,
    };
  });

  expect(result, "No .accent-glow-target found on theme page").not.toBeNull();
  expect(result!.breatheAnim, "bright-breathe must run fx-breathe").toBe("fx-breathe");
  expect(result!.surgeAnim, "bright-surge must run fx-surge").toBe("fx-surge");
  // Pulse ::before must still animate independently
  expect(result!.beforeAnim, "Pulse ::before must still run accent-pulse").toBe("accent-pulse");
});

// ── Test 8: Intensity scales ──────────────────────────────────────────────────

test("Breathe: --breathe-intensity 0.5 vs 3 produces different background-color", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/theme`);
  await waitForAccentEls(page);
  await enableBreathe(page);

  const low = await page.evaluate(() => {
    document.documentElement.style.setProperty("--breathe-intensity", "0.5");
    const el = document.querySelector<HTMLElement>(".bright-breathe");
    return el ? window.getComputedStyle(el).backgroundColor : null;
  });

  const high = await page.evaluate(() => {
    document.documentElement.style.setProperty("--breathe-intensity", "3");
    const el = document.querySelector<HTMLElement>(".bright-breathe");
    return el ? window.getComputedStyle(el).backgroundColor : null;
  });

  expect(low, "bright-breathe must have a background color").not.toBeNull();
  expect(high, "bright-breathe must have a background color").not.toBeNull();
  expect(
    low,
    "Low vs high --breathe-intensity must produce different background alpha",
  ).not.toBe(high);
});

test("Surge: --surge-intensity 0.5 vs 3 produces different background-color", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/theme`);
  await waitForAccentEls(page);
  await enableSurge(page);

  const low = await page.evaluate(() => {
    document.documentElement.style.setProperty("--surge-intensity", "0.5");
    const el = document.querySelector<HTMLElement>(".bright-surge");
    return el ? window.getComputedStyle(el).backgroundColor : null;
  });

  const high = await page.evaluate(() => {
    document.documentElement.style.setProperty("--surge-intensity", "3");
    const el = document.querySelector<HTMLElement>(".bright-surge");
    return el ? window.getComputedStyle(el).backgroundColor : null;
  });

  expect(low).not.toBeNull();
  expect(high).not.toBeNull();
  expect(low, "Low vs high --surge-intensity must produce different background alpha").not.toBe(high);
});

// ── Test 9: Reduced motion ────────────────────────────────────────────────────

test("Reduced motion: bright-breathe and bright-surge have no running animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE_URL}/`);
  await waitForAccentEls(page);
  await enableBreathe(page);
  await enableSurge(page);

  const { breatheRunning, surgeRunning } = await page.evaluate(() => {
    const bLayers = Array.from(
      document.querySelectorAll<HTMLElement>(".bright-breathe"),
    );
    const sLayers = Array.from(
      document.querySelectorAll<HTMLElement>(".bright-surge"),
    );
    return {
      breatheRunning: bLayers.some((el) => {
        const cs = window.getComputedStyle(el);
        return cs.animationName !== "none" && cs.animationPlayState === "running";
      }),
      surgeRunning: sLayers.some((el) => {
        const cs = window.getComputedStyle(el);
        return cs.animationName !== "none" && cs.animationPlayState === "running";
      }),
    };
  });

  expect(
    breatheRunning,
    "bright-breathe must not animate under prefers-reduced-motion: reduce",
  ).toBe(false);
  expect(
    surgeRunning,
    "bright-surge must not animate under prefers-reduced-motion: reduce",
  ).toBe(false);
});

// ── Theme page controls ───────────────────────────────────────────────────────

test.describe("ThemePage controls: Breathe + Surge", () => {
  async function goToTheme(page: Page) {
    await page.goto(`${BASE_URL}/theme`);
    await page.waitForSelector(".theme-page", { timeout: 8000 });
  }

  test("No 'Brightness Pulse' or 'Ember' toggle exists in EFFECTS", async ({
    page,
  }) => {
    await goToTheme(page);
    const bpulse = await page
      .locator(".mode-row", { hasText: /brightness pulse/i })
      .count();
    const ember = await page
      .locator(".mode-row", { hasText: /\bember\b/i })
      .count();
    expect(bpulse, "Brightness Pulse toggle must not exist").toBe(0);
    expect(ember, "Ember toggle must not exist").toBe(0);
  });

  test("Breathe toggle appears in EFFECTS section", async ({ page }) => {
    await goToTheme(page);
    await expect(
      page.locator(".mode-row", { hasText: /^Breathe/i }).first(),
    ).toBeVisible();
  });

  test("Surge toggle appears in EFFECTS section", async ({ page }) => {
    await goToTheme(page);
    await expect(
      page.locator(".mode-row", { hasText: /^Surge/i }).first(),
    ).toBeVisible();
  });

  test("Breathe toggle sets data-breathe=on, persists to localStorage, restores on reload", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => localStorage.removeItem("dashboard-breathe"));
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });

    await page.locator(".mode-row", { hasText: /^Breathe/i }).first().click();
    await page.waitForTimeout(200);

    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-breathe"),
      ),
    ).toBe("on");
    expect(
      await page.evaluate(() => localStorage.getItem("dashboard-breathe")),
    ).toBe("on");

    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-breathe"),
      ),
    ).toBe("on");
  });

  test("Surge toggle sets data-surge=on, persists to localStorage, restores on reload", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => localStorage.removeItem("dashboard-surge"));
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });

    await page.locator(".mode-row", { hasText: /^Surge/i }).first().click();
    await page.waitForTimeout(200);

    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-surge"),
      ),
    ).toBe("on");
    expect(
      await page.evaluate(() => localStorage.getItem("dashboard-surge")),
    ).toBe("on");

    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-surge"),
      ),
    ).toBe("on");
  });

  test("Breathe Speed slider visible when breathe=on, hidden when off", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => localStorage.removeItem("dashboard-breathe"));
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });

    if (
      (await page.evaluate(() =>
        document.documentElement.getAttribute("data-breathe"),
      )) === "on"
    ) {
      await page.locator(".mode-row", { hasText: /^Breathe/i }).first().click();
      await page.waitForTimeout(200);
    }

    const speedGroup = page
      .locator(".effect-row-group")
      .filter({ hasText: /Breathe Speed/i });
    await expect(speedGroup).not.toBeVisible();

    await page.locator(".mode-row", { hasText: /^Breathe/i }).first().click();
    await page.waitForTimeout(200);
    await expect(speedGroup).toBeVisible();
  });

  test("Surge Period slider visible when surge=on, hidden when off", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => localStorage.removeItem("dashboard-surge"));
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });

    if (
      (await page.evaluate(() =>
        document.documentElement.getAttribute("data-surge"),
      )) === "on"
    ) {
      await page.locator(".mode-row", { hasText: /^Surge/i }).first().click();
      await page.waitForTimeout(200);
    }

    const periodGroup = page
      .locator(".effect-row-group")
      .filter({ hasText: /Surge Period/i });
    await expect(periodGroup).not.toBeVisible();

    await page.locator(".mode-row", { hasText: /^Surge/i }).first().click();
    await page.waitForTimeout(200);
    await expect(periodGroup).toBeVisible();
  });

  test("Old bpulse/ember localStorage keys do not set stale attributes on mount", async ({
    page,
  }) => {
    await goToTheme(page);
    await page.evaluate(() => {
      localStorage.setItem("dashboard-bpulse", "on");
      localStorage.setItem("dashboard-ember", "on");
      localStorage.setItem("dashboard-bpulse-speed", "3");
    });
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 8000 });

    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-bpulse"),
      ),
    ).toBeNull();
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-ember"),
      ),
    ).toBeNull();
    // Page must still render correctly
    expect(
      await page.locator(".theme-page-title").textContent(),
    ).toBeTruthy();
  });
});
