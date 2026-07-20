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
