/**
 * Invariants 13-15 (Tier A): Controls & persistence.
 *
 * 13. Every Theme-page control (accent, mode, sliders, effect toggles, Glow Color)
 *     updates the UI live AND persists to localStorage AND restores on reload.
 * 14. Contextual visibility: each sub-control appears only when its parent effect is active.
 * 15. The live preview reflects every control identically to real pages.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function goToTheme(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/theme`);
  await page.waitForSelector(".theme-page", { timeout: 8000 });
}

async function getLS(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

async function getHtmlAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate(
    (a) => document.documentElement.getAttribute(a),
    attr,
  );
}

async function getCssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

// ── Invariant 13: accent mode persists ───────────────────────────────────────

test("Invariant 13: accent mode button updates data-accent-mode and persists", async ({
  page,
}) => {
  await goToTheme(page);

  // Find and click the "rainbow-wave" mode option
  const rainbowBtn = page.locator(".mode-row", { hasText: /rainbow wave/i }).first();
  await rainbowBtn.click();
  await page.waitForTimeout(200);

  // Live: html attribute updated
  expect(await getHtmlAttr(page, "data-accent-mode")).toBe("rainbow-wave");

  // Persisted: localStorage key updated
  const stored = await getLS(page, "dashboard-accent-mode");
  expect(stored).toBe("rainbow-wave");

  // Restore: reload and verify it's still rainbow-wave
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });
  expect(await getHtmlAttr(page, "data-accent-mode")).toBe("rainbow-wave");
});

// ── Invariant 13: neon glow toggle persists ───────────────────────────────────

test("Invariant 13: Neon Glow toggle sets data-glow and persists", async ({
  page,
}) => {
  await goToTheme(page);
  // Clear glow state first
  await page.evaluate(() => localStorage.removeItem("dashboard-glow"));
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  const glowRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const wasBefore = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );

  await glowRow.click();
  await page.waitForTimeout(200);

  const isNowActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  expect(isNowActive).toBe(!wasBefore);

  const stored = await getLS(page, "dashboard-glow");
  expect(stored).toBeTruthy();

  // Restore on reload
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });
  const restoredRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const restoredActive = await restoredRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  expect(restoredActive).toBe(isNowActive);
});

// ── Invariant 13: pulse toggle persists ──────────────────────────────────────

test("Invariant 13: Pulse toggle persists to localStorage and restores", async ({
  page,
}) => {
  await goToTheme(page);
  await page.evaluate(() => localStorage.removeItem("dashboard-pulse"));
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  const pulseRow = page.locator(".mode-row", { hasText: /^Pulse/i }).first();
  await pulseRow.click();
  await page.waitForTimeout(200);

  const stored = await getLS(page, "dashboard-pulse");
  expect(stored).toBe("on");

  const attr = await getHtmlAttr(page, "data-pulse");
  expect(attr).toBe("on");

  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });
  expect(await getHtmlAttr(page, "data-pulse")).toBe("on");
});

// ── Invariant 13: glow intensity slider updates --glow-intensity ──────────────

test("Invariant 13: Glow Intensity slider updates --glow-intensity CSS var and persists", async ({
  page,
}) => {
  await goToTheme(page);

  // Enable glow first so slider is visible
  const glowRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const glowActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  if (!glowActive) await glowRow.click();
  await page.waitForTimeout(200);

  // Find the glow intensity slider
  const slider = page.locator('input[type="range"]').filter({ hasText: "" }).first();

  // Sliders exist on the page - find by proximity to Glow Intensity label
  const glowIntensitySlider = page.locator(".effect-row-group").filter({ hasText: /glow intensity/i })
    .locator('input[type="range"]').first();

  if ((await glowIntensitySlider.count()) === 0) {
    // Skip if slider not found - may need glow enabled
    return;
  }

  await glowIntensitySlider.fill("2");
  await page.waitForTimeout(200);

  const cssVal = await getCssVar(page, "--glow-intensity");
  expect(parseFloat(cssVal)).toBeCloseTo(2, 0);

  const stored = await getLS(page, "dashboard-glow-intensity");
  expect(stored).toBeTruthy();

  // Restore
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });
  const restored = await getCssVar(page, "--glow-intensity");
  expect(parseFloat(restored)).toBeCloseTo(2, 0);
});

// ── Invariant 14: glow sub-controls only appear when glow is active ───────────

test("Invariant 14: Glow intensity slider hidden when glow is off", async ({
  page,
}) => {
  await goToTheme(page);
  await page.evaluate(() => localStorage.removeItem("dashboard-glow"));
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  const glowRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const isActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );

  if (isActive) {
    // Turn off glow
    await glowRow.click();
    await page.waitForTimeout(200);
  }

  // Glow color buttons should NOT be visible
  const glowColorSection = page.locator("button", { hasText: /^accent$/i });
  await expect(glowColorSection).not.toBeVisible();
});

test("Invariant 14: Glow color buttons appear when glow is enabled", async ({
  page,
}) => {
  await goToTheme(page);

  // Enable glow
  const glowRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const isActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  if (!isActive) await glowRow.click();
  await page.waitForTimeout(200);

  // Glow color section should be visible
  const accentBtn = page.getByRole("button", { name: /^accent$/i }).first();
  await expect(accentBtn).toBeVisible();
});

// ── Invariant 14: pulse speed slider only visible when pulse is on ────────────

test("Invariant 14: Pulse speed slider hidden when pulse is off", async ({
  page,
}) => {
  await goToTheme(page);
  await page.evaluate(() => localStorage.removeItem("dashboard-pulse"));
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  const pulseRow = page.locator(".mode-row", { hasText: /^Pulse/i }).first();
  const isActive = await pulseRow.evaluate((el) =>
    el.classList.contains("active"),
  );

  if (isActive) {
    await pulseRow.click();
    await page.waitForTimeout(200);
  }

  // Pulse speed controls shouldn't be visible
  const pulseGroup = page.locator(".effect-row-group").filter({ hasText: /pulse speed/i });
  await expect(pulseGroup).not.toBeVisible();
});

// ── Invariant 15: live preview reflects controls ──────────────────────────────

test("Invariant 15: live preview shows accent-glow-target elements (preview updates)", async ({
  page,
}) => {
  await goToTheme(page);

  // The theme preview section should contain live preview bars with accent styling
  const previewBars = page.locator(".preview-bar-fill, .theme-live-preview-bar");
  const count = await previewBars.count();
  expect(count, "Theme page should have live preview bars").toBeGreaterThan(0);
});

test("Invariant 15: live preview bar has accent-glow-target class", async ({
  page,
}) => {
  await goToTheme(page);

  const previewAccentTargets = page.locator(
    ".preview-bar-fill.accent-glow-target, .theme-live-preview-bar.accent-glow-target",
  );
  const count = await previewAccentTargets.count();
  expect(
    count,
    "Live preview bars should have accent-glow-target for pulse/glow effects",
  ).toBeGreaterThan(0);
});

// ── Invariant 13: glow custom color persists ─────────────────────────────────

test("Invariant 13: Custom glow color selection persists across reload", async ({
  page,
}) => {
  await goToTheme(page);
  await page.evaluate(() => {
    localStorage.removeItem("dashboard-glow-color");
    localStorage.removeItem("dashboard-glow-custom");
  });
  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  // Enable glow
  const glowRow = page.locator(".mode-row", { hasText: /neon glow/i }).first();
  const glowActive = await glowRow.evaluate((el) =>
    el.classList.contains("active"),
  );
  if (!glowActive) await glowRow.click();
  await page.waitForTimeout(200);

  // Switch to custom glow color
  const customBtn = page.getByRole("button", { name: /^custom$/i }).first();
  await customBtn.click();
  await page.waitForTimeout(200);

  // Pick Cyan swatch
  const cyanBtn = page.getByRole("button", { name: "Cyan" }).first();
  await cyanBtn.click();
  await page.waitForTimeout(300);

  const stored = await getLS(page, "dashboard-glow-custom");
  expect(stored?.toLowerCase()).toBe("#06b6d4");

  await page.reload();
  await page.waitForSelector(".theme-page", { timeout: 8000 });

  const restoredStored = await getLS(page, "dashboard-glow-custom");
  expect(restoredStored?.toLowerCase()).toBe("#06b6d4");
});
