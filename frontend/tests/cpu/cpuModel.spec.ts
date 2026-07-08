import { test, expect } from "@playwright/test";

const BACKEND_BASE = (process.env.E2E_BASE_URL || "http://localhost:5173").replace("5173", "3001");

test.describe("CPU Page - Model Name", () => {
  const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/cpu`);
    await page.waitForLoadState("networkidle");
  });

  test("CPU model from API does not end with 'Processor'", async ({ page }) => {
    const resp = await page.request.get(`${BACKEND_BASE}/api/metrics/cpu`);
    expect(resp.ok()).toBe(true);

    const json = await resp.json();
    const model: string = json.data?.model ?? "";

    expect(model).toBeTruthy();
    expect(model).not.toBe("Unknown CPU");
    expect(model.toLowerCase().trimEnd()).not.toMatch(/\bprocessor$/);
  });

  test("CPU model is rendered in the page DOM", async ({ page }) => {
    const resp = await page.request.get(`${BACKEND_BASE}/api/metrics/cpu`);
    const json = await resp.json();
    const model: string = json.data?.model ?? "";

    test.skip(!model || model === "Unknown CPU", "No real CPU model returned by backend");

    // Wait for the live data to populate (model appears once first poll arrives)
    await expect(page.getByText(model, { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("page does not show 'Unknown CPU' when backend provides a model", async ({ page }) => {
    const resp = await page.request.get(`${BACKEND_BASE}/api/metrics/cpu`);
    const json = await resp.json();
    const model: string = json.data?.model ?? "";

    test.skip(!model, "Backend returned no model field");

    // If the backend gives a real model, the fallback text must not appear
    if (model !== "Unknown CPU") {
      await expect(page.getByText("Unknown CPU")).not.toBeVisible();
    }
  });
});
