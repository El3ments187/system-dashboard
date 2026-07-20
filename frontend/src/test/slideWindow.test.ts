import { slideWindow } from "../utils/slideWindow";
import type { MetricHistoryPoint } from "../types/metrics";

// Reference implementation: the exact pattern being replaced.
function reference(
  h: MetricHistoryPoint[],
  value: number | null,
  ts: Date,
): MetricHistoryPoint[] {
  return [...h.slice(1), { slot: h.length - 1, timestamp: ts, value }].map(
    (p, idx) => ({ ...p, slot: idx }),
  );
}

const mk = (n: number): MetricHistoryPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    slot: i,
    timestamp: new Date(1000 + i * 500),
    value: i % 7 === 0 ? null : i,
  }));

describe("slideWindow (single-pass ring update)", () => {
  it("produces output deep-equal to the slice+reindex pattern", () => {
    const ts = new Date(999999);
    for (const n of [1, 2, 5, 120]) {
      const h = mk(n);
      expect(slideWindow(h, 42, ts)).toEqual(reference(h, 42, ts));
      expect(slideWindow(h, null, ts)).toEqual(reference(h, null, ts));
    }
  });

  it("does not mutate the previous buffer or its points", () => {
    const h = mk(10);
    const snapshot = JSON.stringify(h);
    slideWindow(h, 1, new Date());
    expect(JSON.stringify(h)).toBe(snapshot);
  });

  it("keeps slots contiguous 0..n-1 with the new value last", () => {
    const out = slideWindow(mk(120), 55, new Date(5));
    expect(out).toHaveLength(120);
    expect(out.map((p) => p.slot)).toEqual(out.map((_, i) => i));
    expect(out[119].value).toBe(55);
    expect(out[0].value).toBe(mk(120)[1].value);
  });
});
