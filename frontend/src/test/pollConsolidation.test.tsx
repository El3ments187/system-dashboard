/**
 * Item 1 (Poll Consolidation) — TDD probe.
 *
 * RED against the current multi-hook MetricsProvider: each of the 4 independent
 * polling hooks fires its own setState, so a consumer sees many renders/sec.
 * GREEN after MetricsProvider is migrated to useCombinedMetrics: all setStates
 * land in one synchronous block → React 18 batches them → ≤ 1 render per tick.
 *
 * Assertion (a): ≤ 6 consumer re-renders in 3 s (≤ 2/s at 2 Hz polling).
 * Assertion (b): every metrics fetch URL is /api/metrics/all (not individual endpoints).
 */
import { render, act } from "@testing-library/react";
import { vi } from "vitest";
import React, { useContext } from "react";
import { MetricsContext, MetricsProvider } from "../context/MetricsContext";
import { LiveDataControlsProvider } from "../context/LiveDataControlsContext";

function makeFetchMock() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/metrics/all")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          cpu: {
            utilization_percent: 10,
            temperature_celsius: 50,
            frequency_mhz: 3000,
            physical_cores: 4,
            threads: 8,
            load_1m: 1.0,
            load_5m: 0.8,
            load_15m: 0.6,
            freq_max_mhz: 5000,
            cores: [{ core_id: 0, utilization_percent: 10 }],
          },
          memory: {
            utilization_percent: 50,
            used_gb: 8,
            total_gb: 16,
            swap_used_gb: 0,
            swap_total_gb: 4,
          },
          gpu: [],
          storage_devices: [],
          storage_history: [],
          timestamp: "2026-07-22 00:00:00 UTC",
        }),
      });
    }
    // Individual endpoint fallback (current code path — should not be called after migration)
    if (url.includes("/api/metrics/storage")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { utilization_percent: 10 } }),
    });
  });
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LiveDataControlsProvider>
    <MetricsProvider>{children}</MetricsProvider>
  </LiveDataControlsProvider>
);

describe("poll consolidation (Item 1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("(a) consumer re-renders ≤ 6 times in 3 s — ≤ 2/s at 2 Hz tick", async () => {
    global.fetch = makeFetchMock() as any;

    let renderCount = 0;
    function CountingConsumer() {
      renderCount++;
      useContext(MetricsContext);
      return null;
    }

    render(
      <Wrapper>
        <CountingConsumer />
      </Wrapper>,
    );

    // Reset after mount renders (loading state etc.)
    renderCount = 0;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(
      renderCount,
      `consumer re-rendered ${renderCount} times in 3 s — should be ≤ 6 (≤ 2/s)`,
    ).toBeLessThanOrEqual(6);
  });

  it("(b) only /api/metrics/all is fetched — no individual metric endpoints", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as any;

    render(<Wrapper />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    const metricsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/metrics"),
    );
    expect(metricsCalls.length).toBeGreaterThan(0);
    const allAreCombined = metricsCalls.every((c) =>
      String(c[0]).includes("/all"),
    );
    expect(
      allAreCombined,
      "Expected only /api/metrics/all calls, got: " +
        metricsCalls.map((c) => c[0]).join(", "),
    ).toBe(true);
  });
});
