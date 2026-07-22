/**
 * Item 3 (Chart Cadence) — TDD probe.
 *
 * RED against current useCombinedMetrics: chart histories update on every
 * 500 ms tick (same as numeric readouts) — cpuHistories reference changes
 * on BOTH the even and odd tick.
 *
 * GREEN after cadence gating: chart histories update every other tick (1 Hz)
 * while cpuValues still updates every tick (2 Hz).
 *
 * Cadence contract:
 *   tick 0 (t=0, even)  → charts update, values update
 *   tick 1 (t=500, odd) → charts SKIP,   values update
 *   tick 2 (t=1000, even) → charts update, values update
 */
import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useCombinedMetrics } from "../hooks/useCombinedMetrics";

function makeFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      cpu: {
        utilization_percent: 10,
        temperature_celsius: 50,
        frequency_mhz: 3000,
        physical_cores: 2,
        threads: 4,
        load_1m: 1.0,
        load_5m: 0.8,
        load_15m: 0.6,
        freq_max_mhz: 5000,
        cores: [
          { core_id: 0, utilization_percent: 10 },
          { core_id: 1, utilization_percent: 20 },
        ],
      },
      memory: {
        utilization_percent: 50,
        used_gb: 8,
        total_gb: 16,
        swap_used_gb: 0,
        swap_total_gb: 4,
      },
      gpu: [
        {
          name: "Test GPU",
          utilization_percent: 30,
          temperature_celsius: 60,
          vram_used_gb: 4,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 300,
        },
      ],
      storage_devices: [],
      storage_history: [],
      system: null,
      timestamp: "2026-07-22 00:00:00 UTC",
    }),
  });
}

describe("chart cadence (Item 3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("(c) cpuHistories skips update on odd tick; cpuValues updates every tick", async () => {
    global.fetch = makeFetchMock() as any;

    const { result } = renderHook(() => useCombinedMetrics(500, false));

    // Let the immediate tick (t=0, even) complete — charts and values both update
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const snap0_histories = result.current.cpuHistories;
    const snap0_values = result.current.cpuValues;

    // Advance to odd tick (t=500 ms) — values update, charts must NOT
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const snap1_histories = result.current.cpuHistories;
    const snap1_values = result.current.cpuValues;

    // Advance to next even tick (t=1000 ms) — both update
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const snap2_histories = result.current.cpuHistories;

    // Numeric values must update every tick (2 Hz)
    expect(
      snap0_values,
      "cpuValues must be populated after tick 0",
    ).not.toEqual(new Array(9).fill(null));
    expect(snap1_values, "cpuValues must change on odd tick (2 Hz)").not.toBe(
      snap0_values,
    );

    // Chart histories must NOT change on odd tick (cadence gate: 1 Hz)
    expect(
      snap1_histories,
      "cpuHistories must NOT update on odd tick — chart cadence gate (1 Hz)",
    ).toBe(snap0_histories);

    // Chart histories MUST change on next even tick (confirming gate lifts)
    expect(
      snap2_histories,
      "cpuHistories must update on even tick (1 Hz chart update)",
    ).not.toBe(snap0_histories);
  });
});
