import { render } from "@testing-library/react";
import OverviewStorageChart from "../components/overview/OverviewStorageChart";
import type { StorageHistoryPoint } from "../types/metrics";

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: () => null,
  XAxis: () => null,
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

const mockData: StorageHistoryPoint[] = Array.from({ length: 5 }, (_, i) => ({
  slot: i,
  timestamp: new Date(Date.now() - i * 1000).toISOString(),
  read_bytes_per_sec: i * 1024,
  write_bytes_per_sec: i * 512,
}));

describe("OverviewStorageChart — ChartFrame structure", () => {
  it("renders exactly one .chart-container[data-accent-el]", () => {
    const { container } = render(<OverviewStorageChart data={mockData} />);
    const frames = container.querySelectorAll(".chart-container[data-accent-el]");
    expect(frames).toHaveLength(1);
  });

  it("chart-container contains exactly one .card-accent-spine.accent-glow-target", () => {
    const { container } = render(<OverviewStorageChart data={mockData} />);
    const frame = container.querySelector(".chart-container[data-accent-el]")!;
    expect(frame.querySelectorAll(".card-accent-spine.accent-glow-target")).toHaveLength(1);
  });

  it("spine contains exactly one .bright-breathe and one .bright-surge", () => {
    const { container } = render(<OverviewStorageChart data={mockData} />);
    const spine = container.querySelector(".card-accent-spine")!;
    expect(spine.querySelectorAll(".bright-breathe")).toHaveLength(1);
    expect(spine.querySelectorAll(".bright-surge")).toHaveLength(1);
  });
});
