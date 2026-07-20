import type { MetricHistoryPoint } from "../types/metrics";

/**
 * Single-pass sliding-window update for a fixed-size metric ring buffer.
 *
 * Replaces the hot-path pattern
 *   reindexSlots([...h.slice(1), { slot: n-1, timestamp, value }])
 * which allocates an intermediate array, spreads every point once, then maps
 * every point into a second fresh object to rewrite `slot`. At steady state
 * that pattern runs for every tracked history on every poll — the per-core
 * histories alone (e.g. 32 cores x 120 points x 2 polls/sec) made it the
 * hottest allocator in the app.
 *
 * This builds the next buffer in one loop with exactly one array and one
 * object per point, no intermediate array, no spread iteration. Output is
 * deep-equal to the old pattern (guarded by slideWindow.test.ts), previous
 * buffer and points are never mutated.
 */
export function slideWindow(
  prev: MetricHistoryPoint[],
  value: number | null,
  timestamp: Date,
): MetricHistoryPoint[] {
  const n = prev.length;
  const next: MetricHistoryPoint[] = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const p = prev[i + 1];
    next[i] = { slot: i, timestamp: p.timestamp, value: p.value };
  }
  next[n - 1] = { slot: n - 1, timestamp, value };
  return next;
}
