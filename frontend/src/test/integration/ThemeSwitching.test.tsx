import { describe, it, expect, beforeEach } from "vitest";
import { renderWithTheme } from "../helpers/renderWithTheme";
import {
  expectThemeApplied,
  expectNoBlackElements,
  expectNoInvalidCssValues,
  setAccentMode,
} from "../helpers/themeAssertions";

// Minimal card fixture that exercises the same accent CSS-variable patterns as the
// old GpuCard, without coupling these theme tests to specific page components.
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

const TRANSITIONS: Array<[string, string]> = [
  ["solid", "animated-gradient"],
  ["animated-gradient", "solid"],
  ["solid", "spectrum"],
  ["spectrum", "solid"],
  ["solid", "rainbow-wave"],
  ["rainbow-wave", "solid"],
];

describe("Theme Switching Integration", () => {
  beforeEach(() => {
    setAccentMode("solid");
  });

  it.each(TRANSITIONS)(
    "transitions cleanly from %s to %s with no black or invalid values",
    (from, to) => {
      setAccentMode(from);
      const { container } = renderWithTheme(<TestCard accent={ACCENT} />);

      setAccentMode(to);
      expectThemeApplied(to);
      expectNoBlackElements(container);
      expectNoInvalidCssValues(container);
    },
  );

  it("updates the mode attribute exactly to the new value with no leftover stale value", () => {
    setAccentMode("rainbow-wave");
    renderWithTheme(<TestCard accent={ACCENT} />);
    setAccentMode("solid");
    expect(document.documentElement.getAttribute("data-accent-mode")).toBe(
      "solid",
    );
  });

  it.each(["solid", "animated-gradient", "rainbow-wave", "spectrum"])(
    "keeps progress bar color bound to the live CSS variable in %s mode, never a baked-in hex",
    (mode) => {
      setAccentMode(mode);
      const { container } = renderWithTheme(<TestCard accent={ACCENT} />);
      const bar = container.querySelector(".card-progress-bar");
      expect(bar).toBeTruthy();
      const inlineStyle = bar?.getAttribute("style") || "";
      // A literal #rrggbb here would mean the color was baked in at render time instead of
      // staying bound to --accent-primary, breaking live updates when the accent changes.
      expect(inlineStyle).not.toMatch(/#[0-9a-f]{6}/i);
      expect(inlineStyle).toMatch(/var\(--/);
    },
  );
});
