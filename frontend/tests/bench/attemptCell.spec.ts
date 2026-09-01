/**
 * T268 Part 1 — the bench attempt cell's `error` fill.
 *
 * Not observable in jsdom: the fill is a `color-mix()` over two custom
 * properties, and jsdom computes no cascade. These assertions therefore live
 * here, in a real browser.
 *
 * The strip is injected rather than harvested from the page: which cell states
 * appear on /bench depends on whatever run happens to be on disk, and `error`
 * is not guaranteed. Injecting exercises the real stylesheet — which is what is
 * under test — without depending on run data.
 */
import { test, expect, type Page } from "@playwright/test";

/** Mirrors the real markup: AttemptCell renders <button> when it has an
 *  onClick and <i> otherwise (the legend's decorative swatches). */
const STRIP_HTML = `
  <div id="t268" style="position:fixed;left:200px;top:200px;z-index:99999">
    <span class="bench-strip">
      <span class="bench-sgrp">
        <button class="bench-att error" id="t268-a"></button>
        <button class="bench-att miss" id="t268-c"></button>
      </span>
    </span>
    <span class="bench-strip">
      <span class="bench-sgrp">
        <i class="bench-att error" id="t268-legend"></i>
      </span>
    </span>
  </div>`;

async function mount(page: Page, bg: "dark" | "light") {
  await page.goto("/bench");
  await page.evaluate(
    ({ html, bg }) => {
      document.getElementById("t268")?.remove();
      if (bg === "light") document.documentElement.setAttribute("data-bg", "light");
      else document.documentElement.removeAttribute("data-bg");
      document.body.insertAdjacentHTML("beforeend", html);
    },
    { html: STRIP_HTML, bg },
  );
}

/** Contrast ratios between the cell fills and the card background, computed
 *  in-page so `color-mix()` is actually resolved. */
async function contrasts(page: Page) {
  return page.evaluate(() => {
    // Chrome returns "rgb(r, g, b)" (0-255) or "color(srgb r g b)" (0-1).
    const rgb = (s: string): number[] => {
      const n = (s.match(/[\d.]+/g) || []).map(Number);
      return s.startsWith("color(") ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
    };
    const lum = (c: number[]) => {
      const a = c.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };
    const bgOf = (sel: string) =>
      rgb(getComputedStyle(document.querySelector(sel)!).backgroundColor);

    const probe = document.createElement("div");
    document.body.appendChild(probe);
    probe.style.background = "var(--bg-card)";
    const card = rgb(getComputedStyle(probe).backgroundColor);
    probe.remove();

    const error = bgOf("#t268-a");
    const miss = bgOf("#t268-c");
    const legend = bgOf("#t268-legend");
    return {
      errorVsCard: ratio(error, card),
      errorVsMiss: ratio(error, miss),
      errorRgb: error.map(Math.round),
      legendRgb: legend.map(Math.round),
    };
  });
}

for (const bg of ["dark", "light"] as const) {
  test(`T268: the error cell is visibly distinct from the card on ${bg}`, async ({
    page,
  }) => {
    await mount(page, bg);
    const c = await contrasts(page);
    // Pre-fix (35% --danger) this was 1.53 on dark and 1.60 on light: the cell
    // read as empty or broken rather than dim red. 50% lifts both to ~1.9.
    expect(c.errorVsCard).toBeGreaterThan(1.8);
  });

  test(`T268: error stays separable from miss on ${bg}`, async ({ page }) => {
    await mount(page, bg);
    const c = await contrasts(page);
    // Intensity, not hue, separates these two. If the mix is pushed too far the
    // encoding collapses -- so this is the ceiling that stops it.
    expect(c.errorVsMiss).toBeGreaterThan(1.5);
    expect(c.errorRgb).not.toEqual([239, 68, 68]);
  });

  test(`T268: the legend swatch matches the in-table cell on ${bg}`, async ({
    page,
  }) => {
    await mount(page, bg);
    const c = await contrasts(page);
    // Same CELL_CLASS via AttemptCell, so this should need no separate rule.
    expect(c.legendRgb).toEqual(c.errorRgb);
  });
}
