import { describe, it, expect } from "vitest";
import { darken, lighten, hexToRgba } from "../../../hooks/useTheme";

describe("color utilities - hexToRgba", () => {
  it("converts hex to rgba with given alpha", () => {
    const result = hexToRgba("#3B82F6", 0.5);
    expect(result).toBe("rgba(59, 130, 246, 0.5)");
  });

  it("handles full opacity", () => {
    const result = hexToRgba("#FF0000", 1);
    expect(result).toBe("rgba(255, 0, 0, 1)");
  });
});

describe("color utilities - darken", () => {
  it("darkens a color", () => {
    const result = darken("#FFFFFF", 0.5);
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result).not.toBe("#FFFFFF");
  });

  it("does not go below #000000", () => {
    const result = darken("#111111", 1);
    expect(result).toBe("#000000");
  });
});

describe("color utilities - lighten", () => {
  it("lightens a color", () => {
    const result = lighten("#111111", 0.5);
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result).not.toBe("#111111");
  });

  it("does not exceed #FFFFFF", () => {
    const result = lighten("#EEEEEE", 1);
    expect(result).toBe("#ffffff");
  });
});
