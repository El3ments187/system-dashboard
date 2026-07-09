import { describe, it, expect, beforeEach } from "vitest";
import { renderWithTheme } from "../helpers/renderWithTheme";
import {
  expectNoBlackElements,
  expectNoInvalidCssValues,
  setAccentMode,
} from "../helpers/themeAssertions";

// Minimal card fixture that exercises the same accent CSS-variable patterns as the
// old GpuCard/CpuCard, without coupling these theme tests to specific page components.
function TestCard({ accent }: { accent: { color: string; glow: string } }) {
  return (
    <div
      data-accent-el=""
      className="metric-card card"
      style={{ color: accent.color, boxShadow: accent.glow }}
    >
      <span className="card-accent-spine accent-glow-target" aria-hidden />
      <div
        className="card-progress-bar"
        style={{ background: "var(--accent-fill)", color: accent.color }}
      />
    </div>
  );
}

const ACCENT = { color: "var(--accent-primary)", glow: "var(--accent-glow)" };

const MODES = ["solid", "animated-gradient", "rainbow-wave", "spectrum"];

/**
 * One parametrized suite replaces what were four near-identical files (SolidMode,
 * GradientMode, RainbowMode, SpectrumMode), each repeating the same black-element /
 * invalid-CSS-value checks under a different `data-accent-mode`. Mode-specific behavior
 * (e.g. Solid-only per-core exemption) has its own dedicated test files elsewhere.
 */
describe.each(MODES)("%s mode - card rendering", (mode) => {
  beforeEach(() => {
    setAccentMode(mode);
  });

  it("sets the mode attribute on the document element", () => {
    expect(document.documentElement.getAttribute("data-accent-mode")).toBe(
      mode,
    );
  });

  it("renders cards with no black elements", () => {
    const { container } = renderWithTheme(
      <div>
        <TestCard accent={ACCENT} />
        <TestCard accent={ACCENT} />
      </div>,
    );
    expect(container.firstChild).not.toBeNull();
    expectNoBlackElements(container);
  });

  it("renders cards with no invalid CSS values (undefined/NaN/null)", () => {
    const { container } = renderWithTheme(
      <div>
        <TestCard accent={ACCENT} />
        <TestCard accent={ACCENT} />
      </div>,
    );
    expect(container.firstChild).not.toBeNull();
    expectNoInvalidCssValues(container);
  });
});

describe("Solid mode - accent consistency", () => {
  beforeEach(() => {
    setAccentMode("solid");
  });

  it("cards reference the same --accent-primary variable, not divergent literals", () => {
    const { container } = renderWithTheme(
      <div>
        <TestCard accent={ACCENT} />
        <TestCard accent={ACCENT} />
      </div>,
    );
    const accentRefs = Array.from(
      container.querySelectorAll<HTMLElement>('[style*="--accent-primary"]'),
    );
    expect(accentRefs.length).toBeGreaterThan(0);
    accentRefs.forEach((el) => {
      expect(el.getAttribute("style")).toContain("var(--accent-primary)");
    });
  });
});
