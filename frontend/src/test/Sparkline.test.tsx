import React from "react";
import { render } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import Sparkline from "../components/shared/Sparkline";
import type { MetricHistoryPoint } from "../types/metrics";

describe("Sparkline — constant series centers at mid-height (I-3)", () => {
  it("10 identical values render at height/2, not the floor", () => {
    const data: MetricHistoryPoint[] = Array.from({ length: 10 }, (_, i) => ({
      slot: i,
      timestamp: new Date(Date.now() - (9 - i) * 1000),
      value: 8.3,
    }));
    const { container } = render(<Sparkline data={data} height={32} />);
    const path = container.querySelector("path[fill='none']");
    expect(path, "sparkline must render a stroke path").toBeTruthy();
    const d = path!.getAttribute("d")!;
    const pts = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) => m[2]);
    const ys = pts.map((y) => parseFloat(y));
    expect(
      ys.every((y) => y === 16),
      `all y must be 16 (height/2), got: [${ys.join(", ")}]`,
    ).toBe(true);
  });
});

describe("Sparkline — fixed domain prop (I-4)", () => {
  it("domain=[0,100] and value 27 renders at ~73% of height", () => {
    const data: MetricHistoryPoint[] = Array.from({ length: 5 }, (_, i) => ({
      slot: i,
      timestamp: new Date(Date.now() - (4 - i) * 1000),
      value: 27,
    }));
    const { container } = render(
      <Sparkline data={data} height={32} domain={[0, 100]} />,
    );
    const path = container.querySelector("path[fill='none']");
    expect(path, "sparkline must render a stroke path").toBeTruthy();
    const d = path!.getAttribute("d")!;
    const pts = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) => m[2]);
    const ys = pts.map((y) => parseFloat(y));
    // y = height - (27/100) * height = 32 * (1 - 0.27) = 23.36
    const expectedY = 32 * (1 - 27 / 100);
    expect(
      ys.every((y) => Math.abs(y - expectedY) < 0.01),
      `all y must be ~${expectedY.toFixed(2)}, got: [${ys.join(", ")}]`,
    ).toBe(true);
  });
});

describe("Sparkline — timestamp robustness across producer types (P3)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) a string timestamp positions correctly, not collapsed to the right edge", () => {
    vi.useFakeTimers();
    const now = Date.now();
    // Two points (not one) — a lone point takes a SEPARATE dot-rendering
    // special case that never calls computeX, so this must use 2+ points
    // to actually exercise the line being fixed. Simulates a point that
    // crossed a JSON boundary (ISO string, not a live Date instance) —
    // exactly what MetricsContext's `any`-typed cpuHistory could hand a
    // producer that forgot to convert it back.
    const data = [
      { slot: 0, timestamp: new Date(now - 25_000).toISOString(), value: 30 },
      { slot: 1, timestamp: new Date(now - 5_000).toISOString(), value: 50 },
    ] as unknown as MetricHistoryPoint[];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const path = container.querySelector("path[fill='none']");
    const d = path!.getAttribute("d") ?? "";
    // Extract the two x-coordinates from the path command(s).
    const xs = [...d.matchAll(/[ML]\s*([\d.]+)/g)].map((m) => Number(m[1]));
    expect(xs.length, `expected 2 coordinates in path, got d="${d}"`).toBe(2);
    // Old (buggy) code: both points fall back to `now`, so tie at x=200
    // (the full right edge). Fixed code: the two points sit ~25s and ~5s
    // into a 30s window — roughly 17% and 83% across — clearly apart and
    // clearly not both pinned to the edge.
    expect(
      Math.abs(xs[0] - xs[1]),
      `both points collapsed to the same x (both defaulted to 'now'), xs=${xs}`,
    ).toBeGreaterThan(20);
  });

  it("(b) gap-honesty still splits segments when timestamps are strings", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data = [
      { slot: 0, timestamp: new Date(now - 15_000).toISOString(), value: 40 },
      { slot: 1, timestamp: new Date(now - 5_000).toISOString(), value: 60 },
    ] as unknown as MetricHistoryPoint[];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const path = container.querySelector("path[fill='none']");
    const d = path!.getAttribute("d") ?? "";
    const mCount = (d.match(/M/g) ?? []).length;
    // Old code: both string timestamps fall back to `now`, tCurr-tPrev=0,
    // gap NEVER detected regardless of real elapsed time — 1 M, not 2.
    expect(
      mCount,
      `gap-honesty silently disabled for string timestamps, d="${d}"`,
    ).toBe(2);
  });
});

describe("Sparkline — gap honesty (I-5)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) two points >3s apart produce TWO M commands in the path", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data: MetricHistoryPoint[] = [
      { slot: 0, timestamp: new Date(now - 15_000), value: 40 },
      { slot: 1, timestamp: new Date(now - 5_000), value: 60 },
    ];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const path = container.querySelector("path[fill='none']");
    expect(path, "a stroke path must be rendered").toBeTruthy();
    const d = path!.getAttribute("d") ?? "";
    const mCount = (d.match(/M/g) ?? []).length;
    expect(mCount, `path must have 2 M commands for a gap, got d="${d}"`).toBe(
      2,
    );
  });

  it("(b) a single point renders a dot element, not a blank svg", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data: MetricHistoryPoint[] = [
      { slot: 0, timestamp: new Date(now - 1_000), value: 50 },
    ];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const dot = container.querySelector("circle");
    expect(dot, "a single point must render as a circle dot").toBeTruthy();
  });

  it("(c) empty history renders 'Currently Unavailable' text and no svg", () => {
    const { container, getByText } = render(
      <Sparkline data={[]} stretch height={32} windowMs={30_000} />,
    );
    expect(
      () => getByText("Currently Unavailable"),
      "empty history must show 'Currently Unavailable'",
    ).not.toThrow();
    const svg = container.querySelector("svg");
    expect(svg, "empty history must not render an svg").toBeNull();
  });
});

describe("Sparkline — windowMs time-anchored x-axis", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("three recent points anchor to the right sliver (x >= 85% of width)", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data: MetricHistoryPoint[] = [
      { slot: 0, timestamp: new Date(now - 3000), value: 30 },
      { slot: 1, timestamp: new Date(now - 2000), value: 60 },
      { slot: 2, timestamp: new Date(now - 1000), value: 45 },
    ];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const path = container.querySelector("path[fill='none']");
    expect(
      path,
      "sparkline must render a stroke path with 3 points",
    ).toBeTruthy();
    const d = path!.getAttribute("d")!;
    const xs = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    expect(
      xs.every((x) => x >= 85),
      `all x must be >= 85 (right sliver of the 30s window), got: [${xs.join(", ")}]`,
    ).toBe(true);
  });

  it("31 points spanning the full 30s spread across >= 90% of the width (pin)", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data: MetricHistoryPoint[] = Array.from({ length: 31 }, (_, i) => ({
      slot: i,
      timestamp: new Date(now - (30 - i) * 1000),
      value: i % 100,
    }));
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />,
    );
    const path = container.querySelector("path[fill='none']");
    expect(
      path,
      "sparkline must render a stroke path with 31 points",
    ).toBeTruthy();
    const d = path!.getAttribute("d")!;
    const xs = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    const span = Math.max(...xs) - Math.min(...xs);
    expect(
      span,
      `x spread must be >= 90 (full window width), got ${span}`,
    ).toBeGreaterThanOrEqual(90);
  });
});
