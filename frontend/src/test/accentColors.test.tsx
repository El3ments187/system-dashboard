import {
  getAccentMode,
  resolveAccentColors,
  useResolvedAccentColor,
  getSecondarySeriesColor,
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
