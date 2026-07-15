import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

const PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "Settings", path: "/settings" },
];

async function waitForPage(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  await page.waitForTimeout(400);
}

// ── Test 1: every top-level card root contains a glow target ──────────────
// Should PASS today (Phase 0 fixed spine=true). Guards against regression.

for (const { name, path } of PAGES) {
  test(`${name}: every top-level [data-accent-el] contains .accent-glow-target`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const offenders = await page.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll<HTMLElement>("[data-accent-el]"),
      );
      // Restrict to actual card containers: role="article" (Card/CardShell)
      // or a class containing "card" (SettingsCard = .settings-card, etc.).
      // Excludes nav buttons, chips, and other small per-element accent elements
      // that carry data-accent-el for hue assignment but have no spine slot.
      const cards = all.filter(
        (el) =>
          !el.parentElement?.closest("[data-accent-el]") &&
          (el.getAttribute("role") === "article" ||
            Array.from(el.classList).some((c) => c.includes("card"))),
      );
      return cards
        .filter((el) => !el.querySelector(".accent-glow-target"))
        .map((el) => el.className || el.tagName);
    });

    expect(
      offenders,
      `${name}: top-level [data-accent-el] missing .accent-glow-target:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
}

// ── Test 2a: normal ProgressBars must be glow targets ────────────────────
// FAILS today — no bar carries accent-glow-target. Passes after Phase 1.

for (const { name, path } of PAGES) {
  test(`${name}: .card-progress-bar[data-state="normal"] has accent-glow-target`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const result = await page.evaluate(() => {
      const normalBars = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.card-progress-bar[data-state="normal"]',
        ),
      );
      const missing = normalBars.filter(
        (el) => !el.classList.contains("accent-glow-target"),
      );
      return {
        total: normalBars.length,
        missingCount: missing.length,
        missingClasses: missing.map((el) => el.className).slice(0, 5),
      };
    });

    if (result.total === 0) return; // no normal bars on this page — skip

    expect(
      result.missingCount,
      `${name}: ${result.missingCount}/${result.total} normal bars missing accent-glow-target:\n  ${result.missingClasses.join("\n  ")}`,
    ).toBe(0);
  });
}

// ── Test 2b: warning/critical bars must NOT be glow targets ──────────────
// Passes today (no bars are tagged). Must still pass after Phase 1.

for (const { name, path } of PAGES) {
  test(`${name}: warning/critical bars do NOT have accent-glow-target`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const violations = await page.evaluate(() => {
      const semanticBars = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.card-progress-bar[data-state="warning"], .card-progress-bar[data-state="critical"]',
        ),
      );
      return semanticBars
        .filter((el) => el.classList.contains("accent-glow-target"))
        .map((el) => el.className);
    });

    expect(
      violations,
      `${name}: semantic bars wrongly tagged as glow targets:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });
}

// ── Test 3: hand-rolled accent bars on specific pages ─────────────────────
// FAILS today — none are tagged. Passes after Phase 1.

test("CPU: hand-rolled accent bars are glow targets", async ({ page }) => {
  await waitForPage(page, "/cpu");

  const count = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".accent-fill.accent-glow-target"),
    ).filter(
      (el) =>
        !el.classList.contains("card-accent-spine") &&
        !el.classList.contains("card-progress-bar"),
    ).length,
  );

  expect(
    count,
    "CPU: no hand-rolled accent bars found with accent-glow-target",
  ).toBeGreaterThan(0);
});

test("GPU: hand-rolled accent bars are glow targets", async ({ page }) => {
  await waitForPage(page, "/gpu");

  const count = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".accent-fill.accent-glow-target"),
    ).filter(
      (el) =>
        !el.classList.contains("card-accent-spine") &&
        !el.classList.contains("card-progress-bar"),
    ).length,
  );

  expect(
    count,
    "GPU: no hand-rolled accent bars found with accent-glow-target",
  ).toBeGreaterThan(0);
});

// ── Test 5: Per-Core Utilization bars on /cpu ─────────────────────────────
// FAILS today (before CoreBars change) — core bars carry className "core-bar" only.
// Passes after CoreBars.tsx adds accent-glow-target + bright spans to the accent branch.

