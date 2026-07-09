// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { getChartChromeColors } from "../../utils/chartColors";

const VARS = [
  "--chart-grid",
  "--chart-axis",
  "--chart-crosshair",
  "--chart-dot-stroke",
] as const;

describe("getChartChromeColors", () => {
  afterEach(() => {
    VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  });

  it("returns fallback hex values when CSS vars are unset", () => {
    const colors = getChartChromeColors();
    expect(colors.grid).toBe("#1e2535");
    expect(colors.axis).toBe("#2a3143");
    expect(colors.crosshair).toBe("#5a6578");
    expect(colors.dotStroke).toBe("#fff");
  });

  it("returns the set CSS var values when they are defined", () => {
    document.documentElement.style.setProperty("--chart-grid", "#aabbcc");
    document.documentElement.style.setProperty("--chart-axis", "#112233");
    document.documentElement.style.setProperty("--chart-crosshair", "#445566");
    document.documentElement.style.setProperty("--chart-dot-stroke", "#778899");
    const colors = getChartChromeColors();
    expect(colors.grid).toBe("#aabbcc");
    expect(colors.axis).toBe("#112233");
    expect(colors.crosshair).toBe("#445566");
    expect(colors.dotStroke).toBe("#778899");
  });
});
