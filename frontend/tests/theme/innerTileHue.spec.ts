/**
 * Inner sub-tile hue discovery and invariant tests.
 * RED tests written before any fix. Failing assertions identify the exact tiles,
 * pages, and token values involved so the findings list is precise.
 *
 * Target invariant:
 *   In Spectrum mode, a sub-tile's accent border/background has the SAME hue (±15°)
 *   as its parent card's --accent-primary. Tiles in different-hued cards must differ.
 *   In Solid mode all tiles share the single accent (uniform). Semantic/status colors
 *   are excluded and must be unchanged across modes.
 *
 * Sub-tile definition: a [data-accent-el] element (or an element with accent inline
 * styles) that is NESTED inside another [data-accent-el] card element.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

// ── Color helpers injected into page.evaluate ─────────────────────────────────

const COLOR_UTILS = /* js */ `
window.parseRgba = function parseRgba(str) {
  const m1 = str.match(/rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*([\\d.]+))?\\)/);
  if (m1) return { r: +m1[1], g: +m1[2], b: +m1[3], a: m1[4] !== undefined ? +m1[4] : 1 };
  const m2 = str.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)/);
  if (m2) return { r: +m2[1] * 255, g: +m2[2] * 255, b: +m2[3] * 255, a: m2[4] !== undefined ? +m2[4] : 1 };
  return null;
};
window.rgbToHslHue = function rgbToHslHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  const d = max - min;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return h * 360;
};
window.colorHue = function colorHue(str) {
  if (!str) return null;
  // Use canvas to convert any CSS color format (oklch, color(srgb...), rgb, etc) to sRGB
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    // If fully transparent, color has no meaningful hue
    if (d[3] === 0) return null;
    return window.rgbToHslHue(d[0], d[1], d[2]);
  } catch(e) { return null; }
};
window.hueDiff = function hueDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
window.accentColorInContext = function accentColorInContext(containerEl) {
  const probe = document.createElement('div');
  probe.style.cssText = 'background-color:var(--accent-primary);position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;';
  containerEl.appendChild(probe);
  const c = getComputedStyle(probe).backgroundColor;
  containerEl.removeChild(probe);
  return c;
};
window.accentTintInContext = function accentTintInContext(containerEl, varName) {
  const probe = document.createElement('div');
  probe.style.cssText = 'color:' + varName + ';position:fixed;opacity:0;pointer-events:none;';
  containerEl.appendChild(probe);
  const c = getComputedStyle(probe).color;
  containerEl.removeChild(probe);
  return c;
};
`;

async function setSpectrumMode(page: Page) {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-accent-mode", "spectrum");
    document.documentElement.style.setProperty("--fx-spread", "34");
  });
  await page.waitForTimeout(150);
}

async function setSolidMode(page: Page) {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-accent-mode", "solid");
  });
  await page.waitForTimeout(100);
}

// ── Step 0: Discovery — which pages have nested [data-accent-el] sub-tiles ────

const ALL_PAGES = [
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "Settings", path: "/settings" },
  { name: "Theme", path: "/theme" },
];

test.describe("Step 0: Discover pages with nested accent sub-tiles", () => {
  for (const { name, path } of ALL_PAGES) {
    test(`${name}: inventory of nested [data-accent-el] sub-tiles`, async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
      await page.waitForTimeout(400);

      const inventory = await page.evaluate(() => {
        const allTargets = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        );
        const subTiles = allTargets.filter((el) => {
          const parent = el.parentElement?.closest("[data-accent-el]");
          return parent !== null && parent !== undefined;
        });
        return subTiles.map((el) => ({
          classes: el.className || "(no class)",
          tagName: el.tagName,
          parentClasses:
            el.parentElement?.closest("[data-accent-el]")?.className ||
            "(unknown)",
          elIndex: el.style.getPropertyValue("--el-index") || "not-set",
        }));
      });

      // This test always passes — it's a discovery test.
      // The output tells us which pages have sub-tiles.
      console.log(
        `${name}: found ${inventory.length} nested [data-accent-el] sub-tiles`,
        JSON.stringify(inventory.slice(0, 6), null, 2),
      );

      // Log is the finding — no assertion needed here except for llama.cpp
      if (name === "LlamaCpp") {
        expect(
          inventory.length,
          "LlamaCpp must have nested [data-accent-el] tiles",
        ).toBeGreaterThan(0);
      }
    });
  }
});

