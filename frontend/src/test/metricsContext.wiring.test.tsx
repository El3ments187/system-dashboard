/**
 * MetricsContext wiring — slideWindow is unit-proven; this covers the wiring
 * around it that no test touched: per-core history construction across polls,
 * a core-count change between polls, and a disappearing core. A refactor of
 * the provider is exactly where these break silently.
 * Assertions stick to what the code guarantees; no payload-shape pinning
 * beyond the fields the builders read (cores[i].utilization_percent).
 *
 * After migration to useCombinedMetrics all traffic goes to /api/metrics/all
 * (top-level fields, no { data: ... } envelope). The wiring test mocks that
 * single endpoint and confirms per-core history rebuilds on core-count change.
 */
import { render, act } from "@testing-library/react";
import { vi } from "vitest";
import { MetricsProvider, useMetricsContext } from "../context/MetricsContext";
import { LiveDataControlsProvider } from "../context/LiveDataControlsContext";

function routedFetch(coresRef: { n: number }) {
  return vi.fn((input: any) => {
    const url = String(input);
    const cores = Array.from({ length: coresRef.n }, (_, i) => ({
      core_id: i,
      utilization_percent: i * 10,
    }));
    if (url.includes("/api/metrics/all")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          cpu: {
            model: "Test CPU",
            utilization_percent: 50,
            temperature_celsius: 60,
            physical_cores: coresRef.n,
            threads: coresRef.n * 2,
            load_1m: 1.0,
            load_5m: 0.8,
            load_15m: 0.6,
            frequency_mhz: 3000,
            freq_max_mhz: 5000,
            cores,
          },
          memory: {
            utilization_percent: 40,
            used_gb: 6,
            total_gb: 16,
            swap_used_gb: 0,
            swap_total_gb: 4,
          },
          gpu: [],
          storage_devices: [],
          storage_history: [],
          timestamp: new Date().toISOString(),
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function Capture({
  setter,
}: {
  setter: (c: ReturnType<typeof useMetricsContext>) => void;
}) {
  setter(useMetricsContext());
  return null;
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LiveDataControlsProvider>
    <MetricsProvider>{children}</MetricsProvider>
  </LiveDataControlsProvider>
);

describe("metricsContext.wiring", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("per-core histories track core count and survive shrink/growth without throwing", async () => {
    const coresRef = { n: 4 };
    global.fetch = routedFetch(coresRef) as any;

    let ctx!: ReturnType<typeof useMetricsContext>;
    render(
      <Wrapper>
        <Capture setter={(c) => { ctx = c; }} />
      </Wrapper>,
    );

    // 4 cores → 4 per-core history slots after first CPU poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(ctx.perCoreCpuHistories).toHaveLength(4);

    // shrink: 4 → 2 cores — must rebuild, not crash
    coresRef.n = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(ctx.perCoreCpuHistories).toHaveLength(2);

    // growth: 2 → 6 cores — must rebuild, not crash
    coresRef.n = 6;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(ctx.perCoreCpuHistories).toHaveLength(6);
  });
});
