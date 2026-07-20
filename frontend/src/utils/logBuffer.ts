import type { LogLine } from "../types/metrics";

export function appendPending(
  buffer: LogLine[],
  line: LogLine,
  cap: number,
): LogLine[] {
  const next =
    buffer.length >= cap
      ? buffer.slice(buffer.length - cap + 1)
      : buffer.slice();
  next.push(line);
  return next;
}
