import { render, waitFor } from "@testing-library/react";
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

const makeMockHistory = (n = 120): MetricHistoryPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    slot: i,
    timestamp: new Date(Date.now() - (n - i) * 500),
    value: i * (100 / n),
  }));

const ACCENT = { color: "#3b82f6", glow: "#60a5fa" };

describe("MetricChart XAxis — axis leak guards (Tier 2)", () => {
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

  it("does not render one tick per data point (ticks prop absent or sparse)", async () => {
    render(
      <MetricChart accent={ACCENT} title="Test" data={makeMockHistory()} />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    for (const props of capturedXAxis) {
      if (props.ticks !== undefined) {
        expect(
          props.ticks.length,
          "ticks must not be a per-point array (found dense ticks)",
        ).toBeLessThanOrEqual(8);
      }
    }
  });

  it("uses tickCount for sparse axis selection", async () => {
    render(
      <MetricChart accent={ACCENT} title="Test" data={makeMockHistory()} />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const last = capturedXAxis[capturedXAxis.length - 1];
    expect(last.tickCount, "tickCount must be set on XAxis").toBeDefined();
    expect(last.tickCount).toBeGreaterThan(0);
    expect(last.tickCount).toBeLessThanOrEqual(10);
  });

  it("tick prop is referentially stable across re-renders (module const, not inline object)", async () => {
    const data = makeMockHistory();
    const { rerender } = render(
      <MetricChart accent={ACCENT} title="Test" data={data} timeFrame="1m" />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const tickBefore = capturedXAxis[capturedXAxis.length - 1].tick;
    capturedXAxis.length = 0;

    // Change timeFrame to force a re-render while data stays the same;
    // AXIS_TICK is a module const so its reference must be identical.
    rerender(
      <MetricChart accent={ACCENT} title="Test" data={data} timeFrame="2m" />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const tickAfter = capturedXAxis[capturedXAxis.length - 1].tick;
    expect(tickAfter).toBe(tickBefore);
  });

  it("tickFormatter is stable when data is unchanged", async () => {
    const data = makeMockHistory();
    const { rerender } = render(
      <MetricChart accent={ACCENT} title="Test" data={data} timeFrame="1m" />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const fmtBefore = capturedXAxis[capturedXAxis.length - 1].tickFormatter;
    capturedXAxis.length = 0;

    // Change timeFrame to force re-render; data is same so useCallback keeps the same ref.
    rerender(
      <MetricChart accent={ACCENT} title="Test" data={data} timeFrame="2m" />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const fmtAfter = capturedXAxis[capturedXAxis.length - 1].tickFormatter;
    expect(fmtAfter).toBe(fmtBefore);
  });

  it("every XAxis uses the AxisTick renderer (function tick)", async () => {
    render(
      <MetricChart accent={ACCENT} title="Test" data={makeMockHistory()} />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    for (const props of capturedXAxis) {
      expect(
        typeof props.tick,
        "every axis must use the AxisTick renderer",
      ).toBe("function");
    }
  });

  it("skips re-render when data content is unchanged (React.memo)", async () => {
    const data = makeMockHistory();
    const { rerender } = render(
      <MetricChart accent={ACCENT} title="Test" data={data} />,
    );
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));
    capturedXAxis.length = 0;

    // New array reference, same content — memo comparator must skip re-render
    rerender(<MetricChart accent={ACCENT} title="Test" data={[...data]} />);
    await new Promise((r) => setTimeout(r, 50));

    expect(
      capturedXAxis.length,
      "MetricChart re-rendered despite content-equal data (React.memo missing or comparator wrong)",
    ).toBe(0);
  });
});
