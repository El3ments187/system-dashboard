/**
 * Per-element hue scoping for charts (spectrum / rainbow-wave modes).
 *
 * ChartFrame ships data-accent-el="inherit" — the indexer's explicit opt-out
 * (accentColors.ts) — so charts take their hue from the nearest page-provided
 * scope. Overview provides one per card (ov-card); the GPU/CPU pages provide
 * none, so all their charts resolved the ROOT scope: identical hue, identical
 * cycle phase (the reported bug). `accentScope` opts a chart into being its
 * own indexed element for pages that don't wrap charts in scoped cards.
 */
import { render } from "@testing-library/react";
import { ChartFrame } from "../components/shared/CardComponents";
import MetricChart, { arePropsEqual } from "../charts/MetricChart";

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const accent = { color: "#3b82f6", glow: "#60a5fa" };
const data = [{ slot: 0, timestamp: new Date(0), value: 1 }];

describe("chart accent scoping (spectrum/rainbow per-element hues)", () => {
  it("ChartFrame defaults to inherit (opts out of indexing)", () => {
    const { container } = render(<ChartFrame>x</ChartFrame>);
    expect(
      container
        .querySelector(".chart-container")
        ?.getAttribute("data-accent-el"),
    ).toBe("inherit");
  });

  it("ChartFrame with accentScope becomes its own indexed element", () => {
    const { container } = render(<ChartFrame accentScope>x</ChartFrame>);
    expect(
      container
        .querySelector(".chart-container")
        ?.getAttribute("data-accent-el"),
    ).toBe("");
  });

  it("MetricChart forwards accentScope to its frame", () => {
    const { container } = render(
      <MetricChart accent={accent} title="t" data={data} accentScope />,
    );
    expect(
      container
        .querySelector(".chart-container")
        ?.getAttribute("data-accent-el"),
    ).toBe("");
  });

  it("comparator re-renders when accentScope changes, skips when equal", () => {
    const base = { accent, title: "t", timeFrame: "60s", data } as any;
    expect(
      arePropsEqual(
        { ...base, accentScope: true },
        { ...base, accentScope: true },
      ),
    ).toBe(true);
    expect(
      arePropsEqual(
        { ...base, accentScope: true },
        { ...base, accentScope: false },
      ),
    ).toBe(false);
  });
});
