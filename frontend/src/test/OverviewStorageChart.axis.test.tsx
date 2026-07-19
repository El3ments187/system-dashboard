import { render, waitFor } from "@testing-library/react";
import OverviewStorageChart from "../components/overview/OverviewStorageChart";
import type { StorageHistoryPoint } from "../types/metrics";

const capturedXAxis: any[] = [];

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => <svg>{children}</svg>,
  Area: () => null,
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

const makeMockStorage = (n = 120): StorageHistoryPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    device: "/dev/sda",
    slot: i,
    timestamp: new Date(Date.now() - (n - i) * 500).toISOString(),
    read_bytes_per_sec: i * 1024,
    write_bytes_per_sec: i * 512,
    utilization: null,
  }));

describe("OverviewStorageChart XAxis — axis leak guards (Tier 2)", () => {
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
    render(<OverviewStorageChart data={makeMockStorage()} />);
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
    render(<OverviewStorageChart data={makeMockStorage()} />);
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const last = capturedXAxis[capturedXAxis.length - 1];
    expect(last.tickCount, "tickCount must be set on XAxis").toBeDefined();
    expect(last.tickCount).toBeGreaterThan(0);
    expect(last.tickCount).toBeLessThanOrEqual(10);
  });

  it("tick prop is referentially stable across re-renders (module const, not inline object)", async () => {
    const data = makeMockStorage();
    const { rerender } = render(<OverviewStorageChart data={data} />);
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const tickBefore = capturedXAxis[capturedXAxis.length - 1].tick;
    capturedXAxis.length = 0;

    rerender(<OverviewStorageChart data={data} />);
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const tickAfter = capturedXAxis[capturedXAxis.length - 1].tick;
    expect(tickAfter).toBe(tickBefore);
  });

  it("tickFormatter is stable when data is unchanged", async () => {
    const data = makeMockStorage();
    const { rerender } = render(<OverviewStorageChart data={data} />);
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const fmtBefore = capturedXAxis[capturedXAxis.length - 1].tickFormatter;
    capturedXAxis.length = 0;

    rerender(<OverviewStorageChart data={data} />);
    await waitFor(() => expect(capturedXAxis.length).toBeGreaterThan(0));

    const fmtAfter = capturedXAxis[capturedXAxis.length - 1].tickFormatter;
    expect(fmtAfter).toBe(fmtBefore);
  });
});
