/**
 * Tier 3 — data-sliding axis guard
 *
 * Drives 30 re-renders with a sliding data window (the exact pattern the app
 * uses: [...history.slice(1), newPoint] every poll) and asserts the XAxis
 * props stay sparse throughout — tickCount set, no per-point ticks array.
 *
 * This is the CI-practical Tier 3: it exercises the real component under the
 * real update pattern and verifies the fix holds across every slide, not just
 * on initial render. jsdom cannot count detached tspans (no real GC/native
 * memory), so this guards the CAUSE (prop shape) rather than the symptom.
 */
import { render } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import MetricChart from "../charts/MetricChart";
import type { MetricHistoryPoint } from "../types/metrics";

const capturedXAxis: any[] = [];

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => <svg>{children}</svg>,
  Area: () => null,
  BarChart: ({ children }: any) => <svg>{children}</svg>,
  Bar: () => null,
  XAxis: (props: any) => {
    capturedXAxis.push(props);
    return null;
  },
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function makeHistory(n = 120, offsetMs = 0): MetricHistoryPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i,
    timestamp: new Date(Date.now() - (n - i) * 500 + offsetMs),
    value: i % 100,
  }));
}

function slide(data: MetricHistoryPoint[], step: number): MetricHistoryPoint[] {
  const next: MetricHistoryPoint = {
    slot: data[data.length - 1].slot + 1,
    timestamp: new Date(
      data[data.length - 1].timestamp.getTime() + 500 * (step + 1),
    ),
    value: step % 100,
  };
  return [...data.slice(1), next];
}

describe("MetricChart XAxis — axis stays sparse across 30 data slides (Tier 3)", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      value: () => ({
        width: 400,
        height: 200,
        top: 0,
        left: 0,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
  });

  beforeEach(() => {
    capturedXAxis.length = 0;
  });

  it("XAxis props stay sparse across 30 re-renders with sliding data", async () => {
    let data = makeHistory();
    const { rerender } = render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="Test"
        data={data}
      />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));
    capturedXAxis.length = 0;

    for (let i = 0; i < 30; i++) {
      data = slide(data, i);
      rerender(
        <MetricChart
          accent={{ color: "#3b82f6", glow: "#60a5fa" }}
          title="Test"
          data={data}
        />,
      );
    }

    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    // Every XAxis render across all 30 slides must have sparse props
    for (const props of capturedXAxis) {
      if (props.ticks !== undefined) {
        expect(
          props.ticks.length,
          "ticks became per-point during a data slide",
        ).toBeLessThanOrEqual(8);
      }
      expect(
        props.tickCount,
        "tickCount dropped during a data slide",
      ).toBeDefined();
    }
  });
});