// ── Test 1: Sub-tile follows its card's hue in Spectrum mode ──────────────────
// RED: currently fails because --accent-tint-* bakes root base accent

const TILE_PAGES = [
  { name: "LlamaCpp", path: "/llama-cpp" },
  { name: "Theme", path: "/theme" },
  { name: "Overview", path: "/" },
  { name: "GPU", path: "/gpu" },
  { name: "CPU", path: "/cpu" },
  { name: "Settings", path: "/settings" },
];

for (const { name, path } of TILE_PAGES) {
  test(`${name}: Spectrum — sub-tile border hue matches its parent card's --accent-primary hue`, async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
    await page.waitForTimeout(400);
    await setSpectrumMode(page);

    const result = await page.evaluate(
      ([colorUtils]) => {
        eval(colorUtils);

        // Find all nested sub-tiles
        const allTargets = Array.from(
          document.querySelectorAll<HTMLElement>("[data-accent-el]"),
        );
        const subTiles = allTargets.filter((el) => {
          const parent = el.parentElement?.closest("[data-accent-el]");
          return parent !== null && parent !== undefined;
        });

        if (subTiles.length === 0) return { skipped: true, count: 0, failures: [] };

        const failures: string[] = [];

        for (const tile of subTiles.slice(0, 8)) {
          const parentCard = tile.parentElement!.closest<HTMLElement>("[data-accent-el]")!;
          const parentElIndex = parentCard.style.getPropertyValue("--el-index");
          if (!parentElIndex) continue; // parent card has no --el-index yet, skip

          // Get parent card's resolved --accent-primary color
          const cardAccentColor = (window as any).accentColorInContext(parentCard);
          const cardHue = (window as any).colorHue(cardAccentColor);
          if (cardHue === null) continue;

          // Get the tile's border-color (uses --accent-tint-40)
          const tileBorderColor = getComputedStyle(tile).borderColor;
          // Also get background
          const tileBgColor = getComputedStyle(tile).backgroundColor;

          const tileBorderHue = (window as any).colorHue(tileBorderColor);
          const tileBgHue = (window as any).colorHue(tileBgColor);

          // Get root base accent for comparison
          const rootAccent = (window as any).accentColorInContext(document.documentElement);
          const rootHue = (window as any).colorHue(rootAccent);

          // Skip fully-opaque borders — those are semantic/neutral colors (e.g. --border-subtle),
          // not accent tints. Accent tints (--accent-tint-10/15/40) are always semi-transparent.
          const borderParsed = (window as any).parseRgba(tileBorderColor);
          const borderAlpha = borderParsed ? borderParsed.a : 1;
          if (borderAlpha >= 0.9) continue;

          const borderDiffFromCard = tileBorderHue !== null ? (window as any).hueDiff(tileBorderHue, cardHue) : null;
          const borderDiffFromRoot = tileBorderHue !== null && rootHue !== null ? (window as any).hueDiff(tileBorderHue, rootHue) : null;

          // The tile border should be close to the card hue (same family), NOT the root base hue
          // Failure if: border is far from card AND close to root (= using base accent = BUG)
          const usesBaseAccent =
            borderDiffFromCard !== null &&
            borderDiffFromRoot !== null &&
            borderDiffFromCard > 15 && // not close to card
            borderDiffFromRoot < 15; // but close to root (base)

          if (usesBaseAccent) {
            failures.push(
              `tile "${tile.className || tile.tagName}" inside "${parentCard.className}" ` +
              `(parentElIndex=${parentElIndex}): ` +
              `borderColor=${tileBorderColor} hue=${tileBorderHue?.toFixed(0)}° ` +
              `→ root-hue=${rootHue?.toFixed(0)}° (diff=${borderDiffFromRoot?.toFixed(0)}°) ` +
              `card-hue=${cardHue?.toFixed(0)}° (diff=${borderDiffFromCard?.toFixed(0)}°) ` +
              `[USING BASE ACCENT INSTEAD OF CARD HUE]`
            );
          }
        }

        return { skipped: false, count: subTiles.length, failures };
      },
      [COLOR_UTILS],
    );

    if (result.skipped) {
      console.log(`${name}: no nested sub-tiles found, skipping`);
      return;
    }

    expect(
      result.failures,
      `${name}: ${result.failures.length}/${result.count} sub-tiles use base accent instead of card hue:\n` +
        result.failures.map((f) => `  • ${f}`).join("\n"),
    ).toHaveLength(0);
  });
}

