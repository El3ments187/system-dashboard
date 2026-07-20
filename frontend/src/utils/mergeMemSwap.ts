import type { MetricHistoryPoint } from "../types/metrics";

export interface MemSwapPoint {
  slot: number;
  timestamp: Date;
  memory: number | null;
  swap: number | null;
}

/**
 * Merge the memory and swap history buffers into one chart series.
 *
 * Replaces OverviewPage's O(n^2) join: for each of ~120 slots it called
 * Array.find() over both 120-point buffers (~29k comparisons per memory poll,
 * re-run every second). Map-based lookups make it a single pass per buffer.
 * Output is deep-equal to the original (guarded by mergeMemSwap.test.ts),
 * including rounding, null handling, and slot ordering.
 */
export function mergeMemSwap(
  memoryHistory: MetricHistoryPoint[],
  swapHistory: MetricHistoryPoint[],
): MemSwapPoint[] {
  const memBySlot = new Map<number, MetricHistoryPoint>();
  for (const p of memoryHistory) memBySlot.set(p.slot, p);
  const swpBySlot = new Map<number, MetricHistoryPoint>();
  for (const p of swapHistory) swpBySlot.set(p.slot, p);

  const allSlots = new Set<number>();
  for (const p of memoryHistory) allSlots.add(p.slot);
  for (const p of swapHistory) allSlots.add(p.slot);

  const result: MemSwapPoint[] = [];
  for (const slot of allSlots) {
    const memPt = memBySlot.get(slot);
    const swpPt = swpBySlot.get(slot);
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
