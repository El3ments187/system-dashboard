import React, { useState } from "react";
import { Cpu, MemoryStick, Gauge, Database, Thermometer } from "lucide-react";
import Sparkline from "../../components/shared/Sparkline";
import type { MetricHistoryPoint, ProcessMetrics } from "../../types/metrics";

const FOOTER_WINDOW_MS = 30_000;

function sliceHistory(
  history: MetricHistoryPoint[] | null | undefined,
): MetricHistoryPoint[] {
  if (!history) return [];
  const cutoff = Date.now() - FOOTER_WINDOW_MS;
  return history.filter(
    (p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff,
  );
}

function formatProcessGpu(procGpu: number | null): string {
  // User ruling: there must NEVER be a "sys" suffix anywhere in this
  // footer. Previously, if the per-process GPU% specifically wasn't
  // available (a driver limitation), this silently substituted the
  // device-wide reading labeled "X% sys" — a partial exception to the
  // broader "llama's own value or nothing" rule. Now: no exception.
  if (procGpu != null) return `${procGpu.toFixed(0)}%`;
  return "—";
}

function formatProcessVram(vramMb: number | null): string {
  if (vramMb != null) return `${(vramMb / 1024).toFixed(1)} GB`;
  return "—";
}

type ProcRing = {
  cpu: MetricHistoryPoint[];
  mem: MetricHistoryPoint[];
  gpu: MetricHistoryPoint[];
  vram: MetricHistoryPoint[];
};

export const EMPTY_RING: ProcRing = { cpu: [], mem: [], gpu: [], vram: [] };

type SysFallback = {
  // gpuPct/vramUsedGb are no longer READ inside updateRing (Step W removed
  // the sys-fallback ring push entirely) but are kept in this type
  // deliberately, not as an oversight: 3 existing test call sites already
  // construct objects with these fields, and TS's excess-property check
  // would force editing every one of them for a purely cosmetic gain —
  // the fields are already provably inert at runtime (see Step W's
  // "does NOT push a device-fallback point" tests, which pass regardless
  // of these values). Real cleanup, real risk, zero behavioral benefit —
  // left alone on purpose.
  gpuPct: number | null | undefined;
  vramUsedGb: number | null | undefined;
  memTotal: number | null | undefined;
  vramTotal: number | null | undefined;
};

export function updateRing(
  ring: ProcRing,
  pm: ProcessMetrics,
  sys: SysFallback,
): ProcRing {
  const now = Date.now();
  const cutoff = now - FOOTER_WINDOW_MS;
  const memTotal = sys.memTotal ?? 1;
  const vramTotal = sys.vramTotal ?? 1;
  const evict = (arr: MetricHistoryPoint[]) =>
    arr.filter(
      (p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff,
    );
  const pt = (val: number): MetricHistoryPoint => ({
    slot: 0,
    timestamp: new Date(now),
    value: val,
  });
  // I-2's rule (the ring must ingest exactly what the tile displays) now
  // means: when the per-process GPU%/VRAM reading isn't available, the
  // tile shows "—", so the ring must NOT push a point either — pushing a
  // sys-fallback value here would put a real number on the graph for a
  // metric the tile is simultaneously calling unavailable. Skipping the
  // push (rather than pushing a fabricated 0 or the device value) leaves
  // a genuine gap, which Step I-5's gap-honesty logic already renders
  // correctly as a break in the line, not a lie about continuity.
  const gpuPoints =
    pm.gpu_util_percent != null
      ? [...evict(ring.gpu), pt(pm.gpu_util_percent)]
      : evict(ring.gpu);
  const vramPoints =
    pm.vram_mb != null
      ? [...evict(ring.vram), pt((pm.vram_mb / 1024 / vramTotal) * 100)]
      : evict(ring.vram);
  return {
    cpu: [...evict(ring.cpu), pt(pm.cpu_percent)],
    mem: [
      ...evict(ring.mem),
      pt((pm.memory_kb / (1024 * 1024) / memTotal) * 100),
    ],
    gpu: gpuPoints,
    vram: vramPoints,
  };
}

export function FooterStat({
  icon,
  label,
  value,
  color,
  history,
  domain,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  history?: MetricHistoryPoint[];
  domain?: [number, number];
}) {
  return (
    <div
      data-accent-el=""
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flex: 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // User-reported: "the bar is physically moving, shifting side
          // to side." tabular-nums (below) keeps SAME-length numbers
          // stable, but flexShrink:0 alone doesn't reserve any actual
          // width — if the value's CHARACTER COUNT changes even briefly
          // (crossing a digit boundary, a decimal point appearing or
          // disappearing), this column is forced wider, and since all
          // five tiles share flex:1 in one row, the whole row has to
          // redistribute space to compensate — every tile visibly
          // shifting, not just this one. A real reserved minWidth (not
          // just shrink-prevention) makes the column's footprint
          // constant regardless of what text is actually rendered
          // inside it. Sized generously for the longest realistic value
          // across any of the five metrics (e.g. "9999.9%", "999.9 GB").
          minWidth: 72,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      </div>
      {history && (
        <div style={{ flex: 1, minWidth: 0, height: 32 }}>
          <Sparkline
            data={history}
            color={color}
            stretch
            height={32}
            windowMs={FOOTER_WINDOW_MS}
            domain={domain ?? [0, 100]}
          />
        </div>
      )}
    </div>
  );
}

export interface LlamaCppHardwareFooterProps {
  cpuPct: number | null | undefined;
  memUsed: number | null | undefined;
  memTotal: number | null | undefined;
  memPct: number | null | undefined;
  gpuPct: number | null | undefined;
  gpuTemp: number | null | undefined;
  vramUsed: number | null | undefined;
  vramTotal: number | null | undefined;
  cpuHistory: MetricHistoryPoint[];
  memoryHistory: MetricHistoryPoint[];
  gpuHistory: MetricHistoryPoint[];
  gpuVramUtilHistory: MetricHistoryPoint[];
  gpuTempHistory: MetricHistoryPoint[];
  processMetrics?: ProcessMetrics | null;
}

export function LlamaCppHardwareFooter({
  memTotal,
  gpuPct,
  gpuTemp,
  vramUsed,
  vramTotal,
  gpuTempHistory,
  processMetrics,
}: LlamaCppHardwareFooterProps) {
  // Accumulate a per-process sparkline ring via React's "setState during render
  // when a prop changes" pattern (react.dev/learn/you-might-not-need-an-effect
  // "Adjusting some state when a prop changes"). React re-renders once with the
  // new ring after each processMetrics update; prevProc guards against infinite loops.
  const [ring, setRing] = useState<ProcRing>(EMPTY_RING);
  const [prevProc, setPrevProc] = useState<ProcessMetrics | null | undefined>(
    undefined,
  );

  if (processMetrics !== prevProc) {
    setPrevProc(processMetrics);
    const wasProcess = prevProc != null;
    if (wasProcess !== (processMetrics != null)) {
      setRing(EMPTY_RING);
    } else if (processMetrics != null) {
      setRing((prev) =>
        updateRing(prev, processMetrics, {
          gpuPct,
          vramUsedGb: vramUsed,
          memTotal,
          vramTotal,
        }),
      );
    }
  }

  const isProcess = processMetrics != null;

  // User ruling: these four tiles must show either llama's OWN usage, or
  // nothing at all — never a system-wide number that could be mistaken
  // for llama's. `null`/empty-history here isn't a missing-data bug, it's
  // the deliberate absence: the existing "—" (value) and "Currently
  // Unavailable" (Sparkline's own zero-point empty state, already proven
  // for Generation/Prompt Speed) do the rest with no new UI needed.
  const dispCpuPct = isProcess ? processMetrics.cpu_percent : null;
  const dispMemValue = isProcess
    ? `${(processMetrics.memory_kb / 1024 / 1024).toFixed(1)} GB`
    : null;
  const dispGpuValue = isProcess
    ? formatProcessGpu(processMetrics.gpu_util_percent)
    : null;
  const dispVramValue = isProcess
    ? formatProcessVram(processMetrics.vram_mb)
    : null;

  // Same ruling applies to the graphs: an empty array is what drives
  // Sparkline's existing "Currently Unavailable" state (0 points), the
  // exact text already shown for Generation/Prompt Speed when offline —
  // reusing that mechanism rather than falling back to system history.
  const cpuHist = isProcess ? ring.cpu : [];
  const memHist = isProcess ? ring.mem : [];
  const gpuHist = isProcess ? ring.gpu : [];
  const vramHist = isProcess ? ring.vram : [];
  // GPU TEMP is intentionally untouched (still always device-wide,
  // regardless of isProcess) — per the original design ruling: temperature
  // has no "per-process" reading to distinguish it from; it's always a
  // real physical measurement of the card, not usage attribution.
  const tempHist = sliceHistory(gpuTempHistory);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderTop: "1px solid var(--border-color)",
        padding: "8px 14px",
        background: "var(--bg-secondary)",
      }}
    >
      <FooterStat
        icon={<Cpu size={13} />}
        label="CPU"
        value={dispCpuPct != null ? `${dispCpuPct.toFixed(1)}%` : "—"}
        color="var(--metric-cpu)"
        history={cpuHist}
      />
      <FooterStat
        icon={<MemoryStick size={13} />}
        label="RAM"
        value={dispMemValue ?? "—"}
        color="var(--metric-ram)"
        history={memHist}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={dispGpuValue ?? "—"}
        color="var(--metric-gpu)"
        history={gpuHist}
      />
      <FooterStat
        icon={<Database size={13} />}
        label="VRAM"
        value={dispVramValue ?? "—"}
        color="var(--metric-vram)"
        history={vramHist}
      />
      <FooterStat
        icon={<Thermometer size={13} />}
        label="GPU Temp"
        value={gpuTemp != null ? `${gpuTemp.toFixed(0)}°C` : "—"}
        color="var(--metric-temp)"
        history={tempHist}
        domain={[20, 120]}
      />
    </div>
  );
}
