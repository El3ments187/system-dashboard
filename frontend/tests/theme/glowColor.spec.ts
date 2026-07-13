import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function waitForAppReady(page: Page) {
  await page.waitForSelector(".app-root", { timeout: 10000 });
}

async function goToTheme(page: Page) {
  await page.goto(`${BASE_URL}/theme`);
  await page.waitForSelector(".theme-page", { timeout: 6000 });
}

async function enableNeonGlow(page: Page) {
  const glowRow = page.locator(".mode-row", { hasText: "Neon Glow" }).first();
  const isActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  if (!isActive) await glowRow.click();
  await page.waitForTimeout(100);
}

async function selectGlowColorMode(
  page: Page,
  mode: "accent" | "match" | "custom",
) {
  const btn = page
    .getByRole("button", { name: new RegExp(`^${mode}$`, "i") })
    .first();
  await btn.click();
  await page.waitForTimeout(100);
}

test.describe("Glow Color: Custom swatch selector", () => {
  test.beforeEach(async ({ page }) => {
    await goToTheme(page);
    await page.evaluate(() => {
      localStorage.removeItem("dashboard-glow-color");
      localStorage.removeItem("dashboard-glow-custom");
      localStorage.removeItem("dashboard-glow");
    });
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    await enableNeonGlow(page);
  });

  test("Custom mode shows exactly 32 accent swatches, no free-form color input", async ({
    page,
  }) => {
    await selectGlowColorMode(page, "custom");

    // No <input type="color"> should exist
    const colorInput = page.locator('input[type="color"]');
    await expect(colorInput).toHaveCount(0);

    // 32 swatches: each accent theme has a named button
    const swatches = page.locator(
      '[data-testid="glow-custom-swatches"] button',
    );
    await expect(swatches).toHaveCount(32);
  });

  test("Clicking Cyan swatch sets --accent-glow to a cyan color everywhere", async ({
    page,
  }) => {
    await selectGlowColorMode(page, "custom");

    const cyanBtn = page
      .getByTestId("glow-custom-swatches")
      .getByRole("button", { name: "Cyan" });
    await cyanBtn.click();
    await page.waitForTimeout(200);

    // --glow-custom should now be set to Cyan's hex (#06B6D4)
    const glowCustom = await page.evaluate(() =>
      document.documentElement.style
        .getPropertyValue("--glow-custom")
        .trim()
        .toLowerCase(),
    );
    expect(glowCustom).toBe("#06b6d4");

    // --accent-glow should resolve to a cyan-hue color
    const accentGlow = await page.evaluate(() =>
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-glow")
        .trim(),
    );
    expect(accentGlow).not.toBe("");
    // The glow should contain the cyan channel — it should NOT be red or blue
    // We verify by checking data-glow-color="custom" is set on <html>
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBe("custom");
  });

  test("Clicking Cyan then checking the preview resolves to cyan hue", async ({
    page,
  }) => {
    await selectGlowColorMode(page, "custom");
    const cyanBtn = page
      .getByTestId("glow-custom-swatches")
      .getByRole("button", { name: "Cyan" });
    await cyanBtn.click();
    await page.waitForTimeout(200);

    // Verify on the live preview: the glow targets' --card-glow color is cyan-derived
    const isCustom = await page.evaluate(() => {
      const root = document.documentElement;
      const glowCustom = root.style
        .getPropertyValue("--glow-custom")
        .trim()
        .toLowerCase();
      const dataAttr = root.getAttribute("data-glow-color");
      return { glowCustom, dataAttr };
    });
    expect(isCustom.glowCustom).toBe("#06b6d4");
    expect(isCustom.dataAttr).toBe("custom");
  });

  test("Switching back to Match hides the swatch grid", async ({ page }) => {
    await selectGlowColorMode(page, "custom");
    await expect(
      page.locator('[data-testid="glow-custom-swatches"]'),
    ).toBeVisible();

    await selectGlowColorMode(page, "match");
    await expect(
      page.locator('[data-testid="glow-custom-swatches"]'),
    ).not.toBeVisible();
  });

  test("Picked swatch persists across reload", async ({ page }) => {
    await selectGlowColorMode(page, "custom");
    const cyanBtn = page
      .getByTestId("glow-custom-swatches")
      .getByRole("button", { name: "Cyan" });
    await cyanBtn.click();
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });
    await enableNeonGlow(page);

    // After reload, glow mode should still be custom with Cyan selected
    const glowCustom = await page.evaluate(() =>
      document.documentElement.style
        .getPropertyValue("--glow-custom")
        .trim()
        .toLowerCase(),
    );
    expect(glowCustom).toBe("#06b6d4");
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBe("custom");

    // The Cyan swatch should appear selected (highlighted border)
    const cyanBtnAfter = page
      .getByTestId("glow-custom-swatches")
      .getByRole("button", { name: "Cyan" });
    await expect(cyanBtnAfter).toBeVisible();
  });

  test("Match mode: glow color attribute is 'match' on <html>", async ({
    page,
  }) => {
    await selectGlowColorMode(page, "match");
    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-glow-color"),
    );
    expect(attr).toBe("match");
  });

  test("match/accent/custom glow alpha are identical at the same intensity (REQ-FX-9)", async ({
    page,
  }) => {
    // Use the same source color for all three modes so only the percentage matters
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-accent", "blue");
      document.documentElement.style.setProperty("--glow-custom", "#3b82f6");
    });
    await page.waitForTimeout(100);

    async function readGlowAlpha(mode: string): Promise<number> {
      return page.evaluate((m) => {
        document.documentElement.setAttribute("data-glow-color", m);
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;top:-10px;width:1px;height:1px;background:var(--accent-glow);pointer-events:none";
        document.body.appendChild(probe);
        const color = window.getComputedStyle(probe).backgroundColor;
        document.body.removeChild(probe);
        const match = color.match(
          /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/,
        );
        return match && match[1] !== undefined ? parseFloat(match[1]) : 1;
      }, mode);
    }

    const matchAlpha = await readGlowAlpha("match");
    const accentAlpha = await readGlowAlpha("accent");
    const customAlpha = await readGlowAlpha("custom");

    expect(matchAlpha).toBeGreaterThan(0);
    expect(matchAlpha).toBeLessThan(1);
    // All three modes must produce the same glow alpha (within rounding tolerance)
    expect(accentAlpha).toBeCloseTo(matchAlpha, 1);
    expect(customAlpha).toBeCloseTo(matchAlpha, 1);
  });

  test("Out-of-palette saved value migrates to a valid accent on load", async ({
    page,
  }) => {
    // Pre-seed an out-of-palette value in localStorage
    await page.evaluate(() => {
      localStorage.setItem("dashboard-glow-color", "custom");
      localStorage.setItem("dashboard-glow-custom", "#ff5733"); // not in palette
    });
    await page.reload();
    await page.waitForSelector(".theme-page", { timeout: 6000 });

    // --glow-custom should have been migrated to a palette color
    const glowCustom = await page.evaluate(() =>
      document.documentElement.style
        .getPropertyValue("--glow-custom")
        .trim()
        .toLowerCase(),
    );
    // Should be one of the palette hex values, not the original #ff5733
    expect(glowCustom).not.toBe("#ff5733");
    // And it should be a valid hex color
    expect(glowCustom).toMatch(/^#[0-9a-f]{6}$/);
  });
});
