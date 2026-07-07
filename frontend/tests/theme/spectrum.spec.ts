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
  });
  await page.goto(`${BASE_URL}/llama-cpp`);
  await waitForAppReady(page);
}

// ─── LlamaCpp tile data-accent-el coverage ────────────────────────────────────

test.describe("LlamaCpp: data-accent-el on stat tiles", () => {
  test("sampling tiles (Temperature, Top-K, Top-P, Repeat Penalty) have data-accent-el", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    const tileIds = [
      "sampling-temperature",
      "sampling-top-k",
      "sampling-top-p",
      "sampling-repeat-penalty",
    ];
    for (const testId of tileIds) {
      const has = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? el.hasAttribute("data-accent-el") : null;
      }, testId);
      expect(has, `tile "${testId}" must have data-accent-el`).toBe(true);
    }
  });

  test("throughput tiles (Gen Speed, Prompt Speed, token counts) have data-accent-el", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    const tileIds = [
      "thrpt-gen-tps",
      "thrpt-prompt-tps",
      "thrpt-prompt-tokens",
      "thrpt-generated",
      "thrpt-total-sent",
      "thrpt-active-req",
    ];
    for (const testId of tileIds) {
      const has = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? el.hasAttribute("data-accent-el") : null;
      }, testId);
      expect(has, `tile "${testId}" must have data-accent-el`).toBe(true);
    }
  });

  test("context tiles (Current, Max, Remaining, Cache Hits) have data-accent-el", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    const tileIds = [
      "ctx-current",
      "ctx-max",
      "ctx-remaining",
      "ctx-cache-hits",
    ];
    for (const testId of tileIds) {
      const has = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? el.hasAttribute("data-accent-el") : null;
      }, testId);
      expect(has, `tile "${testId}" must have data-accent-el`).toBe(true);
    }
  });

  test("runtime tiles (kvRow: Server, Uptime, Port, Memory) have data-accent-el on container", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    const tileIds = [
      "runtime-server",
      "runtime-uptime",
      "runtime-port",
      "runtime-memory",
    ];
    for (const testId of tileIds) {
      const has = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        // kvRow places data-accent-el on the container, testId on the value span
        return el ? el.closest("[data-accent-el]") !== null : null;
      }, testId);
      expect(
        has,
        `runtime tile "${testId}" container must have data-accent-el`,
      ).toBe(true);
    }
  });
});

// ─── Spectrum distinct --el-index ─────────────────────────────────────────────

test.describe("Spectrum Per-Element: --el-index assignment", () => {
  const PAGES = [
    { name: "Overview", path: "/" },
    { name: "GPU", path: "/gpu" },
    { name: "CPU", path: "/cpu" },
  ];

  for (const { name, path } of PAGES) {
    test(`${name}: all [data-accent-el] get unique --el-index in spectrum mode`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await waitForAppReady(page);
      await setAccentMode(page, "spectrum");
      await waitForAccentIndices(page);

      const result = await page.evaluate(() => {
        const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
        const indices = Array.from(els)
          .map((el) => el.style.getPropertyValue("--el-index"))
          .filter((i) => i !== "");
        return {
          total: els.length,
          assigned: indices.length,
          unique: new Set(indices).size,
        };
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.assigned).toBe(result.total);
      expect(result.unique).toBe(result.total);
    });
  }

  test("LlamaCpp: spectrum mode gives more than 10 tiles distinct --el-index", async ({
    page,
  }) => {
    await setupLlamaCpp(page);
    await setAccentMode(page, "spectrum");
    await waitForAccentIndices(page);

    const result = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      const indices = Array.from(els)
        .map((el) => el.style.getPropertyValue("--el-index"))
        .filter((i) => i !== "");
      return {
        total: els.length,
        unique: new Set(indices).size,
      };
    });

    expect(result.total).toBeGreaterThan(10);
    expect(result.unique).toBe(result.total);
  });
});

// ─── Glow color modes ─────────────────────────────────────────────────────────

test.describe("Glow color mode: data-glow-color attribute", () => {
  test("match mode: data-glow-color attribute is absent from <html>", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await waitForAppReady(page);
    await page.evaluate(() =>
      document.documentElement.removeAttribute("data-glow-color"),
    );
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBeNull();
  });

  test("accent mode: data-glow-color=accent is set on <html>", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await waitForAppReady(page);
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-glow-color", "accent"),
    );
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBe("accent");
  });

  test("custom mode: data-glow-color=custom is set on <html>", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/theme`);
    await waitForAppReady(page);
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-glow-color", "custom"),
    );
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBe("custom");
  });
});

// ─── Pulse animation ──────────────────────────────────────────────────────────

test.describe("Pulse animation", () => {
  test("data-pulse=on starts accent-pulse animation on accent-glow-target elements", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
      document.documentElement.setAttribute("data-pulse", "on");
    });
    await page.waitForTimeout(200);

    const hasAnimation = await page.evaluate(() => {
      const targets = document.querySelectorAll(".accent-glow-target");
      if (!targets.length) return false;
      return Array.from(targets).some((el) => {
        const style = window.getComputedStyle(el, "::before");
        return style.animationName !== "none";
      });
    });

    expect(hasAnimation).toBe(true);
  });

  test("data-pulse removed stops animation on accent-glow-target ::before", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glow", "neon");
      document.documentElement.removeAttribute("data-pulse");
    });
    await page.waitForTimeout(200);

    const noAnimation = await page.evaluate(() => {
      const targets = document.querySelectorAll(".accent-glow-target");
      if (!targets.length) return true;
      return Array.from(targets).every((el) => {
        const style = window.getComputedStyle(el, "::before");
        return style.animationName === "none";
      });
    });

    expect(noAnimation).toBe(true);
  });

  test("card-accent-spine fills full parent height on GPU page", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/gpu`);
    await waitForAppReady(page);
    await page.waitForSelector(".card-accent-spine", { timeout: 5000 });

    const spineResults = await page.evaluate(() => {
      const spines = document.querySelectorAll(".card-accent-spine");
      return Array.from(spines)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const parentRect = el.parentElement?.getBoundingClientRect();
          if (!parentRect || parentRect.height === 0) return null;
          return rect.height / parentRect.height;
        })
        .filter((r): r is number => r !== null);
    });

    expect(spineResults.length).toBeGreaterThan(0);
    for (const ratio of spineResults) {
      expect(ratio).toBeGreaterThan(0.9);
    }
  });
});
