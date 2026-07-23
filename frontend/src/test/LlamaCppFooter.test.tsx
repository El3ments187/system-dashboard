import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import {
  LlamaCppHardwareFooter,
  updateRing,
  EMPTY_RING,
} from "../pages/llamacpp/FooterStat";
import type { ProcessMetrics } from "../types/metrics";

const BASE_PROPS = {
  cpuPct: 45,
  memUsed: 14,
  memTotal: 16,
  memPct: 87.5,
  gpuPct: 60,
  gpuTemp: 72,
  vramUsed: 20,
  vramTotal: 24,
  cpuHistory: [],
  memoryHistory: [],
  gpuHistory: [],
  gpuVramUtilHistory: [],
  gpuTempHistory: [],
};

const PROCESS_METRICS: ProcessMetrics = {
  pid: 12345,
  cpu_percent: 1.3,
  memory_kb: 6291456, // 6 GiB
  uptime_seconds: 3600,
  vram_mb: 15300,     // ~14.9 GiB
  gpu_util_percent: 87,
};

// ── G2: process source swap ──────────────────────────────────────────

describe("LlamaCppHardwareFooter — process source", () => {
  it("shows process CPU% when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={PROCESS_METRICS} />
    );
    // Process CPU: 1.3%  (system would be 45.0%)
    expect(screen.getByText("1.3%")).toBeInTheDocument();
    expect(screen.queryByText("45.0%")).not.toBeInTheDocument();
  });

  it("shows process GPU% when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={PROCESS_METRICS} />
    );
    // Process GPU: 87% (system would be 60%)
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.queryByText("60%")).not.toBeInTheDocument();
  });

  it("shows process RAM when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={PROCESS_METRICS} />
    );
    // 6291456 KB / 1024 / 1024 = 6.0 GB
    expect(screen.getByText(/6\.0 GB/)).toBeInTheDocument();
    // system would be 14 / 16
    expect(screen.queryByText(/14\.0.*16\.0/)).not.toBeInTheDocument();
  });

  it("shows process VRAM when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={PROCESS_METRICS} />
    );
    // 15300 MB / 1024 ≈ 14.9 GB
    expect(screen.getByText(/14\.9 GB/)).toBeInTheDocument();
    // system would show 20 / 24 GB
    expect(screen.queryByText(/20\.0.*24\.0/)).not.toBeInTheDocument();
  });

  it("GPU Temp tile is always device-wide (process has no per-process temp)", () => {
    render(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={PROCESS_METRICS} />
    );
    expect(screen.getByText("72°C")).toBeInTheDocument();
  });

  it("idle footer (no processMetrics) shows system values unchanged", () => {
    render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    expect(screen.getByText("45.0%")).toBeInTheDocument();
    expect(screen.getByText(/14\.0.*16\.0/)).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText(/20\.0.*24\.0/)).toBeInTheDocument();
    expect(screen.getByText("72°C")).toBeInTheDocument();
  });

  it("falls back to device GPU% with 'sys' suffix when process gpu_util_percent is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, gpu_util_percent: null };
    render(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={pm} />);
    // System gpuPct=60, shown with sys suffix
    expect(screen.getByText(/60.*sys/i)).toBeInTheDocument();
  });

  it("falls back to device VRAM with 'sys' suffix when process vram_mb is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, vram_mb: null };
    render(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={pm} />);
    // System vramUsed=20, vramTotal=24, shown with sys suffix
    expect(screen.getByText(/20\.0.*24\.0.*sys/i)).toBeInTheDocument();
  });
});

// ── I-2: ring ingests the displayed value, not the raw process field ──

describe("updateRing — ring ingests display value", () => {
  it("pushes device gpuPct when process gpu_util_percent is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, gpu_util_percent: null };
    const ring = updateRing(EMPTY_RING, pm, { gpuPct: 64, vramUsedGb: null, memTotal: 32, vramTotal: 24 });
    expect(ring.gpu[ring.gpu.length - 1]!.value).toBe(64);
  });

  it("pushes device vram as percent of vramTotal when process vram_mb is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, vram_mb: null };
    const ring = updateRing(EMPTY_RING, pm, { gpuPct: null, vramUsedGb: 20, memTotal: 32, vramTotal: 24 });
    // 20 GB used / 24 GB total = 83.33...% — ring stores percent, not raw GB
    const pct = ring.vram[ring.vram.length - 1]!.value;
    expect(Math.abs(pct - (20 / 24) * 100)).toBeLessThan(0.1);
  });

  it("ring.mem stores percent of memTotal, not raw GB (I-4 unit unification)", () => {
    // 8.3 GB of a 30.5 GB total → ~27.2%
    const memKb = 8.3 * 1024 * 1024;
    const pm: ProcessMetrics = { ...PROCESS_METRICS, memory_kb: memKb };
    const ring = updateRing(EMPTY_RING, pm, { gpuPct: null, vramUsedGb: null, memTotal: 30.5, vramTotal: 24 });
    const pct = ring.mem[ring.mem.length - 1]!.value;
    expect(Math.abs(pct - (8.3 / 30.5) * 100)).toBeLessThan(0.1);
  });
});

// ── G2b: sparkline stretch + 30s window ──────────────────────────────

describe("LlamaCppHardwareFooter — sparkline stretch and 30s window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function make120Points() {
    vi.useFakeTimers();
    const now = Date.now();
    // 120 points, 1 second apart, ending at frozen 'now'
    return Array.from({ length: 120 }, (_, i) => ({
      slot: i,
      timestamp: new Date(now - (119 - i) * 1000),
      value: i % 100,
    }));
  }

  it("sparkline SVG has preserveAspectRatio=none (stretch mode)", () => {
    const history = make120Points();
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        cpuHistory={history}
      />
    );
    // At least one SVG must have preserveAspectRatio="none"
    const svgs = document.querySelectorAll("svg");
    const hasStretch = Array.from(svgs).some(
      (svg) => svg.getAttribute("preserveAspectRatio") === "none"
    );
    expect(hasStretch, "at least one sparkline SVG must have preserveAspectRatio=none").toBe(true);
  });

  it("sparkline receives exactly the last 30 points (30s window)", () => {
    const history = make120Points();
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        cpuHistory={history}
      />
    );
    // The CPU sparkline is in the tile labelled "CPU"
    const cpuLabel = screen.getByText("CPU");
    const cpuTile = cpuLabel.closest("[data-accent-el]") as HTMLElement;
    const linePath = cpuTile?.querySelector("path[fill='none']");
    expect(linePath, "CPU tile must have a sparkline path").toBeTruthy();
    // path d: "Mx,y Lx,y ..." — one M/L command per data point
    const ptCount = ([...linePath!.getAttribute("d")!.matchAll(/[ML]/g)]).length;
    expect(ptCount, `expected 30 points (last 30s), got ${ptCount}`).toBe(30);
  });
});
