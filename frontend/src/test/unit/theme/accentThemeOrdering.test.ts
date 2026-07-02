import { describe, it, expect } from "vitest";
import { ACCENT_THEMES } from "../../../hooks/useTheme";

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s * 100, l * 100];
}

function circularHueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Regression coverage for: the accent color picker used to be grouped by category
 * (Blues, Cyans, Greens, ...) in a fixed insertion order with no guarantee that adjacent
 * swatches were perceptually related. It's now ordered as a continuous hue spectrum.
 * These tests don't hardcode the exact sequence (so a deliberate future re-tweak doesn't
 * break them for no reason) — they assert the *property* that makes it feel like a color
 * wheel: low hue distance between neighbors, and neutrals grouped at the end.
 */
describe("ACCENT_THEMES ordering - color wheel smoothness", () => {
  const NEUTRAL_IDS = new Set(["silver", "platinum"]);
  const huedColors = ACCENT_THEMES.filter((t) => !NEUTRAL_IDS.has(t.id));

  it("keeps Silver and Platinum as the last two entries (neutrals grouped at the end)", () => {
    const last2 = ACCENT_THEMES.slice(-2).map((t) => t.id);
    expect(new Set(last2)).toEqual(NEUTRAL_IDS);
  });

  it("has no neutral entries interleaved among the hued colors", () => {
    const ids = ACCENT_THEMES.map((t) => t.id);
    const firstNeutralIndex = ids.findIndex((id) => NEUTRAL_IDS.has(id));
    const lastHuedIndex = ids.length - 1 - NEUTRAL_IDS.size;
    expect(firstNeutralIndex).toBeGreaterThan(lastHuedIndex);
  });

  it("most adjacent hued colors are within a reasonably small hue distance of each other", () => {
    const hues = huedColors.map((t) => hexToHsl(t.color)[0]);
    const distances = hues
      .slice(1)
      .map((h, i) => circularHueDistance(h, hues[i]));
    // A perfectly smooth spectrum keeps most steps small; allow a handful of larger jumps
    // for legitimate category boundaries (e.g. Yellows -> Oranges) without regressing to
    // a near-random shuffle.
    const smoothSteps = distances.filter((d) => d <= 40).length;
    expect(smoothSteps / distances.length).toBeGreaterThanOrEqual(0.7);
  });

  it("starts with Blue (the default accent) and keeps Blue's near-neighbors (Sky, Sapphire, Ice) adjacent to it", () => {
    const ids = huedColors.map((t) => t.id);
    expect(ids[0]).toBe("blue");
    const blueClusterIndex = Math.max(
      ids.indexOf("sky"),
      ids.indexOf("sapphire"),
      ids.indexOf("ice"),
    );
    expect(blueClusterIndex).toBeLessThanOrEqual(3);
  });

  it("places greens between the blue/cyan cluster and the yellow cluster", () => {
    const ids = huedColors.map((t) => t.id);
    const lastCyanIdx = Math.max(
      ids.indexOf("cyan"),
      ids.indexOf("teal"),
      ids.indexOf("turquoise"),
    );
    const firstGreenIdx = Math.min(
      ids.indexOf("green"),
      ids.indexOf("emerald"),
      ids.indexOf("terminal"),
    );
    const firstYellowIdx = ids.indexOf("yellow");
    expect(firstGreenIdx).toBeGreaterThan(lastCyanIdx);
    expect(firstYellowIdx).toBeGreaterThan(firstGreenIdx);
  });

  it("places purples between the red/pink cluster and the end of the hued sequence (bridging back toward blue)", () => {
    const ids = huedColors.map((t) => t.id);
    const lastPinkIdx = Math.max(
      ids.indexOf("pink"),
      ids.indexOf("magenta"),
      ids.indexOf("orchid"),
    );
    const purpleIndices = ["violet", "purple", "lavender", "indigo"].map((id) =>
      ids.indexOf(id),
    );
    expect(Math.min(...purpleIndices)).toBeGreaterThan(lastPinkIdx);
    expect(Math.max(...purpleIndices)).toBe(ids.length - 1);
  });

  it("still has exactly 32 entries and no duplicate ids or colors", () => {
    expect(ACCENT_THEMES).toHaveLength(32);
    expect(new Set(ACCENT_THEMES.map((t) => t.id)).size).toBe(32);
    expect(new Set(ACCENT_THEMES.map((t) => t.color.toLowerCase())).size).toBe(
      32,
    );
  });
});
