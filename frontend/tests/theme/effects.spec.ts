import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function goToTheme(page: Page) {
  await page.goto(`${BASE_URL}/theme`);
  await page.waitForSelector(".theme-page", { timeout: 6000 });
}

async function getHtmlAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate((a) => document.documentElement.getAttribute(a), attr);
}

async function clearEffectState(page: Page) {
  await page.evaluate(() => {
    [
      "dashboard-glow",
      "dashboard-pulse",
      "dashboard-pulse-speed",
      "dashboard-inner-glow",
      "dashboard-gradient-border",
      "dashboard-card-glow",
    ].forEach((k) => localStorage.removeItem(k));
  });
}

async function clickEffectRow(page: Page, label: string) {
  await page.locator(".mode-row", { hasText: label }).first().click();
}

test.describe("Theme page effect toggles", () => {
  test.beforeEach(async ({ page }) => {
    await goToTheme(page);
    await clearEffectState(page);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
  });

  test("Neon Glow toggle sets data-glow=neon on <html>", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    expect(await getHtmlAttr(page, "data-glow")).toBe("neon");
  });

  test("Neon Glow toggle is reversible", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    await clickEffectRow(page, "Neon Glow");
    expect(await getHtmlAttr(page, "data-glow")).toBeNull();
  });

  test("Pulse toggle sets data-pulse=on on <html>", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    expect(await getHtmlAttr(page, "data-pulse")).toBe("on");
  });

  test("Pulse Speed slider appears when Pulse is on", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    await expect(
      page.locator("label").filter({ hasText: /Pulse Speed/ }),
    ).toBeVisible();
  });

  test("Pulse Speed slider is hidden when Pulse is off", async ({ page }) => {
    await expect(
      page.locator("label").filter({ hasText: /Pulse Speed/ }),
    ).not.toBeVisible();
  });

  test("Inner Glow toggle sets data-inner-glow=on on <html>", async ({
    page,
  }) => {
    await clickEffectRow(page, "Inner Glow");
    expect(await getHtmlAttr(page, "data-inner-glow")).toBe("on");
  });

  test("Gradient Border toggle sets data-gradient-border=on on <html>", async ({
    page,
  }) => {
    await clickEffectRow(page, "Gradient Border");
    expect(await getHtmlAttr(page, "data-gradient-border")).toBe("on");
  });

  test("Card Glow does not activate without Neon Glow or Inner Glow", async ({
    page,
  }) => {
    await clickEffectRow(page, "Card Glow");
    expect(await getHtmlAttr(page, "data-card-glow")).toBeNull();
  });

  test("Card Glow activates when Neon Glow is on", async ({ page }) => {
    await clickEffectRow(page, "Neon Glow");
    await page.waitForTimeout(100);
    await clickEffectRow(page, "Card Glow");
    expect(await getHtmlAttr(page, "data-card-glow")).toBe("on");
  });

  test("Card Glow activates when Inner Glow is on", async ({ page }) => {
    await clickEffectRow(page, "Inner Glow");
    await page.waitForTimeout(100);
    await clickEffectRow(page, "Card Glow");
    expect(await getHtmlAttr(page, "data-card-glow")).toBe("on");
  });

  test("Card Glow shows disabled hint when no glow is active", async ({
    page,
  }) => {
    await expect(
      page.getByText("Requires Neon Glow or Inner Glow"),
    ).toBeVisible();
  });

  test("Pulse effect persists across reload", async ({ page }) => {
    await clickEffectRow(page, "Pulse");
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    expect(await getHtmlAttr(page, "data-pulse")).toBe("on");
  });

  test("Inner Glow effect persists across reload", async ({ page }) => {
    await clickEffectRow(page, "Inner Glow");
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    expect(await getHtmlAttr(page, "data-inner-glow")).toBe("on");
  });
});

test.describe("Per-page accent-el index consistency", () => {
  const PAGES = [
    { name: "Overview", path: "/" },
    { name: "GPU", path: "/gpu" },
    { name: "CPU", path: "/cpu" },
    { name: "LlamaCpp", path: "/llama-cpp" },
  ];

  for (const { name, path } of PAGES) {
    test(`${name}: all [data-accent-el] elements have an assigned --el-index`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");

      const result = await page.evaluate(() => {
        const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
        const indices = Array.from(els).map((el) =>
          el.style.getPropertyValue("--el-index"),
        );
        return {
          total: els.length,
          assigned: indices.filter((i) => i !== "").length,
          unique: new Set(indices.filter((i) => i !== "")).size,
        };
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.assigned).toBe(result.total);
      expect(result.unique).toBe(result.total);
    });

    test(`${name}: Neon Glow applies box-shadow to .accent-glow-target elements`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");

      await page.evaluate(() => {
        document.documentElement.setAttribute("data-glow", "neon");
      });
      await page.waitForTimeout(100);

      const count = await page.evaluate(() => {
        return document.querySelectorAll(".accent-glow-target").length;
      });

      // Only check box-shadow if glow targets exist on this page
      if (count > 0) {
        const hasShadow = await page.evaluate(() => {
          const targets = document.querySelectorAll<HTMLElement>(
            ".accent-glow-target",
          );
          return Array.from(targets).every((el) => {
            const shadow = window.getComputedStyle(el).boxShadow;
            return shadow !== "none" && shadow !== "";
          });
        });
        expect(hasShadow).toBe(true);
      }
    });
  }
});

test.describe("Spectrum mode distinct --el-index values", () => {
  test("Overview page: elements have distinct --el-index in Spectrum mode", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent-mode", "spectrum");
    });
    await page.waitForTimeout(150);

    const indices = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(
        '[style*="--el-index"]',
      );
      return Array.from(els).map((el) =>
        el.style.getPropertyValue("--el-index"),
      );
    });

    expect(indices.length).toBeGreaterThan(1);
    expect(new Set(indices).size).toBeGreaterThan(1);
  });
});
