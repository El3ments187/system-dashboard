import React from "react";
import { Cpu, MemoryStick, Gauge, Database, Thermometer } from "lucide-react";
import Sparkline from "../../components/shared/Sparkline";
import type { MetricHistoryPoint } from "../../types/metrics";

export function FooterStat({
  icon,
  label,
  value,
  color,
  history,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  history?: MetricHistoryPoint[];
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
          <Sparkline data={history} color={color} width={160} height={32} />
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
}: LlamaCppHardwareFooterProps) {
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
        value={cpuPct != null ? `${cpuPct.toFixed(1)}%` : "\u2014"}
        color="var(--metric-cpu)"
        history={cpuHistory}
      />
      <FooterStat
        icon={<MemoryStick size={13} />}
        label="RAM"
        value={
          memUsed != null && memTotal != null
            ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB \u00b7 ${memPct?.toFixed(0) ?? "\u2014"}%`
            : "\u2014"
        }
        color="var(--metric-ram)"
        history={memoryHistory}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={gpuPct != null ? `${gpuPct.toFixed(0)}%` : "\u2014"}
        color="var(--metric-gpu)"
        history={gpuHistory}
      />
      <FooterStat
        icon={<Database size={13} />}
        label="VRAM"
        value={
          vramUsed != null && vramTotal != null
            ? `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`
            : "\u2014"
        }
        color="var(--metric-vram)"
        history={gpuVramUtilHistory}
      />
      <FooterStat
        icon={<Thermometer size={13} />}
        label="GPU Temp"
        value={gpuTemp != null ? `${gpuTemp.toFixed(0)}\u00b0C` : "\u2014"}
        color="var(--metric-temp)"
        history={gpuTempHistory}
      />
    </div>
  );
}
