import { readCssVar } from "./cssVar";

export interface ChartChrome {
  grid: string;
  axis: string;
  crosshair: string;
  dotStroke: string;
}

export function getChartChromeColors(): ChartChrome {
  return {
    grid: readCssVar("--chart-grid") || "#1e2535",
    axis: readCssVar("--chart-axis") || "#2a3143",
    crosshair: readCssVar("--chart-crosshair") || "#5a6578",
    dotStroke: readCssVar("--chart-dot-stroke") || "#fff",
  };
}
