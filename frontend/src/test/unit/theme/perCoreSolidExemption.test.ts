import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveAccentColors } from "../../../utils/accentColors";

/**
 * Regression coverage for: "Solid mode per-core colors silently shifted when the user
 * changed their accent color." Root cause: resolveAccentColors's n>=3 branch derived hues
 * from the live --accent-primary value in every mode, including Solid, where the spec
 * requires per-core consumers to use the fixed 32-color palette regardless of accent.
 *
 * The exemption only applies when the caller explicitly opts in via the second
 * `perCoreExemption` argument (CoreBars / PerCoreCpuChart only) — every test below passes
 * `true` to exercise that path. A second regression ("Storage Performance went blue
 * regardless of accent") happened because this exemption briefly applied to *any* n > 2
 * caller; see dualLineSeriesColors.test.ts / accentColors.test.tsx for coverage that n > 2
 * callers WITHOUT the flag still participate in the live accent.
 */
describe("resolveAccentColors - Solid mode per-core exemption", () => {
  const ACCENTS = [
    "#3B82F6",
    "#EF4444",
    "#8B5CF6",
    "#22C55E",
    "#FACC15",
    "#EC4899",
  ];

  beforeEach(() => {
    document.documentElement.setAttribute("data-accent-mode", "solid");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    document.documentElement.removeAttribute("style");
  });

  it("returns the identical 32-color sequence regardless of the selected accent", () => {
    const resultsByAccent = ACCENTS.map((accent) => {
      document.documentElement.style.setProperty("--accent-primary", accent);
      return resolveAccentColors(32, true);
    });

    for (let i = 1; i < resultsByAccent.length; i++) {
      expect(resultsByAccent[i]).toEqual(resultsByAccent[0]);
    }
  });

  it("never returns the selected accent as the per-core base color", () => {
    document.documentElement.style.setProperty("--accent-primary", "#40E0D0"); // Turquoise
    const colors = resolveAccentColors(32, true);
    // The palette should be the fixed spectrum, not 32 shades derived from turquoise's hue.
    expect(colors).not.toContain("#40e0d0");
  });

  it("still returns 32 unique colors (palette integrity preserved)", () => {
    document.documentElement.style.setProperty("--accent-primary", "#EF4444");
    const colors = resolveAccentColors(32, true);
    expect(new Set(colors).size).toBe(32);
  });

  it("produces a different sequence in Animated Gradient mode (theme participation)", () => {
    document.documentElement.style.setProperty("--accent-primary", "#22C55E");
    const solidColors = resolveAccentColors(8, true);

    document.documentElement.setAttribute(
      "data-accent-mode",
      "animated-gradient",
    );
    const gradientColors = resolveAccentColors(8, true);

    expect(gradientColors).not.toEqual(solidColors);
  });

  it("Animated Gradient per-core colors do shift when the accent changes", () => {
    document.documentElement.setAttribute(
      "data-accent-mode",
      "animated-gradient",
    );

    document.documentElement.style.setProperty("--accent-primary", "#3B82F6");
    const blueColors = resolveAccentColors(8, true);

    document.documentElement.style.setProperty("--accent-primary", "#EF4444");
    const redColors = resolveAccentColors(8, true);

    expect(redColors).not.toEqual(blueColors);
  });
});

describe("resolveAccentColors - n > 2 WITHOUT perCoreExemption stays accent-aware in Solid mode", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-accent-mode", "solid");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    document.documentElement.removeAttribute("style");
  });

  it("a multi-device consumer (e.g. storage) shifts colors when the accent changes", () => {
    document.documentElement.style.setProperty("--accent-primary", "#3B82F6");
    const blueColors = resolveAccentColors(8);

    document.documentElement.style.setProperty("--accent-primary", "#F97316");
    const orangeColors = resolveAccentColors(8);

    expect(orangeColors).not.toEqual(blueColors);
  });

  it("does not fall back to the fixed 32-color palette", () => {
    document.documentElement.style.setProperty("--accent-primary", "#F97316"); // orange
    const colors = resolveAccentColors(8);
    // The fixed per-core palette's first entry is blue (#3b82f6) — an orange-derived spread
    // should not happen to start there.
    expect(colors[0].toLowerCase()).not.toBe("#3b82f6");
  });
});
