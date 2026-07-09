import { render, waitFor } from "@testing-library/react";
import MetricChart from "../charts/MetricChart";
import type { MetricHistoryPoint } from "../types/metrics";

// Capture props passed to recharts Area / Bar so we can assert CSS-var usage
const capturedAreaProps: Array<{ stroke: string; fill: string }> = [];
const capturedBarProps: Array<{ fill: string }> = [];

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: (props: any) => {
    capturedAreaProps.push({ stroke: String(props.stroke), fill: String(props.fill) });
    return null;
  },
  BarChart: ({ children }: any) => (
    <svg data-testid="bar-chart">{children}</svg>
  ),
  Bar: (props: any) => {
    capturedBarProps.push({ fill: String(props.fill) });
    return null;
  },
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

const mockHistory: MetricHistoryPoint[] = Array.from({ length: 10 }, (_, i) => ({
  slot: i,
  timestamp: new Date(Date.now() - (10 - i) * 500),
  value: i * 5,
}));

describe("MetricChart — CSS var stroke/fill (Issue A: rainbow-wave animation)", () => {
  beforeAll(() => {
    // Make all chart containers report a real size so chartSize state is set
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
    capturedAreaProps.length = 0;
    capturedBarProps.length = 0;
  });

  it("single-series area chart uses gradient-URL stroke (gradient stops use CSS vars)", async () => {
    render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="GPU Utilization"
        data={mockHistory}
      />,
    );
    await waitFor(() => expect(capturedAreaProps.length).toBeGreaterThan(0));
    // Single-series uses url(#...-stroke) which references a <linearGradient>
    // whose <stop> elements use var(--accent-fill-stop-1/2) — CSS vars, not hex
    expect(capturedAreaProps[0].stroke).toMatch(/^url\(#/);
  });

  it("dual-axis primary series uses var(--accent-primary) for stroke and fill", async () => {
    const secondary = mockHistory.map((p) => ({ ...p, value: p.value * 0.5 }));
    render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="CPU Utilization"
        data={mockHistory}
        dualData={secondary}
        primaryLabel="CPU %"
        secondaryLabel="Temp °C"
        dualUnit="°C"
      />,
    );
    await waitFor(() => expect(capturedAreaProps.length).toBeGreaterThan(0));
    // Primary series must use the CSS var so rainbow-wave animation flows through
    const primary = capturedAreaProps.find((p) => p.stroke === "var(--accent-primary)");
    expect(primary).toBeDefined();
    expect(primary!.fill).toBe("var(--accent-primary)");
  });

  it("multi-key series primary (index 0) uses var(--accent-primary) for stroke and fill", async () => {
    const multiData = mockHistory.map((p) => ({
      ...p,
      memory: p.value,
      swap: Math.round(p.value * 0.3),
    }));
    render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="Memory Utilization"
        data={multiData as any}
        dataKeys={["memory", "swap"]}
      />,
    );
    await waitFor(() => expect(capturedAreaProps.length).toBeGreaterThan(0));
    const primary = capturedAreaProps.find((p) => p.stroke === "var(--accent-primary)");
    expect(primary).toBeDefined();
    expect(primary!.fill).toBe("var(--accent-primary)");
  });

  it("bar chart uses var(--accent-primary) for fill", async () => {
    render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="Bar"
        data={mockHistory}
        chartType="bar"
      />,
    );
    await waitFor(() => expect(capturedBarProps.length).toBeGreaterThan(0));
    expect(capturedBarProps[0].fill).toBe("var(--accent-primary)");
  });

  it("secondary series still uses a resolved hex (no CSS var for secondary accent)", async () => {
    const secondary = mockHistory.map((p) => ({ ...p, value: p.value * 0.5 }));
    render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="CPU Utilization"
        data={mockHistory}
        dualData={secondary}
        primaryLabel="CPU %"
        secondaryLabel="Temp"
      />,
    );
    await waitFor(() => expect(capturedAreaProps.length).toBeGreaterThanOrEqual(2));
    // Secondary series should use a hex (not a CSS var) for now
    const secondary_ = capturedAreaProps.find(
      (p) => p.stroke !== "var(--accent-primary)" && !p.stroke.startsWith("url(#"),
    );
    expect(secondary_).toBeDefined();
    expect(secondary_!.stroke).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