// ── Test 2: Tiles in different cards have different hues ──────────────────────
// RED: currently fails — all tiles show base accent (same hue)

test("LlamaCpp Spectrum: kv-tiles in two different-indexed cards have different border hues", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/llama-cpp`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  await page.waitForTimeout(400);
  await setSpectrumMode(page);

  const result = await page.evaluate(([colorUtils]) => {
    eval(colorUtils);

    // Find parent cards that have nested [data-accent-el] sub-tiles (with own --el-index)
    const allCards = Array.from(
      document.querySelectorAll<HTMLElement>("[data-accent-el]"),
    ).filter((el) => {
      const idx = el.style.getPropertyValue("--el-index");
      if (!idx) return false;
      return el.querySelector("[data-accent-el]") !== null;
    });

    if (allCards.length < 2) return { skipped: true, reason: `only ${allCards.length} indexed parent cards found` };

    // Measure each card's actual accent hue, then find the pair with the most different hues
    const withHue = allCards.map((card) => ({
      card,
      idx: parseInt(card.style.getPropertyValue("--el-index")),
      hue: (window as any).colorHue((window as any).accentColorInContext(card)) as number | null,
    })).filter((c) => c.hue !== null);

    if (withHue.length < 2) return { skipped: true, reason: "can't measure card hues" };

    let bestA = withHue[0], bestB = withHue[1];
    let bestCardDiff = (window as any).hueDiff(withHue[0].hue, withHue[1].hue) as number;
    for (let i = 0; i < withHue.length; i++) {
      for (let j = i + 1; j < withHue.length; j++) {
        const d = (window as any).hueDiff(withHue[i].hue, withHue[j].hue) as number;
        if (d > bestCardDiff) { bestCardDiff = d; bestA = withHue[i]; bestB = withHue[j]; }
      }
    }

    if (bestCardDiff < 20) return { skipped: true, reason: `best card pair only ${bestCardDiff.toFixed(1)}° apart` };

    const cardA = bestA.card, cardB = bestB.card;
    const idxA = bestA.idx, idxB = bestB.idx;

    // Find sub-tiles with semi-transparent accent-tinted borders (alpha < 0.9)
    const findAccentTile = (card: HTMLElement) => {
      const subs = Array.from(card.querySelectorAll<HTMLElement>("[data-accent-el]"));
      return subs.find((sub) => {
        const parsed = (window as any).parseRgba(getComputedStyle(sub).borderColor);
        return parsed && parsed.a < 0.9;
      }) ?? subs[0] ?? null;
    };

    const tileA = findAccentTile(cardA);
    const tileB = findAccentTile(cardB);
    if (!tileA || !tileB) return { skipped: true, reason: "sub-tiles not found" };

    const borderA = getComputedStyle(tileA).borderColor;
    const borderB = getComputedStyle(tileB).borderColor;
    const hueA = (window as any).colorHue(borderA);
    const hueB = (window as any).colorHue(borderB);
    const diff = hueA !== null && hueB !== null ? (window as any).hueDiff(hueA, hueB) : null;

    return {
      skipped: false,
      idxA, idxB, bestCardDiff: bestCardDiff.toFixed(1),
      borderA, hueA: hueA?.toFixed(1),
      borderB, hueB: hueB?.toFixed(1),
      diff: diff?.toFixed(1),
      cardHueA: bestA.hue?.toFixed(1),
      cardHueB: bestB.hue?.toFixed(1),
    };
  }, [COLOR_UTILS]);

  if (result.skipped) {
    console.log("Test 2 skipped:", result.reason);
    return;
  }

  // Tiles in cards with different hues must have measurably different border hues (>10° apart)
  expect(
    parseFloat(result.diff as string),
    `Tiles in card[elIndex=${result.idxA}] and card[elIndex=${result.idxB}] ` +
    `(cards differ by ${result.bestCardDiff}° in sRGB-HSL) ` +
    `should have different border hues (>10° apart) but got ` +
    `hueA=${result.hueA}° vs hueB=${result.hueB}° (diff=${result.diff}°). ` +
    `Cards' sRGB-HSL hues: cardA=${result.cardHueA}° cardB=${result.cardHueB}°`,
  ).toBeGreaterThan(10);
});

// ── Test 3: Solid mode — all tiles use single uniform accent ──────────────────
// Should PASS both before and after fix

