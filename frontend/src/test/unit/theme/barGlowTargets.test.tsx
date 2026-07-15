/**
 * Guard: CpuPage and GpuPage hand-rolled accent bars must carry
 * accent-glow-target + both bright children when color === accent,
 * and neither when color !== accent (semantic threshold colours).
 *
 * Uses source-level assertions because CpuVerticalProgress /
 * GpuVerticalProgress are unexported internal components. This matches
 * the pattern in accentColourCoverage.test.tsx.
 *
 * Regression: commit 8e4baf6 ("one spine") removed accent-glow-target
 * from these bars. Tests A.1 below would have FAILED on that tree
 * (className was "accent-fill" only); they PASS on the restored tree.
 *
 * Card spine regression guards live in:
 *   src/test/unit/shared/glowTargets.test.tsx (A.3 from the spec)
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

function readPage(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

// ── A.1 / A.2: CpuPage ────────────────────────────────────────────────────────

describe("CpuPage — bar glow targets", () => {
  const src = readPage("pages/CpuPage.tsx");

  it('A.1 — accent bar className includes "accent-glow-target" (FAILED before fix)', () => {
    expect(src).toContain(
      'color === accent ? "accent-fill accent-glow-target" : undefined',
    );
  });

  it("A.1 — accent bar has .bright-breathe child gated on color === accent", () => {
    expect(src).toContain(
      '{color === accent && <span className="bright-breathe" />}',
    );
  });

  it("A.1 — accent bar has .bright-surge child gated on color === accent", () => {
    expect(src).toContain(
      '{color === accent && <span className="bright-surge" />}',
    );
  });

  it("A.2 — semantic bar (color !== accent) gets undefined className — no accent-glow-target", () => {
    // The ternary resolves to undefined for non-accent colours.
    // Verify there is no unconditional accent-glow-target assignment.
    expect(src).not.toMatch(/"accent-glow-target"(?![^"]*: undefined)/);
    // Direct check: the non-accent branch is always undefined.
    expect(src).toContain(
      'color === accent ? "accent-fill accent-glow-target" : undefined',
    );
  });

  it("A.2 — bright spans are absent when color !== accent (conditional on color === accent)", () => {
    // Every bright-breathe / bright-surge occurrence must be gated by color === accent
    const breatheMatches = [...src.matchAll(/bright-breathe/g)];
    const surgeMatches = [...src.matchAll(/bright-surge/g)];
    for (const m of breatheMatches) {
      const before = src.slice(Math.max(0, m.index! - 60), m.index!);
      expect(before).toContain("color === accent");
    }
    for (const m of surgeMatches) {
      const before = src.slice(Math.max(0, m.index! - 60), m.index!);
      expect(before).toContain("color === accent");
    }
  });
});

// ── A.1 / A.2: GpuPage ────────────────────────────────────────────────────────

describe("GpuPage — bar glow targets", () => {
  const src = readPage("pages/GpuPage.tsx");

  it('A.1 — accent bar className includes "accent-glow-target" (FAILED before fix)', () => {
    expect(src).toContain(
      'color === accent ? "accent-fill accent-glow-target" : undefined',
    );
  });

  it("A.1 — accent bar has .bright-breathe child gated on color === accent", () => {
    expect(src).toContain(
      '{color === accent && <span className="bright-breathe" />}',
    );
  });

  it("A.1 — accent bar has .bright-surge child gated on color === accent", () => {
    expect(src).toContain(
      '{color === accent && <span className="bright-surge" />}',
    );
  });

  it("A.2 — semantic bar (color !== accent) gets undefined className — no accent-glow-target", () => {
    expect(src).not.toMatch(/"accent-glow-target"(?![^"]*: undefined)/);
    expect(src).toContain(
      'color === accent ? "accent-fill accent-glow-target" : undefined',
    );
  });

  it("A.2 — bright spans are absent when color !== accent (conditional on color === accent)", () => {
    const breatheMatches = [...src.matchAll(/bright-breathe/g)];
    const surgeMatches = [...src.matchAll(/bright-surge/g)];
    for (const m of breatheMatches) {
      const before = src.slice(Math.max(0, m.index! - 60), m.index!);
      expect(before).toContain("color === accent");
    }
    for (const m of surgeMatches) {
      const before = src.slice(Math.max(0, m.index! - 60), m.index!);
      expect(before).toContain("color === accent");
    }
  });
});