test("CPU: per-core accent bars have accent-glow-target and bright children", async ({
  page,
}) => {
  await waitForPage(page, "/cpu");

  const result = await page.evaluate(() => {
    const bars = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="per-core-bar"]'),
    );
    const accentBars = bars.filter((b) =>
      b.classList.contains("accent-glow-target"),
    );
    const missingBright = accentBars.filter(
      (b) =>
        !b.querySelector(".bright-breathe") || !b.querySelector(".bright-surge"),
    );
    return {
      total: bars.length,
      accentCount: accentBars.length,
      missingBrightCount: missingBright.length,
      missingBrightClasses: missingBright.map((b) => b.className).slice(0, 5),
    };
  });

  expect(result.total, "CPU: no per-core bars found").toBeGreaterThan(0);
  expect(
    result.accentCount,
    "CPU: no per-core bars carry accent-glow-target (expected at least some normal-state cores)",
  ).toBeGreaterThan(0);
  expect(
    result.missingBrightCount,
    `CPU: ${result.missingBrightCount} accent per-core bars missing bright children:\n  ${result.missingBrightClasses.join("\n  ")}`,
  ).toBe(0);
});

test("CPU: non-accent per-core bars have no bright children", async ({
  page,
}) => {
  await waitForPage(page, "/cpu");

  const violations = await page.evaluate(() => {
    const bars = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="per-core-bar"]'),
    );
    return bars
      .filter((b) => !b.classList.contains("accent-glow-target"))
      .filter(
        (b) =>
          b.querySelector(".bright-breathe") || b.querySelector(".bright-surge"),
      )
      .map((b) => b.className);
  });

  expect(
    violations,
    `CPU: non-accent per-core bars wrongly have bright children:\n  ${violations.join("\n  ")}`,
  ).toEqual([]);
});

test("CPU: per-core bars glow with Neon Glow ON, no glow with Neon Glow OFF", async ({
  page,
}) => {
  await waitForPage(page, "/cpu");

  // Snapshot ::after boxShadow with no glow active (baseline)
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-glow"),
  );
  await page.waitForTimeout(100);

  const shadowOff = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(
      '[data-testid="per-core-bar"].accent-glow-target',
    );
    return bar ? window.getComputedStyle(bar, "::after").boxShadow : null;
  });

  // Enable Neon Glow and compare
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-glow", "neon"),
  );
  await page.waitForTimeout(150);

  const withGlow = await page.evaluate((offShadow) => {
    const bars = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="per-core-bar"].accent-glow-target',
      ),
    );
    const anyGlows = bars.some((bar) => {
      const shadow = window.getComputedStyle(bar, "::after").boxShadow;
      return shadow !== "none" && shadow !== "" && shadow !== offShadow;
    });
    return { found: bars.length > 0, anyGlows };
  }, shadowOff);

  expect(
    withGlow.found,
    "CPU: no accent per-core bars found to test Neon Glow",
  ).toBe(true);
  expect(
    withGlow.anyGlows,
    "CPU: per-core bar ::after boxShadow did not change when Neon Glow turned ON",
  ).toBe(true);
});

test("LlamaCpp: hand-rolled accent bars are glow targets", async ({ page }) => {
  await waitForPage(page, "/llama-cpp");

  const count = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".accent-fill.accent-glow-target"),
    ).filter(
      (el) =>
        !el.classList.contains("card-accent-spine") &&
        !el.classList.contains("card-progress-bar"),
    ).length,
  );

  expect(
    count,
    "LlamaCpp: no hand-rolled accent bars found with accent-glow-target",
  ).toBeGreaterThan(0);
});

// ── Test 4: per-page floor (post-Phase-1 minimums) ───────────────────────
// Conservative initial values; tighten after observing post-fix counts.

const PAGE_FLOORS: Record<string, number> = {
  "/": 2,
  "/gpu": 2,
  "/cpu": 4,
  "/llama-cpp": 2,
  "/settings": 1,
};

for (const { name, path } of PAGES) {
  const floor = PAGE_FLOORS[path] ?? 1;
  test(`${name}: at least ${floor} .accent-glow-target on page (floor)`, async ({
    page,
  }) => {
    await waitForPage(page, path);

    const count = await page.evaluate(
      () => document.querySelectorAll(".accent-glow-target").length,
    );

    expect(
      count,
      `${name}: expected >= ${floor} glow targets, found ${count}`,
    ).toBeGreaterThanOrEqual(floor);
  });
}