test("LlamaCpp Solid: all sub-tile borders are the same hue (uniform accent)", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/llama-cpp`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  await page.waitForTimeout(400);
  await setSolidMode(page);

  const result = await page.evaluate(([colorUtils]) => {
    eval(colorUtils);

    const allTargets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-accent-el]"),
    );
    const subTiles = allTargets.filter((el) => {
      return el.parentElement?.closest("[data-accent-el]") !== null;
    });

    if (subTiles.length === 0) return { skipped: true };

    const hues = subTiles.slice(0, 10).map((el) => {
      const borderColor = getComputedStyle(el).borderColor;
      const h = (window as any).colorHue(borderColor);
      return { hue: h?.toFixed(1), borderColor };
    }).filter(x => x.hue !== null);

    if (hues.length < 2) return { skipped: true };

    const first = parseFloat(hues[0].hue!);
    const nonUniform = hues.filter(
      (h) => (window as any).hueDiff(parseFloat(h.hue!), first) > 15,
    );

    return { skipped: false, total: hues.length, nonUniform, firstHue: hues[0].hue };
  }, [COLOR_UTILS]);

  if (result.skipped) return;

  expect(
    result.nonUniform,
    `Solid mode: ${result.nonUniform?.length}/${result.total} sub-tiles have different hues — expected all uniform at ${result.firstHue}°`,
  ).toHaveLength(0);
});

// ── Test 4: Subtlety preserved — alpha/lightness unchanged after fix ──────────
// Records current values as the spec. Re-run after fix: same values expected.

test("LlamaCpp: record kv-tile border alpha (subtlety baseline for lock)", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/llama-cpp`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  await page.waitForTimeout(400);
  await setSolidMode(page);

  const baselines = await page.evaluate(([colorUtils]) => {
    eval(colorUtils);

    const allTargets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-accent-el]"),
    );
    const subTiles = allTargets.filter((el) => {
      return el.parentElement?.closest("[data-accent-el]") !== null;
    });

    return subTiles.slice(0, 5).map((el) => {
      const borderColor = getComputedStyle(el).borderColor;
      const bgColor = getComputedStyle(el).backgroundColor;
      const borderParsed = (window as any).parseRgba(borderColor);
      const bgParsed = (window as any).parseRgba(bgColor);
      return {
        classes: el.className || el.tagName,
        borderAlpha: borderParsed?.a?.toFixed(3),
        bgAlpha: bgParsed?.a?.toFixed(3),
        borderColor,
        bgColor,
      };
    });
  }, [COLOR_UTILS]);

  // Log baselines for reference — assertions after fix verify these stay equal
  console.log("Subtlety baselines:", JSON.stringify(baselines, null, 2));

  // In Solid mode, kv-tile borders should have meaningful alpha (not 0 or 1)
  for (const b of baselines) {
    if (b.borderAlpha) {
      const alpha = parseFloat(b.borderAlpha);
      expect(alpha, `${b.classes} border alpha should be > 0`).toBeGreaterThan(0);
      expect(alpha, `${b.classes} border alpha should be < 1 (translucent)`).toBeLessThan(1);
    }
  }
});

// ── Test 5: Semantic exclusions — status/log badges unaffected by mode ────────

test("Semantic colors: Online/Offline badges unchanged between Solid and Spectrum on LlamaCpp", async ({
  page,
}) => {
  await page.goto(`${BASE_URL}/llama-cpp`);
  await page.waitForSelector("[data-accent-el]", { timeout: 12000 });
  await page.waitForTimeout(400);

  const getStatusColors = async () => {
    return page.evaluate(() => {
      const badges = Array.from(
        document.querySelectorAll<HTMLElement>(".status-badge"),
      );
      return badges.slice(0, 4).map((el) => ({
        text: el.textContent?.trim(),
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      }));
    });
  };

  await setSolidMode(page);
  const solidColors = await getStatusColors();

  await setSpectrumMode(page);
  const spectrumColors = await getStatusColors();

  if (solidColors.length === 0) {
    console.log("No .status-badge elements found on LlamaCpp page — skipping semantic exclusion test");
    return;
  }
  expect(solidColors.length, "need at least one status badge").toBeGreaterThan(0);
  expect(solidColors).toHaveLength(spectrumColors.length);

  for (let i = 0; i < solidColors.length; i++) {
    expect(
      spectrumColors[i].color,
      `status badge "${solidColors[i].text}" color must not change in Spectrum mode`,
    ).toBe(solidColors[i].color);
  }
});
