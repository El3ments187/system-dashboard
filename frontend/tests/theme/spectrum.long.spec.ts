/**
 * @long
 *
 * Long-running Playwright tests for Spectrum Per-Element, glow, and pulse.
 * Skip these during normal CI with:
 *   npx playwright test --grep-invert "@long"
 * or run them explicitly with:
 *   npx playwright test tests/theme/spectrum.long.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { setAccentMode } from "../helpers/e2eThemeAssertions";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForAppReady(page: Page) {
  // App has an 800ms artificial delay before rendering; wait for the real UI to appear
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

async function waitForAccentIndices(page: Page) {
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      return (
        els.length > 0 &&
        Array.from(els).every(
          (el) => el.style.getPropertyValue("--el-index") !== "",
        )
      );
    },
    { timeout: 5000 },
  );
}

async function setupLlamaCpp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "llama_cpp_dir",
      "/home/gamer/Documents/AI/llama.cpp/git/llama.cpp",
    );
    localStorage.setItem(
      "llama_scan_dir",
      "/home/gamer/Documents/AI/Start_Scripts",
    );
    localStorage.setItem("llama_cpp_github_repo", "ggml-org/llama.cpp");
    localStorage.setItem("llama_cpp_tag_prefix", "b");
  });
  await page.route("**/api/llama/repo-info**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { local_build_tag: "b1000", latest_build_tag: "b9999" },
      }),
    });
  });
  await page.goto(`${BASE_URL}/llama-cpp`);
  await waitForAppReady(page);
}

// ─── @long: Full spectrum color distinctness checks ───────────────────────────

test.describe("@long Spectrum Per-Element: distinct colors across pages", () => {
  const PAGES = [
    { name: "Overview", path: "/" },
    { name: "GPU", path: "/gpu" },
    { name: "CPU", path: "/cpu" },
    { name: "Theme", path: "/theme" },
    { name: "Settings", path: "/settings" },
  ];

  for (const { name, path } of PAGES) {
    test(`@long ${name}: spectrum mode produces ≥2 unique el-index values`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await setAccentMode(page, "spectrum");
      await waitForAccentIndices(page);

      const uniqueCount = await page.evaluate(() => {
        const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
        const indices = new Set(
          Array.from(els)
            .map((el) => el.style.getPropertyValue("--el-index"))
            .filter(Boolean),
        );
        return indices.size;
      });

      expect(
        uniqueCount,
        `${name} page should have at least 2 distinct spectrum colors`,
      ).toBeGreaterThanOrEqual(2);
    });
  }

  test("@long LlamaCpp: >10 tiles each get distinct --el-index after page settle", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    await setAccentMode(page, "spectrum");
    await waitForAccentIndices(page);

    const result = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      const indices = Array.from(els)
        .map((el) => el.style.getPropertyValue("--el-index"))
        .filter(Boolean);
      return { total: els.length, unique: new Set(indices).size };
    });

    expect(result.total).toBeGreaterThan(10);
    expect(result.unique).toBe(result.total);
  });
});

// ─── @long: Neon Glow + Spectrum + Match color validation ────────────────────

test.describe("@long Neon Glow + Spectrum + Match: per-element glow", () => {
  test("@long GPU page: card-accent-spine elements have full height and active pulse animation", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/gpu`);
    await waitForAppReady(page);
    await page.waitForSelector(".card-accent-spine", { timeout: 5000 });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
      document.documentElement.setAttribute("data-pulse", "on");
      document.documentElement.setAttribute("data-accent-mode", "spectrum");
      document.documentElement.removeAttribute("data-glow-color"); // match mode
    });
    await page.waitForTimeout(200);

    const spines = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(".card-accent-spine");
      return Array.from(els).map((el) => {
        const rect = el.getBoundingClientRect();
        const before = window.getComputedStyle(el, "::before");
        const parent = el.parentElement?.getBoundingClientRect();
        return {
          height: rect.height,
          parentHeight: parent?.height ?? 0,
          animationName: before.animationName,
        };
      });
    });

    expect(spines.length).toBeGreaterThan(0);
    for (const spine of spines) {
      if (spine.parentHeight > 0) {
        expect(spine.height / spine.parentHeight).toBeGreaterThan(0.9);
      }
      expect(spine.animationName).not.toBe("none");
    }
  });

  test("@long Overview: ov-spine elements have correct dimensions for pulse", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
      document.documentElement.setAttribute("data-pulse", "on");
    });
    await page.waitForTimeout(200);

    const ovSpines = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(".ov-spine");
      return Array.from(els).map((el) => {
        const rect = el.getBoundingClientRect();
        const before = window.getComputedStyle(el, "::before");
        const parent = el.parentElement?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          parentHeight: parent?.height ?? 0,
          position: window.getComputedStyle(el).position,
          animationName: before.animationName,
        };
      });
    });

    expect(ovSpines.length).toBeGreaterThan(0);
    for (const spine of ovSpines) {
      expect(spine.width).toBe(4); // ov-spine is always 4px wide
      if (spine.parentHeight > 0) {
        // spine should fill close to full parent height (align-self: stretch)
        expect(spine.height / spine.parentHeight).toBeGreaterThan(0.9);
      }
      expect(spine.animationName).not.toBe("none");
    }
  });

  test("@long LlamaCpp: neon glow + spectrum applies card-glow box-shadow to PanelCards", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
      document.documentElement.setAttribute("data-accent-mode", "spectrum");
    });
    await waitForAccentIndices(page);

    // PanelCard has data-accent-el and boxShadow: var(--card-glow).
    // With neon glow on, --card-glow should resolve to a non-trivial value.
    const hasShadow = await page.evaluate(() => {
      const panels = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      return Array.from(panels).some((el) => {
        const shadow = window.getComputedStyle(el).boxShadow;
        return shadow && shadow !== "none" && !shadow.startsWith("0px 0px 0px");
      });
    });

    expect(hasShadow).toBe(true);
  });
});

// ─── @long: Cross-mode regression checks ─────────────────────────────────────

test.describe("@long Accent mode transitions: no stale el-index after mode switch", () => {
  test("@long Switching from Spectrum to Solid resets visual uniformity (all el-index still assigned)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/gpu`);
    await waitForAppReady(page);

    // Start in spectrum
    await setAccentMode(page, "spectrum");
    await waitForAccentIndices(page);

    const spectrumIndices = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      return new Set(
        Array.from(els)
          .map((el) => el.style.getPropertyValue("--el-index"))
          .filter(Boolean),
      ).size;
    });
    expect(spectrumIndices).toBeGreaterThan(1);

    // Switch to solid
    await setAccentMode(page, "solid");
    await page.waitForTimeout(200);

    // el-index values still exist (indexer keeps running)
    const solidIndices = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      return Array.from(els)
        .map((el) => el.style.getPropertyValue("--el-index"))
        .filter(Boolean).length;
    });
    expect(solidIndices).toBeGreaterThan(0);
  });

  test("@long useAccentIndexer re-runs after DOM update (new data-accent-el added)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await setAccentMode(page, "spectrum");
    await waitForAccentIndices(page);

    // Inject a new data-accent-el element into the DOM
    const newIndex = await page.evaluate(async () => {
      const div = document.createElement("div");
      div.setAttribute("data-accent-el", "");
      div.style.display = "none";
      document.body.appendChild(div);
      // Wait for MutationObserver to trigger (up to 500ms)
      await new Promise((r) => setTimeout(r, 500));
      return div.style.getPropertyValue("--el-index");
    });

    // The indexer should have assigned an el-index to the new element
    expect(newIndex).not.toBe("");
  });
});
