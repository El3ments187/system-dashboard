import type { LogLine } from "../types/metrics";

// Matches LogConsole.tsx's MAX_ERROR_RETENTION — kept as a separate
// constant here since this module has no dependency on that component,
// but the VALUE should stay in sync (both cap how many old errors survive
// beyond their normal recency window).
const DEFAULT_ERROR_CAP = 500;

export function appendPending(
  buffer: LogLine[],
  line: LogLine,
  cap: number,
  errorCap: number = DEFAULT_ERROR_CAP,
): LogLine[] {
  const next = buffer.slice();
  next.push(line);
  if (next.length <= cap) return next;
  const dropped = next.slice(0, next.length - cap);
  // Common case (the vast majority of calls in normal operation): nothing
  // in the small dropped portion is an error — behave exactly like the
  // original simple slice, no extra allocation. Only pay for the
  // Set-based dedup check below on the rare path where an error is
  // actually about to be lost.
  if (!dropped.some((l) => l.level === "error")) {
    return next.slice(next.length - cap);
  }
  // User-reported: "I can no longer see the errors." A blind slice(-cap)
  // drops whichever lines are oldest, error or not, discarding exactly
  // the diagnostic information most likely to explain why something later
  // went wrong. Preserve error lines beyond the normal recency window, up
  // to errorCap, so a genuinely error-spewing burst still can't grow this
  // unbounded.
  const recent = next.slice(next.length - cap);
  const recentSet = new Set(recent);
  const droppedErrors = dropped.filter(
    (l) => l.level === "error" && !recentSet.has(l),
  );
  if (droppedErrors.length === 0) return recent;
  const preservedErrors = droppedErrors.slice(-errorCap);
  return [...preservedErrors, ...recent];
}
