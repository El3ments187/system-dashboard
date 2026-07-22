/**
 * The Settings GPU-backend indicator against the REAL backend — the browser
 * side of the /api/status contract the card depends on. Authored; run once
 * locally before trusting in CI.
 */
import { test, expect } from "@playwright/test";

test("GPU Metrics Backend card resolves to a definitive state", async ({ page }) => {
  await page.goto("/settings");
  const status = page.getByTestId("gpu-backend-status");
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status).not.toHaveAttribute("data-state", "loading", { timeout: 10_000 });
  const state = await status.getAttribute("data-state");
  expect(["ok", "degraded", "error"]).toContain(state);
  await expect(status.locator("span").nth(1)).not.toHaveText("");
});
