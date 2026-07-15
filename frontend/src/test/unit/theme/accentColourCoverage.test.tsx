/**
 * Guard: accent colour coverage must not regress after Phase 1 tagging.
 *
 * Source-floor checks: each modified file must retain a minimum number of
 * own-hue data-accent-el="" tags. Fails if someone silently strips them.
 *
 * DOM-distinctness checks: useAccentIndexer assigns unique --el-index to
 * every own-hue element and skips inherit opt-outs.
 *
 * Targeted checks: previously-flat spots (service card buttons, settings
 * icon badges, LogConsole toolbar opt-out, ChartFrame inherit choice).
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAccentIndexer } from "../../../utils/accentColors";

const SRC = path.resolve(__dirname, "../../..");

function ownTagCount(relPath: string): number {
  const text = fs.readFileSync(path.join(SRC, relPath), "utf8");
  return (text.match(/data-accent-el=""/g) ?? []).length;
}

function inheritTagCount(relPath: string): number {
  const text = fs.readFileSync(path.join(SRC, relPath), "utf8");
  return (text.match(/data-accent-el="inherit"/g) ?? []).length;
}

// ─── Source floor checks ───────────────────────────────────────────────────────

describe("Accent colour coverage — source floor", () => {
  it("RunModelsSection: refresh button tagged (≥1 own-hue)", () => {
    expect(
      ownTagCount("pages/llamacpp/RunModelsSection.tsx"),
    ).toBeGreaterThanOrEqual(1);
  });

  it("OpenWebUICard: Open+Run buttons tagged (≥2 own-hue)", () => {
    expect(
      ownTagCount("components/cards/OpenWebUICard.tsx"),
    ).toBeGreaterThanOrEqual(2);
  });

  it("ComfyUICard: Open+Run buttons tagged (≥2 own-hue)", () => {
    expect(
      ownTagCount("components/cards/ComfyUICard.tsx"),
    ).toBeGreaterThanOrEqual(2);
  });

  it("OpenCodeCard: Open button tagged (≥1 own-hue)", () => {
    expect(
      ownTagCount("components/cards/OpenCodeCard.tsx"),
    ).toBeGreaterThanOrEqual(1);
  });

  it("DirectoryBrowserModal: Select button tagged (≥1 own-hue)", () => {
    expect(
      ownTagCount("components/DirectoryBrowserModal.tsx"),
    ).toBeGreaterThanOrEqual(1);
  });

  it("EditUpdateScriptModal: Save button tagged (≥1 own-hue)", () => {
    expect(
      ownTagCount("components/EditUpdateScriptModal.tsx"),
    ).toBeGreaterThanOrEqual(1);
  });

  it("SettingsPage: icon badges + accent buttons tagged (≥9 own-hue)", () => {
    expect(ownTagCount("pages/SettingsPage.tsx")).toBeGreaterThanOrEqual(9);
  });

  it("LlamaCppPage: banners + action buttons + containers tagged (≥10 own-hue)", () => {
    expect(ownTagCount("pages/LlamaCppPage.tsx")).toBeGreaterThanOrEqual(10);
  });

  it("LogConsole controls have own hue — no inherit opt-outs remain", () => {
    expect(inheritTagCount("components/LogConsole.tsx")).toBe(0);
  });

  it("ChartFrame uses inherit so charts echo their containing card's hue", () => {
    const text = fs.readFileSync(
      path.join(SRC, "components/shared/CardComponents.tsx"),
      "utf8",
    );
    expect(text).toMatch(/ChartFrame[\s\S]{0,400}data-accent-el="inherit"/);
  });
});

// ─── DOM-distinctness checks ───────────────────────────────────────────────────

describe("Accent colour coverage — DOM distinctness", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("tagged service-card elements each get a unique --el-index", () => {
    document.body.innerHTML = `
      <div data-accent-el="">
        <a data-accent-el="">Open WebUI</a>
        <button data-accent-el="">Run</button>
      </div>
    `;
    renderHook(() => useAccentIndexer());

    const own = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-accent-el]:not([data-accent-el="inherit"])',
      ),
    );
    expect(own).toHaveLength(3);
    const indices = own.map((el) => el.style.getPropertyValue("--el-index"));
    expect(new Set(indices).size).toBe(3);
  });

  it("inherit-tagged elements (KvRow, toolbar) are skipped by useAccentIndexer", () => {
    document.body.innerHTML = `
      <div data-accent-el="">
        <div data-accent-el="inherit">KvRow 1</div>
        <div data-accent-el="inherit">KvRow 2</div>
        <button data-accent-el="">AccentButton</button>
      </div>
    `;
    renderHook(() => useAccentIndexer());

    const inherit = Array.from(
      document.querySelectorAll<HTMLElement>('[data-accent-el="inherit"]'),
    );
    for (const el of inherit) {
      expect(el.style.getPropertyValue("--el-index")).toBe("");
    }

    const own = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-accent-el]:not([data-accent-el="inherit"])',
      ),
    );
    expect(own).toHaveLength(2);
    const indices = own.map((el) => el.style.getPropertyValue("--el-index"));
    expect(new Set(indices).size).toBe(2);
  });

  it("settings icon badges and accent buttons across cards all get distinct indices", () => {
    document.body.innerHTML = `
      <main>
        <div data-accent-el=""><div data-accent-el="">badge1</div><button data-accent-el="">Save 1</button></div>
        <div data-accent-el=""><div data-accent-el="">badge2</div><button data-accent-el="">Save 2</button></div>
        <div data-accent-el=""><div data-accent-el="">badge3</div><button data-accent-el="">Save 3</button></div>
      </main>
    `;
    renderHook(() => useAccentIndexer());

    const own = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-accent-el]:not([data-accent-el="inherit"])',
      ),
    );
    expect(own).toHaveLength(9);
    const indices = own.map((el) => el.style.getPropertyValue("--el-index"));
    expect(new Set(indices).size).toBe(9);
  });

  it("modal accent buttons get own-hue indices (not flat)", () => {
    document.body.innerHTML = `
      <div>
        <button data-accent-el="">Select Directory</button>
        <button data-accent-el="">Save Script</button>
      </div>
    `;
    renderHook(() => useAccentIndexer());

    const own = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-accent-el]:not([data-accent-el="inherit"])',
      ),
    );
    expect(own).toHaveLength(2);
    const i0 = own[0].style.getPropertyValue("--el-index");
    const i1 = own[1].style.getPropertyValue("--el-index");
    expect(i0).not.toBe(i1);
  });
});
