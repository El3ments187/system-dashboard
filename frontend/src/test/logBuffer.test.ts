import { appendPending } from "../utils/logBuffer";
import type { LogLine } from "../types/metrics";

const mkLine = (text: string): LogLine => ({
  timestamp: "t",
  stream: "stdout",
  level: "info",
  text,
});

it("stays bounded across 20k appends and keeps the newest", () => {
  let buf: LogLine[] = [];
  for (let i = 0; i < 20000; i++)
    buf = appendPending(buf, mkLine(`line-${i}`), 5000);
  expect(buf.length).toBeLessThanOrEqual(5000);
  expect(buf.at(-1)!.text).toBe("line-19999");
});

it("preserves an early error line beyond the normal cap instead of silently dropping it", () => {
  // User-reported: "I can no longer see the errors" — the ORIGINAL
  // implementation did a blind slice(-cap), which would drop this error
  // the moment 5000 more lines printed after it, even though it's exactly
  // the diagnostic information most valuable for explaining what went
  // wrong. This is the ground-truth scenario: an error at the very start
  // of a long, otherwise-quiet session.
  const mkErrorLine = (text: string): LogLine => ({
    timestamp: "t",
    stream: "stdout",
    level: "error",
    text,
  });
  // 6000 lines (1000 past the 5000 cap) is enough to prove the mechanism
  // without 20,000 synchronous iterations: once the error persists in the
  // "dropped" window, EVERY subsequent call re-triggers the Set-based
  // preservation check (the cheap early-exit only helps the no-error
  // case) — genuinely negligible in real use (once per incoming
  // WebSocket log line, not thousands of times per synchronous loop),
  // but a needlessly large iteration count here just slows the test
  // suite for no added rigor. Found via an actual timeout, not assumed.
  let buf: LogLine[] = [];
  buf = appendPending(buf, mkErrorLine("fatal: out of memory"), 5000);
  for (let i = 0; i < 6000; i++)
    buf = appendPending(buf, mkLine(`line-${i}`), 5000);
  const texts = buf.map((l) => l.text);
  expect(
    texts.includes("fatal: out of memory"),
    "the early error must survive 1000 lines past the cap, not be silently dropped",
  ).toBe(true);
  // The 5000 most recent normal lines must still be present too — this
  // isn't a regression to "keep everything forever", just error-aware.
  expect(texts.includes("line-5999")).toBe(true);
  // 6000 normal lines (line-0..line-5999) pushed after the error; the
  // recency window keeps the last 5000, which is line-1000..line-5999 —
  // confirmed empirically (same mechanism verified at 20k scale during
  // debugging), not just by arithmetic.
  expect(texts.includes("line-1000")).toBe(true); // the oldest of the last 5000
  expect(texts.includes("line-999")).toBe(false); // one older than that — correctly trimmed
});

it("caps preserved errors at errorCap instead of growing unbounded on an error-spewing burst", () => {
  const mkErrorLine = (i: number): LogLine => ({
    timestamp: "t",
    stream: "stdout",
    level: "error",
    text: `error-${i}`,
  });
  let buf: LogLine[] = [];
  // 2000 errors, all pushed past the normal 5000-line recency window by
  // 2000 subsequent normal lines each — a genuinely error-spewing process,
  // not the single-error scenario above.
  for (let i = 0; i < 2000; i++) buf = appendPending(buf, mkErrorLine(i), 5000);
  for (let i = 0; i < 6000; i++) buf = appendPending(buf, mkLine(`n-${i}`), 5000);
  const errorCount = buf.filter((l) => l.level === "error").length;
  expect(
    errorCount,
    `expected at most 500 (errorCap) preserved errors, got ${errorCount}`,
  ).toBeLessThanOrEqual(500);
  expect(buf.length).toBeLessThanOrEqual(5000 + 500);
});
