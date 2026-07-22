import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf8",
).replace(/\s+/g, " ");

describe("fx-safe kill-switch — CSS coverage", () => {
  it("disables rainbow-wave hue-spin animation", () => {
    const idx = css.indexOf(
      '[data-fx-safe="on"][data-accent-mode="rainbow-wave"]',
    );
    expect(idx, "rainbow-wave fx-safe rule missing").not.toBe(-1);
    const block = css.slice(idx, idx + 150);
    expect(block).toContain("animation: none");
  });

  it("clears hue-rotate filter on rainbow-wave", () => {
    const idx = css.indexOf(
      '[data-fx-safe="on"][data-accent-mode="rainbow-wave"]',
    );
    expect(idx).not.toBe(-1);
    const block = css.slice(idx, idx + 150);
    expect(block).toContain("filter: none");
  });

  it("covers .card-accent-spine (spine pulse)", () => {
    expect(css).toContain('[data-fx-safe="on"] .card-accent-spine');
  });

  it("covers .accent-spine", () => {
    expect(css).toContain('[data-fx-safe="on"] .accent-spine');
  });

  it("covers .ov-spine", () => {
    expect(css).toContain('[data-fx-safe="on"] .ov-spine');
  });

  it("covers .accent-glow-target::before (breathe glow)", () => {
    expect(css).toContain('[data-fx-safe="on"] .accent-glow-target::before');
  });

  it("covers .accent-glow-target::after (breathe glow)", () => {
    expect(css).toContain('[data-fx-safe="on"] .accent-glow-target::after');
  });

  it("covers .bright-breathe", () => {
    expect(css).toContain(
      '[data-fx-safe="on"] .accent-glow-target .bright-breathe',
    );
  });

  it("covers .bright-surge", () => {
    expect(css).toContain(
      '[data-fx-safe="on"] .accent-glow-target .bright-surge',
    );
  });

  it("covers [data-accent-el]::before (gradient-border-pan)", () => {
    expect(css).toContain('[data-fx-safe="on"] [data-accent-el]::before');
  });

  it("covers [data-accent-el]::after", () => {
    expect(css).toContain('[data-fx-safe="on"] [data-accent-el]::after');
  });

  it("comprehensive rule uses animation: none !important", () => {
    const idx = css.indexOf('[data-fx-safe="on"] .accent-glow-target,');
    expect(idx, "comprehensive fx-safe rule missing").not.toBe(-1);
    const block = css.slice(idx, idx + 600);
    expect(block).toContain("animation: none !important");
  });

  it("sheen/flow sweep overlay is stopped (compositor rewrite: overlay ::before, not host)", () => {
    // Old assertion was '[data-fx-safe="on"][data-accent-mode="sheen"]' — mode-specific kill of
    // the fx-pan animation on host elements. That animation was removed in the compositor rewrite
    // (Item 4): sweep now lives on .sheen-flow-overlay::before via transform. Guard moved to the
    // comprehensive block that already covers all .sheen-flow-overlay::before targets.
    expect(css).toContain('[data-fx-safe="on"] .sheen-flow-overlay::before');
  });
});
