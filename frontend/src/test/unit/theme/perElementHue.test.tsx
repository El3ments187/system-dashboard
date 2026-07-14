/**
 * Guard test: per-element hue wiring must never silently regress.
 *
 * Phase 1 guard — indexer assigns a distinct --el-index to EVERY [data-accent-el],
 * including elements nested inside other accent elements. Only an explicit
 * data-accent-el="inherit" is allowed to opt out.
 *
 * Phase 2 guard — RunModelsSection Plan B wiring: each .run-models-row must carry
 * its own --el-index, and the scroll container must carry --accent-count.
 *
 * This test FAILS against the pre-fix tree (where nestedInAccent collapsed tiles
 * to their card's hue, or Plan B wiring was absent).
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, render, waitFor } from "@testing-library/react";
import { useAccentIndexer } from "../../../utils/accentColors";
import { RunModelsSection } from "../../../pages/LlamaCppPage";
import type { ProfileResponse } from "../../../types/metrics";

function mockFetch(resp: { data: ProfileResponse }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => resp,
  });
}

function profilesResp(n: number): { data: ProfileResponse } {
  return {
    data: {
      profiles: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `Model ${i}`,
        script_path: `/scripts/model${i}.sh`,
        parsed_args: {
          model_path: `/models/model${i}.gguf`,
          context_size: 4096,
          port: 8080,
        },
        filename_meta: null,
      })),
      states: {},
      metadata: {},
      scan_dir: "/models",
    },
  };
}

describe("per-element hue indexing guard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // ── Phase 1: indexer assigns indices to ALL accent elements ────────────

  describe("indexer — every [data-accent-el] gets a distinct --el-index", () => {
    it("card with nested tiles + sibling card → indices 0,1,2,3 and --accent-count=4", () => {
      const card1 = document.createElement("div");
      card1.setAttribute("data-accent-el", "");
      const t1 = document.createElement("div");
      t1.setAttribute("data-accent-el", "");
      const t2 = document.createElement("div");
      t2.setAttribute("data-accent-el", "");
      card1.append(t1, t2);

      const card2 = document.createElement("div");
      card2.setAttribute("data-accent-el", "");
      const t3 = document.createElement("div");
      t3.setAttribute("data-accent-el", "");
      card2.append(t3);

      document.body.append(card1, card2);

      renderHook(() => useAccentIndexer());

      const all = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      const indices = [...all].map((el) =>
        el.style.getPropertyValue("--el-index"),
      );

      expect(indices).toHaveLength(5);
      expect(new Set(indices).size).toBe(5); // all distinct
      expect(indices.map(Number).sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4,
      ]);
      expect(
        document.documentElement.style.getPropertyValue("--accent-count"),
      ).toBe("5");
    });

    it("explicit data-accent-el='inherit' is the only opt-out — nested plain elements still get indices", () => {
      const card = document.createElement("div");
      card.setAttribute("data-accent-el", "");

      const inheritEl = document.createElement("div");
      inheritEl.setAttribute("data-accent-el", "inherit");
      card.append(inheritEl);

      const tile = document.createElement("div");
      tile.setAttribute("data-accent-el", "");
      card.append(tile);

      document.body.append(card);

      renderHook(() => useAccentIndexer());

      expect(card.style.getPropertyValue("--el-index")).toBe("0");
      expect(inheritEl.style.getPropertyValue("--el-index")).toBe(""); // skipped
      expect(tile.style.getPropertyValue("--el-index")).toBe("1");
      expect(
        document.documentElement.style.getPropertyValue("--accent-count"),
      ).toBe("2");
    });

    it("deeply nested tiles all get distinct indices", () => {
      // Mimics metric tiles inside panel cards inside the page root
      const root = document.createElement("div");
      root.setAttribute("data-accent-el", "");
      document.body.append(root);

      const NUM_TILES = 8;
      for (let i = 0; i < NUM_TILES; i++) {
        const tile = document.createElement("div");
        tile.setAttribute("data-accent-el", "");
        root.append(tile);
      }

      renderHook(() => useAccentIndexer());

      const all = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      const indices = [...all].map((el) =>
        el.style.getPropertyValue("--el-index"),
      );

      expect(new Set(indices).size).toBe(NUM_TILES + 1); // root + tiles all distinct
      expect(
        document.documentElement.style.getPropertyValue("--accent-count"),
      ).toBe(String(NUM_TILES + 1));
    });
  });

  // ── Phase 2: RunModelsSection Plan B wiring ────────────────────────────

  describe("RunModelsSection Plan B wiring", () => {
    it("each .run-models-row carries --el-index and the container carries --accent-count", async () => {
      const N = 4;
      vi.stubGlobal("fetch", mockFetch(profilesResp(N)));

      render(<RunModelsSection />);

      await waitFor(() => {
        const rows = document.querySelectorAll(".run-models-row");
        expect(rows).toHaveLength(N);
      });

      const rows = document.querySelectorAll<HTMLElement>(".run-models-row");
      rows.forEach((row, i) => {
        expect(row.style.getPropertyValue("--el-index")).toBe(String(i));
      });

      // The scroll container (direct parent of rows) must carry --accent-count
      const scrollEl = rows[0].parentElement as HTMLElement;
      expect(scrollEl.style.getPropertyValue("--accent-count")).toBe(String(N));
    });

    it("--accent-count updates when profile count changes via re-render", async () => {
      const N = 2;
      vi.stubGlobal("fetch", mockFetch(profilesResp(N)));

      render(<RunModelsSection />);

      await waitFor(() => {
        expect(document.querySelectorAll(".run-models-row")).toHaveLength(N);
      });

      const scrollEl = document.querySelectorAll<HTMLElement>(
        ".run-models-row",
      )[0].parentElement as HTMLElement;
      expect(scrollEl.style.getPropertyValue("--accent-count")).toBe(String(N));
    });
  });
});

// ── Phase 3: Spread-wiring guard (CSS file assertions) ────────────────────────
// These tests fail loudly if the --el-off step is reverted to 360/count or if
// --fx-spread gets disconnected from per-element spacing again.

import { readFileSync } from "fs";
import { resolve } from "path";

const variablesCss = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf8",
);

describe("spread-wiring guard — variables.css", () => {
  it("every --el-off declaration uses var(--fx-spread) for the step", () => {
    const elOffLines = variablesCss
      .split("\n")
      .filter((l) => l.includes("--el-off: calc("));
    expect(elOffLines.length).toBeGreaterThanOrEqual(3);
    elOffLines.forEach((line) => {
      expect(line).toContain("var(--fx-spread");
    });
  });

  it("no --el-off declaration uses the disconnected 360/count formula", () => {
    const disconnectedLines = variablesCss
      .split("\n")
      .filter(
        (l) =>
          l.includes("--el-off: calc(") &&
          l.includes("360 / var(--accent-count"),
      );
    expect(disconnectedLines).toHaveLength(0);
  });

  it("--fx-spread is wired into --el-off, not only into --sheen-band", () => {
    const elOffWithSpread = variablesCss
      .split("\n")
      .filter(
        (l) => l.includes("--el-off: calc(") && l.includes("var(--fx-spread"),
      );
    expect(elOffWithSpread.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Phase 4: Runtime card KvRow own-hue guard ──────────────────────────────────
// Fails if KvRow is ever set back to data-accent-el="inherit" (all 13 runtime
// tiles would share the card's single index instead of getting their own).

const llamaCppSrc = readFileSync(
  resolve(__dirname, "../../../pages/LlamaCppPage.tsx"),
  "utf8",
);

describe("Runtime card KvRow — own-hue guard", () => {
  it('KvRow root uses data-accent-el="" not inherit', () => {
    expect(llamaCppSrc).toMatch(/function KvRow[\s\S]{0,400}data-accent-el=""/);
    expect(llamaCppSrc).not.toMatch(
      /function KvRow[\s\S]{0,400}data-accent-el="inherit"/,
    );
  });

  it("13 runtime tiles each get a distinct --el-index", () => {
    document.body.innerHTML = "";

    const card = document.createElement("div");
    card.setAttribute("data-accent-el", "");
    document.body.append(card);

    const RUNTIME_IDS = [
      "runtime-server",
      "runtime-uptime",
      "runtime-load-time",
      "runtime-pid",
      "runtime-port",
      "runtime-memory",
      "runtime-cpu",
      "runtime-context",
      "runtime-gpu-layers",
      "runtime-cpu-layers",
      "runtime-draft-layers",
      "runtime-speculative",
      "runtime-tokens-cached",
    ];

    for (const id of RUNTIME_IDS) {
      const row = document.createElement("div");
      row.setAttribute("data-accent-el", "");
      const inner = document.createElement("div");
      inner.setAttribute("data-testid", id);
      row.append(inner);
      card.append(row);
    }

    renderHook(() => useAccentIndexer());

    const roots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="runtime-"]'),
    ).map((el) => el.closest<HTMLElement>("[data-accent-el]"));

    expect(roots).toHaveLength(13);
    roots.forEach((root) => {
      expect(root).not.toBeNull();
      expect(root!.getAttribute("data-accent-el")).toBe("");
    });

    const idx = roots.map((r) => r!.style.getPropertyValue("--el-index"));
    expect(new Set(idx).size).toBe(13);

    document.body.innerHTML = "";
  });
});
