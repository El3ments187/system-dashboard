/**
 * T268 — the bench attempt cell: `error` legibility and hit area.
 *
 * Both faults are CSS-level and neither is observable in jsdom: `error`'s fill
 * is a `color-mix()` over two custom properties (jsdom computes no cascade),
 * and the hit area is a `::after` overlay (jsdom has no pseudo-element boxes
 * and no layout). These assertions therefore live here, in a real browser.
 *
 * The strip is injected rather than harvested from the page: which cell states
 * appear on /bench depends on whatever run happens to be on disk, and `error`
 * is not guaranteed. Injecting exercises the real stylesheet — which is what is
 * under test — without depending on run data. It is positioned at integer
 * coordinates so hit-testing is not skewed by fractional rects.
 */
import { test, expect, type Page } from "@playwright/test";

/** Mirrors the real markup: AttemptCell renders <button> when it has an
 *  onClick and <i> otherwise (the legend's decorative swatches). */
const STRIP_HTML = `
  <div id="t268" style="position:fixed;left:200px;top:200px;z-index:99999">
    <span class="bench-strip">
      <span class="bench-sgrp">
        <button class="bench-att error" id="t268-a"></button>
        <button class="bench-att error" id="t268-b"></button>
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

/** Contrast ratio between two elements' resolved background colours, plus the
 *  card background, computed in-page so `color-mix()` is actually resolved. */
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

test("T268: the cell keeps its 11px visual size", async ({ page }) => {
  await mount(page, "dark");
  const box = await page.evaluate(() => {
    const r = document.getElementById("t268-a")!.getBoundingClientRect();
    const i = document.getElementById("t268-legend")!.getBoundingClientRect();
    return { btn: [r.width, r.height], legend: [i.width, i.height] };
  });
  // The strip is 3 cells per sample across 29 tasks -- growing the cell would
  // change the whole table's rhythm. Only the hit area may grow.
  expect(box.btn).toEqual([11, 11]);
  expect(box.legend).toEqual([11, 11]);
});

test("T268: a click outside the visual cell still hits it", async ({ page }) => {
  await mount(page, "dark");
  const probe = await page.evaluate(() => {
    const a = document.getElementById("t268-a")!;
    const r = a.getBoundingClientRect();
    const owner = (x: number, y: number) => document.elementFromPoint(x, y) === a;
    return {
      above2: owner(r.left + r.width / 2, r.top - 2),
      below2: owner(r.left + r.width / 2, r.bottom + 2),
      left1: owner(r.left - 1, r.top + r.height / 2),
      // 3px vertical is the whole overlay, so 4px must fall outside it --
      // otherwise the assertion above would pass on an unbounded target.
      above4: owner(r.left + r.width / 2, r.top - 4),
    };
  });
  expect(probe.above2).toBe(true);
  expect(probe.below2).toBe(true);
  expect(probe.left1).toBe(true);
  expect(probe.above4).toBe(false);
});

test("T268: adjacent cells' hit areas do not overlap", async ({ page }) => {
  await mount(page, "dark");
  const geo = await page.evaluate(() => {
    const a = document.getElementById("t268-a")!.getBoundingClientRect();
    const b = document.getElementById("t268-b")!.getBoundingClientRect();
    const inset = getComputedStyle(document.getElementById("t268-a")!, "::after").inset;
    // Horizontal growth is capped by the flex gap; parse it rather than
    // hard-coding, so a gap change fails here instead of silently overlapping.
    // `auto` (no overlay at all) means no growth -- 0, not NaN, so this stays a
    // real geometry check rather than failing merely because the rule is absent.
    const parsed = parseFloat(inset.split(" ")[1] ?? inset);
    const horiz = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
    return { gap: b.left - a.right, horiz, aOverlayRight: a.right + horiz, bOverlayLeft: b.left - horiz };
  });
  // Touching is fine; crossing is not -- an overlap makes a click near the
  // boundary select the neighbour.
  expect(geo.aOverlayRight).toBeLessThanOrEqual(geo.bOverlayLeft);
  expect(geo.horiz * 2).toBeLessThanOrEqual(geo.gap);
});

test("T268: a decorative swatch gains no hit area", async ({ page }) => {
  await mount(page, "dark");
  const legend = await page.evaluate(() => {
    const i = document.getElementById("t268-legend")!;
    const r = i.getBoundingClientRect();
    return {
      afterContent: getComputedStyle(i, "::after").content,
      // 2px above a real cell hits it; the legend must not behave that way.
      above2IsSelf:
        document.elementFromPoint(r.left + r.width / 2, r.top - 2) === i,
      tag: i.tagName.toLowerCase(),
    };
  });
  // The rule is scoped to `button.bench-att`, and AttemptCell only renders a
  // <button> when it has an onClick -- so the legend is excluded structurally.
  expect(legend.tag).toBe("i");
  expect(legend.afterContent).toBe("none");
  expect(legend.above2IsSelf).toBe(false);
});
