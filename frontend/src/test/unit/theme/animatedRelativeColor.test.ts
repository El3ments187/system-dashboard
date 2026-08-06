/**
 * Crash-hardening guard tests — RED phase (TDD).
 *
 * These tests assert the desired post-fix invariants for the three crash
 * mechanisms.  They FAIL before the corresponding phase is applied and PASS
 * after.  Do not skip or remove them — they are the regression guard.
 *
 * Mechanism A: animated @property --accent-spin must not drive --el-off in
 *   rainbow-wave, because that causes per-frame oklch() relative-color
 *   recomputation on every [data-accent-el] → Chrome renderer SIGILL.
 *
 * Mechanism B: @keyframes fx-pan / gradient-border-pan / accent-fill-pan
 *   must not contain background-position — animated background-position on
 *   oklch() relative-color gradients causes per-frame GPU shader re-evaluation.
 *
 * Mechanism A (JS): accentColors.ts must not poll --accent-spin at runtime so
 *   chart colors stay stable without a 800 ms interval in rainbow-wave mode.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const variablesCss = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf8",
);

const accentColorsSrc = readFileSync(
  resolve(__dirname, "../../../utils/accentColors.ts"),
  "utf8",
);

// ── Mechanism A CSS ───────────────────────────────────────────────────────────

describe("Mechanism A CSS — rainbow-wave --el-off must not include --accent-spin", () => {
  it("rainbow-wave root block --el-off does not reference --accent-spin", () => {
    const rwIdx = variablesCss.indexOf('[data-accent-mode="rainbow-wave"] {');
    expect(rwIdx, '[data-accent-mode="rainbow-wave"] block not found').not.toBe(
      -1,
    );
    const block = variablesCss.slice(rwIdx, rwIdx + 600);
    const elOffIdx = block.indexOf("--el-off:");
    expect(elOffIdx, "--el-off not found in rainbow-wave block").not.toBe(-1);
    const elOffDecl = block.slice(elOffIdx, elOffIdx + 200);
    expect(elOffDecl).not.toContain("--accent-spin");
  });

  it("per-element rainbow-wave --el-off does not reference --accent-spin", () => {
    const perElIdx = variablesCss.indexOf(
      '[data-accent-mode="rainbow-wave"] [style*="--el-index"]',
    );
    expect(perElIdx, "per-element rainbow-wave block not found").not.toBe(-1);
    const block = variablesCss.slice(perElIdx, perElIdx + 400);
    const elOffIdx = block.indexOf("--el-off:");
    expect(elOffIdx, "--el-off not found in per-element block").not.toBe(-1);
    const elOffDecl = block.slice(elOffIdx, elOffIdx + 200);
    expect(elOffDecl).not.toContain("--accent-spin");
  });

  it("hue-spin is applied unconditionally on rainbow-wave (not gated by no-preference media query)", () => {
    // Old assertion: hue-spin was inside @media (prefers-reduced-motion: no-preference).
    // Changed: hue-spin is now unconditional so Playwright headless (software renderer
    // → fx-safe auto-on) can test suppression correctly. The animation is still
    // cancelled by both @media (prefers-reduced-motion: reduce) { animation: none }
    // and [data-fx-safe="on"][data-accent-mode="rainbow-wave"] { animation: none }.
    // hue-spin must appear as an animation value outside any media query
    const huespinIdx = variablesCss.indexOf("animation: hue-spin");
    expect(
      huespinIdx,
      "unconditional 'animation: hue-spin' declaration not found",
    ).not.toBe(-1);
    // Confirm it is NOT inside a @media block (search backwards from the declaration)
    const before = variablesCss.slice(0, huespinIdx);
    const lastMedia = before.lastIndexOf("@media");
    const lastCloseBrace = before.lastIndexOf("}");
    // If the last @media comes before the last closing brace, we are outside any media block
    expect(
      lastMedia < lastCloseBrace,
      "hue-spin must be in an unconditional rule, not inside a @media block",
    ).toBe(true);
    expect(variablesCss).not.toContain("accent-spin-rotate");
    // The reduce cancel for rainbow-wave must exist (animation: none for hue-spin)
    const rainbowReduceIdx = variablesCss.indexOf(
      '[data-accent-mode="rainbow-wave"] {\n    animation: none',
    );
    expect(
      rainbowReduceIdx,
      "reduce-motion cancel for rainbow-wave animation: none not found",
    ).not.toBe(-1);
  });

  it("@keyframes hue-spin exists and uses filter: hue-rotate", () => {
    const idx = variablesCss.indexOf("@keyframes hue-spin");
    expect(idx, "@keyframes hue-spin not found").not.toBe(-1);
    const block = variablesCss.slice(idx, idx + 150);
    expect(block).toContain("hue-rotate");
  });
});

// ── Mechanism B CSS ───────────────────────────────────────────────────────────
//
// The keyframes themselves animate @property values (--fx-pan-x, --fill-pan-x,
// --border-angle) rather than background-position directly. background-position
// is still driven indirectly via calc(var(--fx-pan-x,1)*100%) in the consuming
// selector, so gradient stops remain static even though position updates each
// frame. Measured non-issue as of 2025-07: no crash observed from this path on
// the NVIDIA 595 / Chrome 150 / Blackwell stack. These tests guard what is
// actually guaranteed (no background-position inside the keyframe bodies and
// static gradient stop declarations) — not the absence of animated panning.

describe("Mechanism B CSS — keyframe bodies must not contain background-position directly", () => {
  it("@keyframes fx-pan body does not contain background-position", () => {
    const idx = variablesCss.indexOf("@keyframes fx-pan");
    expect(idx, "@keyframes fx-pan not found").not.toBe(-1);
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).not.toContain("background-position");
  });

  it("@keyframes gradient-border-pan body does not contain background-position", () => {
    const idx = variablesCss.indexOf("@keyframes gradient-border-pan");
    expect(idx, "@keyframes gradient-border-pan not found").not.toBe(-1);
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).not.toContain("background-position");
  });

  it("@keyframes accent-fill-pan body does not contain background-position", () => {
    const idx = variablesCss.indexOf("@keyframes accent-fill-pan");
    expect(idx, "@keyframes accent-fill-pan not found").not.toBe(-1);
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).not.toContain("background-position");
  });

  it("gradient stops in fx-pan consuming selector are static (no oklch in keyframe body)", () => {
    const idx = variablesCss.indexOf("@keyframes fx-pan");
    expect(idx).not.toBe(-1);
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).not.toContain("oklch");
    expect(block).not.toContain("--accent-fill-stop");
  });
});

// ── Mechanism A JS ────────────────────────────────────────────────────────────

describe("Mechanism A JS — accentColors.ts must not poll --accent-spin", () => {
  it("rainbow-wave is not in ANIMATED_MODES", () => {
    const modesIdx = accentColorsSrc.indexOf("ANIMATED_MODES");
    expect(modesIdx, "ANIMATED_MODES not found").not.toBe(-1);
    const modesDecl = accentColorsSrc.slice(modesIdx, modesIdx + 80);
    expect(modesDecl).not.toContain('"rainbow-wave"');
  });

  it("rainbowColors function does not read --accent-spin", () => {
    const fnIdx = accentColorsSrc.indexOf("function rainbowColors");
    expect(fnIdx, "rainbowColors not found").not.toBe(-1);
    const fn = accentColorsSrc.slice(fnIdx, fnIdx + 400);
    expect(fn).not.toContain("--accent-spin");
  });

  it("resolveAccentColors does not call getPropertyValue on --accent-spin", () => {
    expect(accentColorsSrc).not.toContain('getPropertyValue("--accent-spin")');
  });
});

// ── Phase 6 — dead accent-spin code removed ───────────────────────────────────

describe("Phase 6 — @property --accent-spin and @keyframes accent-spin-rotate removed", () => {
  it("variables.css does not declare @property --accent-spin outside comments", () => {
    const withoutComments = variablesCss.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toContain("--accent-spin");
  });

  it("variables.css does not define @keyframes accent-spin-rotate", () => {
    expect(variablesCss).not.toContain("accent-spin-rotate");
  });
});

// ── Phase 5 — data-fx-safe kill-switch present in CSS ────────────────────────

describe("Phase 5 — data-fx-safe kill-switch", () => {
  it("variables.css contains data-fx-safe rules", () => {
    expect(variablesCss).toContain('[data-fx-safe="on"]');
  });

  it("data-fx-safe disables rainbow-wave animation", () => {
    const idx = variablesCss.indexOf('[data-fx-safe="on"]');
    expect(idx).not.toBe(-1);
    const region = variablesCss.slice(idx, idx + 2000);
    expect(region).toContain("animation: none");
  });
});
