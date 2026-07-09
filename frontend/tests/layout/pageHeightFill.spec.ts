import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// Guards against the App.tsx regression where the #main-content wrapper div
// lacked `flex: 1` and `display: flex`, causing page <main> elements to shrink
// to content height and leave a blank area below the content.

async function measureFill(page: import("@playwright/test").Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  // Wait for the page <main> to be rendered (app exits the "Initializing dashboard..." state)
  await page.waitForSelector("main", { state: "visible", timeout: 15000 });

  return page.evaluate(() => {
    const viewportH = window.innerHeight;
    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const availableH = viewportH - headerH;

    const mainContent = document.getElementById("main-content");
    const main = document.querySelector("main");

    return {
      viewportH,
      headerH,
      availableH,
      mainContentH: mainContent ? mainContent.getBoundingClientRect().height : 0,
      mainH: main ? main.getBoundingClientRect().height : 0,
    };
  });
}

const PAGES = [
  { label: "Overview", path: "/" },
  { label: "GPU", path: "/gpu" },
  { label: "CPU", path: "/cpu" },
];

for (const { label, path } of PAGES) {
  test.describe(`${label} page — layout fill`, () => {
    test(`#main-content fills ≥95% of available height below header`, async ({ page }) => {
      const dims = await measureFill(page, path);
      // #main-content must grow to fill the flex column
      expect(dims.mainContentH).toBeGreaterThanOrEqual(dims.availableH * 0.95);
    });

    test(`<main> fills ≥85% of available height below header`, async ({ page }) => {
      const dims = await measureFill(page, path);
      // The inner <main> must also fill its parent (requires parent to be flex)
      expect(dims.mainH).toBeGreaterThanOrEqual(dims.availableH * 0.85);
    });
  });
}
