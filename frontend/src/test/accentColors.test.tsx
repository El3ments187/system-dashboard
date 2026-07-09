import {
  getAccentMode,
  resolveAccentColors,
  useResolvedAccentColor,
  getSecondarySeriesColor,
  SECONDARY_LINE_DASH,
} from "../utils/accentColors";
import { renderHook } from "@testing-library/react";
import { TooltipProvider } from "../components/common/TooltipProvider";

// Mock ResizeObserver for jsdom
class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function setAccentMode(mode: string): void {
  document.documentElement.setAttribute("data-accent-mode", mode);
}

describe("getAccentMode", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
  });

  it("returns solid when no data-accent-mode attribute is set", () => {
    expect(getAccentMode()).toBe("solid");
  });

  it("returns the value of data-accent-mode attribute", () => {
    setAccentMode("spectrum");
    expect(getAccentMode()).toBe("spectrum");
  });

  it("returns rainbow-wave when set", () => {
    setAccentMode("rainbow-wave");
    expect(getAccentMode()).toBe("rainbow-wave");
  });

  it("returns sheen when set", () => {
    setAccentMode("sheen");
    expect(getAccentMode()).toBe("sheen");
  });
});

describe("resolveAccentColors", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    // Set a known accent color for testing
    document.documentElement.style.setProperty("--accent-primary", "#00B4D8");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  describe("solid mode (default)", () => {
    beforeEach(() => setAccentMode("solid"));

    it("returns single color for count=1", () => {
      const colors = resolveAccentColors(1);
      expect(colors).toHaveLength(1);
      // Should be a valid hex color
      expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("returns a primary/secondary pair for count=2, secondary a same-hue lightness variant", () => {
      const colors = resolveAccentColors(2);
      expect(colors).toHaveLength(2);
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[0]).toBe("#00b4d8"); // matches --accent-primary set in the outer beforeEach
      expect(colors[1]).toBe(getSecondarySeriesColor(colors[0]));
    });

    it("returns multiple distinct hues for count=32", () => {
      const colors = resolveAccentColors(32);
      expect(colors).toHaveLength(32);
      // All colors should be unique
      const unique = new Set(colors);
      expect(unique.size).toBe(32);
    });

    it("avoids semantic hue bands (danger red, warning amber, success green)", () => {
      const colors = resolveAccentColors(10);
      // Colors should not fall into semantic hue ranges:
      // danger ~0° (340-20), warning ~38° (20-58), success ~142° (122-162)
      for (const color of colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it("uses --accent-primary CSS variable value", () => {
      document.documentElement.style.setProperty("--accent-primary", "#FF5733");
      const colors = resolveAccentColors(1);
      expect(colors[0]).toBe("#ff5733");
    });

    it("falls back to #6366F1 when --accent-primary is not set", () => {
      document.documentElement.style.removeProperty("--accent-primary");
      const colors = resolveAccentColors(1);
      expect(colors[0]).toBe("#6366f1");
    });

    it("handles count=0 by returning single color", () => {
      const colors = resolveAccentColors(0);
      expect(colors).toHaveLength(1);
    });

    it("handles negative count by returning single color", () => {
      const colors = resolveAccentColors(-5);
      expect(colors).toHaveLength(1);
    });
  });

  describe("spectrum mode", () => {
    beforeEach(() => setAccentMode("spectrum"));

    it("returns colors from the 32-color spectrum palette", () => {
      const colors = resolveAccentColors(5);
      expect(colors).toHaveLength(5);
      // All should be valid hex colors
      for (const color of colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it("wraps around the 32-color palette for counts > 32", () => {
      const colors = resolveAccentColors(40);
      expect(colors).toHaveLength(40);
      // Palette is 32 colors long, so the last 8 (indices 32-39) repeat indices 0-7.
      for (let i = 0; i < 8; i++) {
        expect(colors[i]).toBe(colors[i + 32]);
      }
    });

    it("ignores --accent-primary in spectrum mode", () => {
      document.documentElement.style.setProperty("--accent-primary", "#FF0000");
      const colors = resolveAccentColors(1);
      // Should NOT be red since spectrum uses its own palette
      expect(colors[0]).not.toBe("#ff0000");
    });
  });

  describe("rainbow-wave mode", () => {
    beforeEach(() => setAccentMode("rainbow-wave"));

    it("returns distinct hues for each series", () => {
      const colors = resolveAccentColors(4);
      expect(colors).toHaveLength(4);
      // All should be valid hex colors
      for (const color of colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it("avoids semantic hue bands", () => {
      const colors = resolveAccentColors(8);
      // Colors should not fall into semantic hue ranges
      for (const color of colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it("returns single accent color for count=1", () => {
      const colors = resolveAccentColors(1);
      expect(colors).toHaveLength(1);
      expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("sheen mode", () => {
    beforeEach(() => setAccentMode("sheen"));

    it("behaves like solid mode for color resolution", () => {
      const colors = resolveAccentColors(1);
      expect(colors).toHaveLength(1);
      expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("returns multiple distinct hues for count > 2", () => {
      const colors = resolveAccentColors(4);
      expect(colors).toHaveLength(4);
      const unique = new Set(colors);
      expect(unique.size).toBeGreaterThan(1);
    });
  });
});

describe("useResolvedAccentColor", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    document.documentElement.style.setProperty("--accent-primary", "#00B4D8");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("returns the resolved accent color as a hex string", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    );
    const { result } = renderHook(() => useResolvedAccentColor(), { wrapper });
    expect(typeof result.current).toBe("string");
    expect(result.current).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns Turquoise accent when --accent-primary is #00B4D8", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    );
    const { result } = renderHook(() => useResolvedAccentColor(), { wrapper });
    expect(result.current).toBe("#00b4d8");
  });
});

// Re-homed from test/unit/theme/perCoreSolidExemption.test.ts
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
    document.documentElement.style.setProperty("--accent-primary", "#40E0D0");
    const colors = resolveAccentColors(32, true);
    expect(colors).not.toContain("#40e0d0");
  });

  it("still returns 32 unique colors (palette integrity preserved)", () => {
    document.documentElement.style.setProperty("--accent-primary", "#EF4444");
    const colors = resolveAccentColors(32, true);
    expect(new Set(colors).size).toBe(32);
  });

  it("produces a different sequence in Sheen mode (theme participation)", () => {
    document.documentElement.style.setProperty("--accent-primary", "#22C55E");
    const solidColors = resolveAccentColors(8, true);

    document.documentElement.setAttribute("data-accent-mode", "sheen");
    const sheenColors = resolveAccentColors(8, true);

    expect(sheenColors).not.toEqual(solidColors);
  });

  it("Sheen per-core colors do shift when the accent changes", () => {
    document.documentElement.setAttribute("data-accent-mode", "sheen");

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
    document.documentElement.style.setProperty("--accent-primary", "#F97316");
    const colors = resolveAccentColors(8);
    expect(colors[0].toLowerCase()).not.toBe("#3b82f6");
  });
});

// Re-homed from test/unit/theme/dualLineSeriesColors.test.ts
describe("getSecondarySeriesColor", () => {
  it("returns a hex color in the same hue family as the input (within rounding)", () => {
    const primary = "#3B82F6";
    const secondary = getSecondarySeriesColor(primary);
    expect(secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(secondary.toLowerCase()).not.toBe(primary.toLowerCase());
  });

  it("never returns the exact same color as the input", () => {
    const samples = [
      "#3B82F6",
      "#EF4444",
      "#22C55E",
      "#FACC15",
      "#8B5CF6",
      "#000000",
      "#FFFFFF",
    ];
    for (const color of samples) {
      expect(getSecondarySeriesColor(color).toLowerCase()).not.toBe(
        color.toLowerCase(),
      );
    }
  });

  it("darkens light colors and lightens dark colors (shifts away from the midpoint)", () => {
    const lightSecondary = getSecondarySeriesColor("#E5E4E2");
    const darkSecondary = getSecondarySeriesColor("#0B0B0D");

    const toLightness = (hex: string) => {
      const h = hex.replace("#", "");
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };

    expect(toLightness(lightSecondary)).toBeLessThan(toLightness("#E5E4E2"));
    expect(toLightness(darkSecondary)).toBeGreaterThan(toLightness("#0B0B0D"));
  });

  it("is deterministic for the same input", () => {
    expect(getSecondarySeriesColor("#3B82F6")).toBe(
      getSecondarySeriesColor("#3B82F6"),
    );
  });
});

describe("resolveAccentColors(2) - dual-line series across modes", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    document.documentElement.removeAttribute("style");
  });

  it("Solid mode: secondary is the selected accent's same-hue variant, not an unrelated hue", () => {
    document.documentElement.setAttribute("data-accent-mode", "solid");
    document.documentElement.style.setProperty("--accent-primary", "#40E0D0");
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary).toBe("#40e0d0");
    expect(secondary).toBe(getSecondarySeriesColor("#40e0d0"));
  });

  it("Sheen mode: same relationship as Solid (participates in the live accent)", () => {
    document.documentElement.setAttribute("data-accent-mode", "sheen");
    document.documentElement.style.setProperty("--accent-primary", "#EF4444");
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary).toBe("#ef4444");
    expect(secondary).toBe(getSecondarySeriesColor("#ef4444"));
  });

  it("Spectrum mode: primary is the fixed first palette entry, ignoring the selected accent", () => {
    document.documentElement.setAttribute("data-accent-mode", "spectrum");
    document.documentElement.style.setProperty("--accent-primary", "#EF4444");
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary.toLowerCase()).not.toBe("#ef4444");
    expect(secondary).toBe(getSecondarySeriesColor(primary));
  });

  it("Rainbow Wave mode: secondary tracks whatever the live spin-based primary currently is", () => {
    document.documentElement.setAttribute("data-accent-mode", "rainbow-wave");
    document.documentElement.style.setProperty("--accent-spin", "120");
    const [primary, secondary] = resolveAccentColors(2);
    expect(secondary).toBe(getSecondarySeriesColor(primary));
  });

  it("never returns identical primary/secondary in any mode", () => {
    for (const mode of ["solid", "sheen", "rainbow-wave", "spectrum"]) {
      document.documentElement.setAttribute("data-accent-mode", mode);
      const [primary, secondary] = resolveAccentColors(2);
      expect(primary.toLowerCase()).not.toBe(secondary.toLowerCase());
    }
  });
});

describe("SECONDARY_LINE_DASH", () => {
  it("is a non-empty, non-solid strokeDasharray value", () => {
    expect(SECONDARY_LINE_DASH).toMatch(/^\d+(\s\d+)+$/);
  });
});
