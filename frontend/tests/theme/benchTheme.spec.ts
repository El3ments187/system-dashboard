/**
 * Bench page — theme participation, verified as COMPUTED STYLE in a real
 * browser. jsdom cannot compute cascades or pseudo-elements, so none of this
 * is assertable in vitest.
 *
 * The absence tests matter as much as the presence ones: an effect that is
 * always on is indistinguishable from a broken toggle.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

async function gotoBench(page: Page) {
  await page.goto(`${BASE_URL}/bench`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-testid="bench-task-avg"]', {
    timeout: 15000,
  });
}

async function setGlow(page: Page, on: boolean) {
  await page.evaluate((enabled) => {
    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-glow", "neon");
      root.setAttribute("data-card-glow", "on");
    } else {
      root.removeAttribute("data-glow");
      root.removeAttribute("data-card-glow");
    }
  }, on);
  await page.waitForTimeout(150);
}

// ── T29 — Neon Glow, both states ────────────────────────────────────────────

test.describe("T29 bench card glow target responds to the Neon Glow toggle", () => {
  test("ON: the bench card's .accent-glow-target ::after paints a shadow", async ({
    page,
  }) => {
    await gotoBench(page);
    await setGlow(page, true);

    const shadow = await page.evaluate(() => {
      const el = document
        .querySelector('[data-testid="bench-task-avg"]')
        ?.closest("[data-accent-el]")
        ?.parentElement?.closest(".metric-card, div")
        ?.querySelector(".accent-glow-target");
      const target = el ?? document.querySelector(".accent-glow-target");
      if (!target) return "NO_TARGET";
      return getComputedStyle(target, "::after").boxShadow;
    });

    expect(shadow).not.toBe("NO_TARGET");
    expect(shadow).not.toBe("none");
    expect(shadow).not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\)/);
  });

  test("OFF: the same target paints no shadow — the absence test", async ({
    page,
  }) => {
    await gotoBench(page);
    await setGlow(page, false);

    const shadow = await page.evaluate(() => {
      const target = document.querySelector(".accent-glow-target");
      if (!target) return "NO_TARGET";
      return getComputedStyle(target, "::after").boxShadow;
    });

    expect(shadow).not.toBe("NO_TARGET");
    const isOff =
      shadow === "none" || /rgba\(0,\s*0,\s*0,\s*0\)/.test(shadow as string);
    expect(
      isOff,
      `glow must be absent with the toggle off, got: ${shadow}`,
    ).toBe(true);
  });
});

// ── T33 — the spine must win the stacking contest against a sticky header ───

test("T33 the accent spine is not painted over by the sticky table header", async ({
  page,
}) => {
  await gotoBench(page);
  await page.waitForSelector("table thead th", { timeout: 10000 });

  const probe = await page.evaluate(() => {
    const th = document.querySelector("table thead th");
    if (!th) return { error: "no sticky thead" } as const;
    const card = th.closest("[data-accent-el]");
    if (!card) return { error: "no card ancestor" } as const;
    const spine = card.querySelector(".card-accent-spine");
    if (!spine) return { error: "no spine" } as const;
    const cr = card.getBoundingClientRect();
    const tr = th.getBoundingClientRect();
    // One pixel inside the card's left edge, at the sticky band's midline —
    // exactly where the 3px spine should be painting.
    const hit = document.elementFromPoint(cr.left + 1, tr.top + tr.height / 2);
    return {
      hitIsSpine: hit === spine || spine.contains(hit as Node),
      hitTag: (hit as HTMLElement | null)?.tagName ?? "NONE",
    };
  });

  expect("error" in probe ? probe.error : "").toBe("");
  expect(
    (probe as { hitIsSpine: boolean }).hitIsSpine,
    `the sticky header is painting over the spine (hit ${(probe as { hitTag: string }).hitTag})`,
  ).toBe(true);
});

// ── T42 — content must stop at the footer ──────────────────────────────────

test("T42 cards stop at the footer instead of running past the bottom", async ({
  page,
}) => {
  // Deliberately short: a tall viewport hides this bug entirely.
  await page.setViewportSize({ width: 1280, height: 620 });
  await gotoBench(page);
  await page.waitForTimeout(600);

  const probe = await page.evaluate(() => {
    const footer = document.querySelector('[data-testid="bench-footer"]');
    const table = document.querySelector("table");
    const card = table?.closest("[data-accent-el]") ?? null;
    if (!footer || !card) return { error: "missing footer or card" } as const;
    const f = footer.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return {
      footerTop: Math.round(f.top),
      footerBottom: Math.round(f.bottom),
      cardBottom: Math.round(c.bottom),
      inner: window.innerHeight,
      pageScrolls:
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight + 2,
    };
  });

  expect("error" in probe ? probe.error : "").toBe("");
  const p = probe as Exclude<typeof probe, { error: string }>;

  // The footer is the floor: it must be on screen...
  expect(
    p.footerBottom,
    `the footer is below the viewport (${p.footerBottom} > ${p.inner})`,
  ).toBeLessThanOrEqual(p.inner + 2);
  // ...and the tallest card must not spill past it.
  expect(
    p.cardBottom,
    `Tasks & Runs runs past the footer (card bottom ${p.cardBottom} > footer top ${p.footerTop}) — the flex min-height:0 chain is broken`,
  ).toBeLessThanOrEqual(p.footerTop + 2);
  expect(p.pageScrolls, "the outer page must not scroll").toBe(false);
});

// ── T30 — Spectrum Per-Element ──────────────────────────────────────────────

test("T30 two bench cards resolve DIFFERENT --accent-primary under Spectrum Per-Element", async ({
  page,
}) => {
  await gotoBench(page);
  // Per-element hue is `[data-accent-mode="spectrum"] [style*="--el-index"]`:
  // the mode on <html>, and an inline --el-index that useAccentIndexer
  // assigns to every [data-accent-el]. Both halves have to be present.
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-accent-mode", "spectrum");
  });
  await page.waitForTimeout(400);

  const probe = await page.evaluate(() => {
    const indexed = Array.from(
      document.querySelectorAll<HTMLElement>("[data-accent-el]"),
    ).filter((el) => el.style.getPropertyValue("--el-index") !== "");
    return {
      indexedCount: indexed.length,
      elIndexes: indexed
        .slice(0, 8)
        .map((el) => el.style.getPropertyValue("--el-index")),
      hues: indexed
        .slice(0, 8)
        .map((el) =>
          getComputedStyle(el).getPropertyValue("--accent-primary").trim(),
        )
        .filter(Boolean),
    };
  });

  expect(
    probe.indexedCount,
    "useAccentIndexer must assign --el-index to bench cards",
  ).toBeGreaterThanOrEqual(2);
  expect(new Set(probe.elIndexes).size).toBeGreaterThan(1);
  expect(
    new Set(probe.hues).size,
    `per-element mode must give cards their own hue; el-indexes=${JSON.stringify(probe.elIndexes)} hues=${JSON.stringify(probe.hues)}`,
  ).toBeGreaterThan(1);
});

// ── T31 — semantic colours are not accent colours ───────────────────────────

test("T31 a verdict keeps its semantic colour across an accent change", async ({
  page,
}) => {
  await gotoBench(page);

  // A strip cell is a verdict: it must read the same whatever the accent is.
  // Deliberately NOT pinned to one status — which verdicts exist depends on
  // whichever run is newest in the checkout, and a test that silently needs
  // a "miss" to be present passes for the wrong reason the day there isn't
  // one. Any verdict cell proves the rule.
  const VERDICTS = ["miss", "timeout", "solved", "solved-late"];
  await page.waitForFunction(
    (states) =>
      states.some((s) => document.querySelector(`[data-cell-state="${s}"]`)),
    VERDICTS,
    { timeout: 15000 },
  );

  const read = () =>
    page.evaluate((states) => {
      for (const state of states) {
        const cell = document.querySelector(`[data-cell-state="${state}"]`);
        if (!cell) continue;
        const s = getComputedStyle(cell);
        return { state, border: s.borderTopColor, bg: s.backgroundColor };
      }
      return null;
    }, VERDICTS);

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-accent-mode", "solid");
    document.documentElement.style.setProperty("--accent-primary", "#38bdf8");
  });
  await page.waitForTimeout(150);
  const before = await read();

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--accent-primary", "#f472b6");
    document.documentElement.setAttribute("data-accent-mode", "rainbow");
  });
  await page.waitForTimeout(250);
  const after = await read();

  expect(
    before,
    "expected at least one verdict cell on the page",
  ).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.state, "the same verdict must be sampled twice").toBe(
    before!.state,
  );
  expect(after!.border, "a verdict colour must not follow the accent").toBe(
    before!.border,
  );
  expect(after!.bg, "a verdict fill must not follow the accent").toBe(
    before!.bg,
  );
});

// ── T32 — reduced motion ────────────────────────────────────────────────────

test.describe("T32 prefers-reduced-motion", () => {
  test.use({ colorScheme: "dark" });

  test("zeroes the gauge glow and stops the live-cell and pulse animations", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoBench(page);
    await setGlow(page, true);

    const result = await page.evaluate(() => {
      // The live cell and heartbeat only exist during a run, so the rule is
      // exercised on elements with the same classes.
      const probe = document.createElement("div");
      probe.innerHTML =
        '<i class="bench-att live"></i>' +
        '<span class="bench-pulse"><span class="bench-dot"></span></span>';
      document.body.appendChild(probe);

      const cell = probe.querySelector(".bench-att.live") as HTMLElement;
      const dot = probe.querySelector(".bench-dot") as HTMLElement;
      const arc = document.querySelector(
        ".bench-gauge svg path:last-of-type",
      ) as SVGPathElement | null;

      const out = {
        cellAnimation: getComputedStyle(cell).animationName,
        dotAnimation: getComputedStyle(dot).animationName,
        arcFilter: arc ? getComputedStyle(arc).filter : "NO_ARC",
      };
      probe.remove();
      return out;
    });

    expect(result.cellAnimation).toBe("none");
    expect(result.dotAnimation).toBe("none");
    expect(result.arcFilter).not.toBe("NO_ARC");
    expect(
      result.arcFilter,
      "reduced motion must drop the gauge drop-shadow",
    ).toBe("none");
  });

  test("without the preference, the gauge glow paints and the cell animates", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gotoBench(page);
    await setGlow(page, true);

    const result = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.innerHTML = '<i class="bench-att live"></i>';
      document.body.appendChild(probe);
      const cell = probe.querySelector(".bench-att.live") as HTMLElement;
      const arc = document.querySelector(
        ".bench-gauge svg path:last-of-type",
      ) as SVGPathElement | null;
      const out = {
        cellAnimation: getComputedStyle(cell).animationName,
        arcFilter: arc ? getComputedStyle(arc).filter : "NO_ARC",
      };
      probe.remove();
      return out;
    });

    expect(result.cellAnimation).toBe("bench-livecell");
    expect(result.arcFilter).toContain("drop-shadow");
  });
});

// ── T53 — the toolbar has no spacer between the title and the path chip ─────
//
// CardHeader(compact) lays its children out with space-between, so anything
// handed to `right` is pushed to the far edge. The design's toolbar is one
// flex row with margin-left:auto on the SEARCH alone. A layout assertion, not
// a snapshot, so a reintroduced spacer fails loudly rather than silently
// rebaselining.
test("T53 the runs-path chip sits beside the title, not at the far right", async ({
  page,
}) => {
  // The gap only opens when the card is wide enough to have slack — at a
  // narrow viewport the toolbar's own contents fill the row and hide it.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoBench(page);

  const gap = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="bench-runs-path"]');
    if (!chip) return null;
    const card = chip.closest('[data-testid="bench-tasks-card"], .card, div');
    const header = chip.parentElement?.parentElement;
    const title = header?.querySelector("div");
    if (!title) return null;
    const t = title.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    return {
      gap: Math.round(c.left - t.right),
      cardWidth: Math.round(
        (card as HTMLElement).getBoundingClientRect().width,
      ),
    };
  });

  expect(
    gap,
    "the path chip should be findable next to the title",
  ).not.toBeNull();
  // A small fixed gap (the toolbar's own gap:8 plus the header's padding),
  // not a large auto-computed one. 60px is generous for the fixed case and
  // far below what space-between produced.
  expect(
    gap!.gap,
    `path chip is ${gap!.gap}px from the title — a spacer has crept back in`,
  ).toBeLessThan(60);
});

// ── T62 — the refusal's link actually goes there ────────────────────────────
//
// "Start a model on the llama.cpp page" was instructional prose naming a
// page. Asserting the text exists would pass for prose too, so this asserts
// the navigation.
test("T62 the readiness banner's llama.cpp link navigates", async ({
  page,
}) => {
  await gotoBench(page);

  const link = page.locator('[data-testid="bench-llamacpp-link"]');
  if ((await link.count()) === 0) {
    // A server IS answering, so the banner is correctly absent. Assert that
    // rather than skipping silently.
    await expect(
      page.locator('[data-testid="bench-start-blocked"]'),
    ).toHaveCount(0);
    return;
  }

  await link.click();
  await page.waitForURL(/\/llama-cpp$/, { timeout: 5000 });
  expect(new URL(page.url()).pathname).toBe("/llama-cpp");
});

// ── T89 — trailing tab content is reachable, not clipped ────────────────────
//
// The obvious assertion here is a false green: scrollTop works on an
// overflow:hidden element, so "scroll to the bottom, then check the rect"
// PASSES against a clipping container. Verified by injecting
// overflow:hidden — the naive form stayed green, the form below went red.
// Reachability therefore requires a *user*-scrollable ancestor whenever the
// content overflows.
async function trailingContentReachable(page: Page, tab: RegExp) {
  await page.getByRole("button", { name: tab }).click();
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const panes = [...document.querySelectorAll("div")].filter((d) =>
      /(auto|scroll)/.test(getComputedStyle(d).overflowY),
    );
    const pane = panes.sort(
      (a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth,
    )[0];
    if (!pane) return { found: false, pass: false, tail: null };
    const last = pane.lastElementChild as HTMLElement | null;
    if (!last) return { found: false, pass: false, tail: null };

    const needsScroll = pane.scrollHeight > pane.clientHeight + 1;
    const userScrollable = /(auto|scroll)/.test(
      getComputedStyle(pane).overflowY,
    );
    pane.scrollTop = pane.scrollHeight;
    const lr = last.getBoundingClientRect();
    const pr = pane.getBoundingClientRect();
    const inView =
      lr.bottom <= pr.bottom + 2 && lr.bottom <= window.innerHeight;
    return {
      found: true,
      pass: inView && (!needsScroll || userScrollable),
      tail: (last.textContent || "").trim().slice(-40),
    };
  });
}

test("T89 no tab clips its trailing content at the card's bottom edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoBench(page);

  for (const tab of [
    /^This run/,
    /^History/,
    /^Compare/,
    /^Leads/,
    /^Console/,
  ]) {
    const r = await trailingContentReachable(page, tab);
    expect(r.found, `${tab} has no scroll pane to check`).toBe(true);
    expect(
      r.pass,
      `${tab}: trailing content is not reachable (tail: ${r.tail})`,
    ).toBe(true);
  }
});

test("T89 the Compare footnote's final words are readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoBench(page);
  await page.getByRole("button", { name: /^Compare/ }).click();

  // The clipped half is the useful half — assert the sentence that tells the
  // reader how to avoid needing Compare at all, not merely that a <p> exists.
  const foot = page.getByText(/^Sorted by/);
  await expect(foot).toContainText(
    "several models in ONE run (-m repeated) shares edition, sweep and server session by construction.",
  );
  await foot.scrollIntoViewIfNeeded();
  await expect(foot).toBeInViewport();
});
