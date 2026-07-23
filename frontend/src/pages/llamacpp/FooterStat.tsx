import React, { useState } from "react";
import { Cpu, MemoryStick, Gauge, Database, Thermometer } from "lucide-react";
import Sparkline from "../../components/shared/Sparkline";
import type { MetricHistoryPoint, ProcessMetrics } from "../../types/metrics";

const FOOTER_WINDOW_MS = 30_000;

function sliceHistory(history: MetricHistoryPoint[] | null | undefined): MetricHistoryPoint[] {
  if (!history) return [];
  const cutoff = Date.now() - FOOTER_WINDOW_MS;
  return history.filter(
    (p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff
  );
}

function formatSysMem(
  memUsed: number | null | undefined,
  memTotal: number | null | undefined,
  memPct: number | null | undefined
): string {
  if (memUsed == null || memTotal == null) return "—";
  return `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB · ${memPct?.toFixed(0) ?? "—"}%`;
}

function formatSysGpu(gpuPct: number | null | undefined): string {
  if (gpuPct == null) return "—";
  return `${gpuPct.toFixed(0)}%`;
}

function formatProcessGpu(
  procGpu: number | null,
  sysPct: number | null | undefined
): string {
  if (procGpu != null) return `${procGpu.toFixed(0)}%`;
  if (sysPct != null) return `${sysPct.toFixed(0)}% sys`;
  return "—";
}

function formatSysVram(
  vramUsed: number | null | undefined,
  vramTotal: number | null | undefined
): string {
  if (vramUsed == null || vramTotal == null) return "—";
  return `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`;
}

function formatProcessVram(
  vramMb: number | null,
  sysUsed: number | null | undefined,
  sysTotal: number | null | undefined
): string {
  if (vramMb != null) return `${(vramMb / 1024).toFixed(1)} GB`;
  if (sysUsed != null && sysTotal != null)
    return `${sysUsed.toFixed(1)} / ${sysTotal.toFixed(1)} GB sys`;
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
  gpuPct: number | null | undefined;
  vramUsedGb: number | null | undefined;
  memTotal: number | null | undefined;
  vramTotal: number | null | undefined;
};

export function updateRing(ring: ProcRing, pm: ProcessMetrics, sys: SysFallback): ProcRing {
  const now = Date.now();
  const cutoff = now - FOOTER_WINDOW_MS;
  const memTotal = sys.memTotal ?? 1;
  const vramTotal = sys.vramTotal ?? 1;
  const evict = (arr: MetricHistoryPoint[]) =>
    arr.filter((p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff);
  const pt = (val: number): MetricHistoryPoint => ({
    slot: 0,
    timestamp: new Date(now),
    value: val,
  });
  return {
    cpu: [...evict(ring.cpu), pt(pm.cpu_percent)],
    mem: [...evict(ring.mem), pt((pm.memory_kb / (1024 * 1024)) / memTotal * 100)],
    gpu: [...evict(ring.gpu), pt(pm.gpu_util_percent ?? sys.gpuPct ?? 0)],
    vram: [...evict(ring.vram), pt(
      pm.vram_mb != null
        ? (pm.vram_mb / 1024) / vramTotal * 100
        : (sys.vramUsedGb ?? 0) / vramTotal * 100
    )],
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
          minWidth: 0,
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
          <Sparkline data={history} color={color} stretch height={32} windowMs={FOOTER_WINDOW_MS} domain={domain ?? [0, 100]} />
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
  cpuPct,
  memUsed,
  memTotal,
  memPct,
  gpuPct,
  gpuTemp,
  vramUsed,
  vramTotal,
  cpuHistory,
  memoryHistory,
  gpuHistory,
  gpuVramUtilHistory,
  gpuTempHistory,
  processMetrics,
}: LlamaCppHardwareFooterProps) {
  // Accumulate a per-process sparkline ring via React's "setState during render
  // when a prop changes" pattern (react.dev/learn/you-might-not-need-an-effect
  // "Adjusting some state when a prop changes"). React re-renders once with the
  // new ring after each processMetrics update; prevProc guards against infinite loops.
  const [ring, setRing] = useState<ProcRing>(EMPTY_RING);
  const [prevProc, setPrevProc] = useState<ProcessMetrics | null | undefined>(undefined);

  if (processMetrics !== prevProc) {
    setPrevProc(processMetrics);
    const wasProcess = prevProc != null;
    if (wasProcess !== (processMetrics != null)) {
      setRing(EMPTY_RING);
    } else if (processMetrics != null) {
      setRing((prev) => updateRing(prev, processMetrics, { gpuPct, vramUsedGb: vramUsed, memTotal, vramTotal }));
    }
  }

  const isProcess = processMetrics != null;

  const dispCpuPct = isProcess ? processMetrics.cpu_percent : cpuPct;
  const dispMemValue = isProcess
    ? `${(processMetrics.memory_kb / 1024 / 1024).toFixed(1)} GB`
    : formatSysMem(memUsed, memTotal, memPct);
  const dispGpuValue = isProcess
    ? formatProcessGpu(processMetrics.gpu_util_percent, gpuPct)
    : formatSysGpu(gpuPct);
  const dispVramValue = isProcess
    ? formatProcessVram(processMetrics.vram_mb, vramUsed, vramTotal)
    : formatSysVram(vramUsed, vramTotal);

  const cpuHist = isProcess ? ring.cpu : sliceHistory(cpuHistory);
  const memHist = isProcess ? ring.mem : sliceHistory(memoryHistory);
  const gpuHist = isProcess ? ring.gpu : sliceHistory(gpuHistory);
  const vramHist = isProcess ? ring.vram : sliceHistory(gpuVramUtilHistory);
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
        value={dispMemValue}
        color="var(--metric-ram)"
        history={memHist}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={dispGpuValue}
        color="var(--metric-gpu)"
        history={gpuHist}
      />
      <FooterStat
        icon={<Database size={13} />}
        label="VRAM"
        value={dispVramValue}
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
