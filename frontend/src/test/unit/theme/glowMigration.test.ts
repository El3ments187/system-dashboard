// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { migrateGlowCustom } from "../../../hooks/useTheme";
import { ACCENT_THEMES } from "../../../hooks/useTheme";

const PALETTE_COLORS = ACCENT_THEMES.map((t) => t.color.toLowerCase());

describe("migrateGlowCustom", () => {
  it("returns an in-palette color unchanged (case-insensitive)", () => {
    const cyan = ACCENT_THEMES.find((t) => t.id === "cyan")!.color;
    expect(migrateGlowCustom(cyan).toLowerCase()).toBe(cyan.toLowerCase());
    expect(migrateGlowCustom(cyan.toLowerCase()).toLowerCase()).toBe(
      cyan.toLowerCase(),
    );
  });

  it("migrates an out-of-palette hex to a palette color", () => {
    // #ff0055 is not in the palette — should return some palette color
    const result = migrateGlowCustom("#ff0055");
    expect(PALETTE_COLORS).toContain(result.toLowerCase());
  });

  it("migrates a near-red out-of-palette value toward the red end of the palette", () => {
    // Pure red #ff0000 should resolve nearest to Red (#EF4444) or Crimson/Rose
    const result = migrateGlowCustom("#ff0000");
    expect(PALETTE_COLORS).toContain(result.toLowerCase());
    // Should be a warm color, not teal or blue
    const chosen = ACCENT_THEMES.find(
      (t) => t.color.toLowerCase() === result.toLowerCase(),
    )!;
    const warmIds = [
      "red",
      "coral",
      "rose",
      "crimson",
      "ruby",
      "orange",
      "pink",
    ];
    expect(warmIds).toContain(chosen.id);
  });

  it("returns a fallback palette color for empty string", () => {
    const result = migrateGlowCustom("");
    expect(PALETTE_COLORS).toContain(result.toLowerCase());
  });

  it("returns a fallback palette color for null", () => {
    const result = migrateGlowCustom(null);
    expect(PALETTE_COLORS).toContain(result.toLowerCase());
  });

  it("never returns an out-of-palette value for any input", () => {
    const testInputs = [
      "#ff5733",
      "#00ff00",
      "#123456",
      "invalid",
      "",
      null,
      "#FFFFFF",
      ...ACCENT_THEMES.map((t) => t.color),
    ];
    for (const input of testInputs) {
      const result = migrateGlowCustom(input);
      expect(PALETTE_COLORS).toContain(result.toLowerCase());
    }
  });

  it("all ACCENT_THEMES palette colors pass through unchanged", () => {
    for (const theme of ACCENT_THEMES) {
      const result = migrateGlowCustom(theme.color);
      expect(result.toLowerCase()).toBe(theme.color.toLowerCase());
    }
  });
});
