import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// T256 — verify header chips match nav tabs via computed styles in a real browser.
// jsdom cannot compute cascade/specificity, so these assertions live here.

test.describe("T257 — header chips are single bordered boxes (computed styles)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    // Wait until at least one chip is visible (app past the initializing state)
    await page.waitForSelector(".status-chip", { state: "visible", timeout: 15000 });
  });

  // REVERSED BY T257. T256 asserted a transparent border because .dash-nav-btn
  // has one — but a nav tab gains a visible border on hover and when active, so
  // it still reads as a box. A chip has no such state, so transparent removed
  // the only thing making it a box, leaving the label stranded outside.
  test("T257: .status-chip has a VISIBLE border, and data-accent-el is on the chip", async ({
    page,
  }) => {
    const r = await page.evaluate(() => {
      const chip = document.querySelector(".status-chip");
      if (!chip) return null;
      const cs = getComputedStyle(chip);
      return {
        borderColor: cs.borderColor,
        borderWidth: cs.borderTopWidth,
        onChip: chip.hasAttribute("data-accent-el"),
        onValue: !!chip.querySelector(".chip-value[data-accent-el]"),
      };
    });
    expect(r).not.toBeNull();
    expect(r!.borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(r!.borderWidth).toBe("1px");
    // The actual fix: the accent system boxes the element it is on.
    expect(r!.onChip).toBe(true);
    expect(r!.onValue).toBe(false);
  });

  test(".chip-label and .chip-value both have font-size 12.5px", async ({ page }) => {
    const result = await page.evaluate(() => {
      const label = document.querySelector(".chip-label");
      const value = document.querySelector(".chip-value");
      return {
        labelFontSize: label ? getComputedStyle(label).fontSize : null,
        valueFontSize: value ? getComputedStyle(value).fontSize : null,
      };
    });
    expect(result.labelFontSize).toBe("12.5px");
    expect(result.valueFontSize).toBe("12.5px");
  });

  test(".chip-label and .chip-value font-size matches non-active nav tab", async ({ page }) => {
    const result = await page.evaluate(() => {
      const navBtn = document.querySelector(".dash-nav-btn:not(.active)");
      const label = document.querySelector(".chip-label");
      const value = document.querySelector(".chip-value");
      return {
        navBtnFontSize: navBtn ? getComputedStyle(navBtn).fontSize : null,
        labelFontSize: label ? getComputedStyle(label).fontSize : null,
        valueFontSize: value ? getComputedStyle(value).fontSize : null,
      };
    });
    expect(result.navBtnFontSize).not.toBeNull();
    expect(result.labelFontSize).toBe(result.navBtnFontSize);
    expect(result.valueFontSize).toBe(result.navBtnFontSize);
  });

  test(".chip-label color is distinct from .chip-value color", async ({ page }) => {
    const result = await page.evaluate(() => {
      const label = document.querySelector(".chip-label");
      const value = document.querySelector(".chip-value");
      return {
        labelColor: label ? getComputedStyle(label).color : null,
        valueColor: value ? getComputedStyle(value).color : null,
      };
    });
    expect(result.labelColor).not.toBeNull();
    expect(result.valueColor).not.toBeNull();
    expect(result.labelColor).not.toBe(result.valueColor);
  });

  test("HOST chip and Online chip have equal height", async ({ page }) => {
    // Both chips have an explicit height: 26px, so they must match regardless of
    // font metrics. The nav btn has no explicit height and varies by environment.
    const result = await page.evaluate(() => {
      const hostChip = Array.from(document.querySelectorAll(".status-chip")).find(
        (el) => el.querySelector(".chip-label")?.textContent?.match(/host/i),
      );
      const onlineChip = Array.from(document.querySelectorAll(".status-chip")).find(
        (el) => el.textContent?.includes("Online"),
      );
      return {
        hostChipH: hostChip ? hostChip.getBoundingClientRect().height : null,
        onlineChipH: onlineChip ? onlineChip.getBoundingClientRect().height : null,
      };
    });
    expect(result.hostChipH).not.toBeNull();
    expect(result.onlineChipH).toBe(result.hostChipH);
  });

  test("Online chip renders a status dot", async ({ page }) => {
    const hasDot = await page.evaluate(() => !!document.querySelector(".chip-dot"));
    expect(hasDot).toBe(true);
  });

  test(".dash-nav-btn is unchanged — border-radius is 7px", async ({ page }) => {
    const borderRadius = await page.evaluate(() => {
      const navBtn = document.querySelector(".dash-nav-btn");
      return navBtn ? getComputedStyle(navBtn).borderRadius : null;
    });
    expect(borderRadius).toBe("7px");
  });
});
