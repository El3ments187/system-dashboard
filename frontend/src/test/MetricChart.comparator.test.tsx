import { arePropsEqual } from "../charts/MetricChart";

const data = [{ slot: 0, timestamp: new Date(0), value: 1 }];
const base = { data, title: "t", timeFrame: "60s" } as any;

it("skips re-render when accent has equal color/glow but a new identity", () => {
  const a = { ...base, accent: { color: "#111", glow: "#222" } };
  const b = { ...base, accent: { color: "#111", glow: "#222" } };
  expect(arePropsEqual(a, b)).toBe(true);
});

it("re-renders when a stable scalar prop actually changes", () => {
  const a = { ...base, accent: { color: "#111", glow: "#222" }, title: "t" };
  const b = { ...base, accent: { color: "#111", glow: "#222" }, title: "u" };
  expect(arePropsEqual(a, b)).toBe(false);
});
