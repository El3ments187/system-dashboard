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
    expect(ys.every((y) => y === 16), `all y must be 16 (height/2), got: [${ys.join(", ")}]`).toBe(
      true
    );
  });
});

describe("Sparkline — fixed domain prop (I-4)", () => {
  it("domain=[0,100] and value 27 renders at ~73% of height", () => {
    const data: MetricHistoryPoint[] = Array.from({ length: 5 }, (_, i) => ({
      slot: i,
      timestamp: new Date(Date.now() - (4 - i) * 1000),
      value: 27,
    }));
    const { container } = render(<Sparkline data={data} height={32} domain={[0, 100]} />);
    const path = container.querySelector("path[fill='none']");
    expect(path, "sparkline must render a stroke path").toBeTruthy();
    const d = path!.getAttribute("d")!;
    const pts = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) => m[2]);
    const ys = pts.map((y) => parseFloat(y));
    // y = height - (27/100) * height = 32 * (1 - 0.27) = 23.36
    const expectedY = 32 * (1 - 27 / 100);
    expect(
      ys.every((y) => Math.abs(y - expectedY) < 0.01),
      `all y must be ~${expectedY.toFixed(2)}, got: [${ys.join(", ")}]`
    ).toBe(true);
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
      <Sparkline data={data} stretch height={32} windowMs={30_000} />
    );
    const path = container.querySelector("path[fill='none']");
    expect(path, "a stroke path must be rendered").toBeTruthy();
    const d = path!.getAttribute("d") ?? "";
    const mCount = (d.match(/M/g) ?? []).length;
    expect(mCount, `path must have 2 M commands for a gap, got d="${d}"`).toBe(2);
  });

  it("(b) a single point renders a dot element, not a blank svg", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const data: MetricHistoryPoint[] = [
      { slot: 0, timestamp: new Date(now - 1_000), value: 50 },
    ];
    const { container } = render(
      <Sparkline data={data} stretch height={32} windowMs={30_000} />
    );
    const dot = container.querySelector("circle");
    expect(dot, "a single point must render as a circle dot").toBeTruthy();
  });

  it("(c) empty history renders 'Currently Unavailable' text and no svg", () => {
    const { container, getByText } = render(
      <Sparkline data={[]} stretch height={32} windowMs={30_000} />
    );
    expect(
      () => getByText("Currently Unavailable"),
      "empty history must show 'Currently Unavailable'"
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
      <Sparkline data={data} stretch height={32} windowMs={30_000} />
    );
    const path = container.querySelector("path[fill='none']");
    expect(path, "sparkline must render a stroke path with 3 points").toBeTruthy();
    const d = path!.getAttribute("d")!;
    const xs = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) => parseFloat(m[1]));
    expect(
      xs.every((x) => x >= 85),
      `all x must be >= 85 (right sliver of the 30s window), got: [${xs.join(", ")}]`
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
      <Sparkline data={data} stretch height={32} windowMs={30_000} />
    );
    const path = container.querySelector("path[fill='none']");
    expect(path, "sparkline must render a stroke path with 31 points").toBeTruthy();
    const d = path!.getAttribute("d")!;
    const xs = [...d.matchAll(/[ML]([0-9.-]+),([0-9.-]+)/g)].map((m) => parseFloat(m[1]));
    const span = Math.max(...xs) - Math.min(...xs);
    expect(
      span,
      `x spread must be >= 90 (full window width), got ${span}`
    ).toBeGreaterThanOrEqual(90);
  });
});
