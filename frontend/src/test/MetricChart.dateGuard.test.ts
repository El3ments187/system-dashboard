import { formatTime, resolveTimestampMs } from "../charts/MetricChart";

it("tolerates a string timestamp without throwing", () => {
  expect(() => formatTime("2026-07-20T12:00:00Z" as any)).not.toThrow();
  expect(
    resolveTimestampMs({ timestamp: "2026-07-20T12:00:00Z" } as any),
  ).toBeGreaterThan(0);
});
