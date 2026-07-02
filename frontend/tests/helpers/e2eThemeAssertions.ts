import { expect, type Page } from "@playwright/test";

export async function setAccentMode(page: Page, mode: string) {
  await page.evaluate((m) => {
    document.documentElement.setAttribute("data-accent-mode", m);
  }, mode);
}

export async function setAccent(page: Page, accent: string) {
  await page.evaluate((a) => {
    document.documentElement.setAttribute("data-accent", a);
  }, accent);
}

export async function expectNoBlackElements(page: Page) {
  const suspicious = await page.evaluate(() => {
    const all = document.querySelectorAll("*");
    for (const el of Array.from(all)) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;

      if (color === "rgb(0, 0, 0)" && bg !== "rgb(0, 0, 0)") continue;

      if (bg === "rgb(0, 0, 0)" && color === "rgb(0, 0, 0)") return true;

      const rect = el.getBoundingClientRect();
      if (bg === "rgb(0, 0, 0)" && rect.width > 200 && rect.height > 80)
        return true;
    }
    return false;
  });
  expect(suspicious).toBe(false);
}

export async function expectAccentModeSet(page: Page, mode: string) {
  const current = await page.evaluate(() =>
    document.documentElement.getAttribute("data-accent-mode"),
  );
  expect(current).toBe(mode);
}

/** Fails if any inline style attribute contains the literal text browsers leave behind after a broken CSS expression. */
export async function expectNoInvalidCssValues(page: Page) {
  const offenders = await page.evaluate(() => {
    const all = document.querySelectorAll<HTMLElement>("*");
    const found: string[] = [];
    for (const el of Array.from(all)) {
      const inline = el.getAttribute("style") || "";
      if (/undefined|NaN|:\s*null\b/.test(inline)) {
        found.push(`${el.tagName}: ${inline}`);
      }
    }
    return found;
  });
  expect(offenders, offenders.join("\n")).toHaveLength(0);
}

/**
 * Reads the resolved colors of every per-core bar/legend element on the page (CoreBars
 * uses [data-testid="per-core-bar"], PerCoreCpuChart's legend uses
 * [data-testid="per-core-legend-swatch"]) and returns the unique-color count plus raw list.
 */
export async function getPerCoreColors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const els = document.querySelectorAll(
      '[data-testid="per-core-bar"], [data-testid="per-core-legend-swatch"]',
    );
    return Array.from(els)
      .map((el) =>
        (
          el.getAttribute("data-core-assigned-color") ||
          el.getAttribute("data-core-color") ||
          ""
        ).toLowerCase(),
      )
      .filter(Boolean);
  });
}

export async function expectPerCoreUniqueColorCount(
  page: Page,
  minimum: number,
) {
  const colors = await getPerCoreColors(page);
  const unique = new Set(colors).size;
  expect(
    unique,
    `expected >= ${minimum} unique per-core colors, got ${unique} from ${colors.length} elements`,
  ).toBeGreaterThanOrEqual(minimum);
}

/** Resolves the live value of a CSS custom property on :root. */
export async function getCssVariable(
  page: Page,
  name: string,
): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}
