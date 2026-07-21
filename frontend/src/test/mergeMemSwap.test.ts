import { mergeMemSwap } from "../utils/mergeMemSwap";
import type { MetricHistoryPoint } from "../types/metrics";

// Reference: the exact O(n^2) algorithm being replaced (from OverviewPage).
function reference(
  memoryHistory: MetricHistoryPoint[],
  swapHistory: MetricHistoryPoint[],
) {
  const result: any[] = [];
  const allSlots = new Set([
    ...memoryHistory.map((p: any) => p.slot),
    ...swapHistory.map((p: any) => p.slot),
  ]);
  for (const slot of allSlots) {
    const memPt = memoryHistory.find((p: any) => p.slot === slot);
    const swpPt = swapHistory.find((p: any) => p.slot === slot);
    const ts = memPt?.timestamp ? new Date(memPt.timestamp) : new Date();
    result.push({
      slot,
      timestamp: ts,
      memory: memPt?.value != null ? Math.round(memPt.value * 10) / 10 : null,
      swap: swpPt?.value != null ? Math.round(swpPt.value * 10) / 10 : null,
    });
  }
  return result.sort((a, b) => a.slot - b.slot);
}

const mk = (
  n: number,
  base: number,
  holes: number[] = [],
): MetricHistoryPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    slot: i,
    timestamp: new Date(1000 + i * 500),
    value: holes.includes(i) ? null : base + i * 0.33,
  }));

describe("mergeMemSwap (O(n) join)", () => {
  it("matches the O(n^2) reference on aligned buffers", () => {
    const mem = mk(120, 10),
      swp = mk(120, 3, [5, 17]);
    expect(mergeMemSwap(mem, swp)).toEqual(reference(mem, swp));
  });

  it("matches on mismatched slot sets (one side missing slots)", () => {
    const mem = mk(120, 10);
    const swp = mk(60, 3); // shorter buffer: slots 60..119 only in mem
    expect(mergeMemSwap(mem, swp)).toEqual(reference(mem, swp));
  });

  it("handles empty inputs", () => {
    expect(mergeMemSwap([], [])).toEqual([]);
    const mem = mk(3, 1);
    expect(mergeMemSwap(mem, []).map((r) => r.memory)).toEqual(
      reference(mem, []).map((r) => r.memory),
    );
  });
});
