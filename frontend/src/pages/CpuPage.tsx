import { useMemo } from "react";
import { useMetricsContext } from "../context/MetricsContext";
import MetricChart from "../charts/MetricChart";
import CoreBars from "../charts/CoreBars";
import PanelErrorBoundary from "../components/common/PanelErrorBoundary";
import PanelErrorState from "../components/common/PanelErrorState";
import { Cpu, Thermometer, Activity, Server, Zap } from "lucide-react";
import { useResolvedAccentColor } from "../utils/accentColors";
import {
  getProgressState,
  getTempState,
  getStateColor,
  getStateLabel,
  worseState,
} from "../utils/progress";

const CPU_HISTORY_LABEL = "(Last 2m)";

interface CpuPageProps {
  accent: { color: string; glow: string };
}

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function getStatusColor(
  util: number,
  temp: number,
): { color: string; label: string } {
  const state = worseState(getProgressState(util), getTempState(temp));
  return { color: getStateColor(state), label: getStateLabel(state) };
}

function getUtilBarColor(value: number, accent: string): string {
  const state = getProgressState(value);
  if (state === "normal") return accent;
  return resolveVar(state === "critical" ? "--danger" : "--warning");
}

function getTempBarColor(temp: number, accent: string): string {
  const state = getTempState(temp);
  if (state === "normal") return accent;
  return resolveVar(state === "critical" ? "--danger" : "--warning");
}

/* ─── Vertical Progress Bar ─── */

function CpuVerticalProgress({
  value,
  label,
  type = "percent",
  max = 100,
  accent,
}: {
  value: number;
  label: string;
  type?: "percent" | "temp";
  max?: number;
  accent: string;
}) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  let color: string;
  let displayValue: string;

  if (type === "temp") {
    color = getTempBarColor(value, accent);
    displayValue = `${Math.round(value)}°C`;
  } else {
    color = getUtilBarColor(value, accent);
    displayValue =
      type === "percent" ? `${Math.round(value)}%` : value.toFixed(2);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        minHeight: 0,
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: resolveVar("--text-primary"),
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {displayValue}
      </div>
      <div
        style={{
          position: "relative",
          width: 40,
          background: resolveVar("--bg-secondary"),
          borderRadius: 6,
          overflow: "hidden",
          border: `1px solid ${resolveVar("--border-color")}`,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            background: `linear-gradient(to top, ${color}, ${color}dd)`,
            borderRadius: 5,
            transition: "height 0.6s ease, background 0.4s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "33%",
            left: 3,
            right: 3,
            height: 1,
            background: resolveVar("--border-color"),
            opacity: 0.25,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "66%",
            left: 3,
            right: 3,
            height: 1,
            background: resolveVar("--border-color"),
            opacity: 0.25,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 9,
          color: resolveVar("--text-muted"),
          textTransform: "uppercase",
          letterSpacing: 1.2,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/* ─── CPU Summary Card (Left Column) ─── */

function CpuSummaryCard({
  accent,
}: {
  accent: { color: string; glow: string };
}) {
  const barColor = useResolvedAccentColor();
  const { cpuCurrentValues, cpuRawData } = useMetricsContext();

  const util = cpuCurrentValues[0] ?? 0;
  const temp = cpuCurrentValues[1] ?? 0;
  const freq = cpuCurrentValues[2] ?? 0;
  const physCores = cpuCurrentValues[3] ?? 0;
  const threads = cpuCurrentValues[4] ?? 0;
  const load1 = cpuCurrentValues[5] ?? 0;
  const load5 = cpuCurrentValues[6] ?? 0;
  const load15 = cpuCurrentValues[7] ?? 0;

  const model = cpuRawData?.model || "Unknown CPU";
  const { color: statusColor, label: statusLabel } = getStatusColor(util, temp);

  const load1Pct = threads > 0 ? Math.min((load1 / threads) * 100, 100) : 0;
  const load5Pct = threads > 0 ? Math.min((load5 / threads) * 100, 100) : 0;
  const load15Pct = threads > 0 ? Math.min((load15 / threads) * 100, 100) : 0;

  return (
    <div
      className="metric-card"
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={16} style={{ color: accent.color }} />
          <span className="card-title" style={{ fontSize: "12px" }}>
            CPU
          </span>
        </div>
        <div className="card-status">
          <div className="status-dot" style={{ background: statusColor }} />
          <span style={{ color: statusColor, fontSize: "11px" }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* CPU name */}
      <div style={{ padding: "0 2px", marginBottom: 8 }}>
        <div
          style={{
            fontSize: "13px",
            color: "var(--text-primary)",
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {model}
        </div>
      </div>

      {/* Separator */}
      <div
        style={{
          height: 1,
          background: "var(--border-color)",
          margin: "0 2px 8px",
        }}
      />

      {/* Metrics grid - compact 2-column layout */}
      <div
        className="card-details cpu-metrics-grid"
        style={{ margin: "0 2px", flexShrink: 0 }}
      >
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Thermometer
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Temp
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {temp.toFixed(0)}°C
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Zap
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Freq
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {freq > 0 ? `${(freq / 1000).toFixed(1)} GHz` : "—"}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Server
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Cores
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {physCores}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Activity
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Threads
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {threads}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Activity
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Load 1m
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {load1.toFixed(2)}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Activity
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Load 5m
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {load5.toFixed(2)}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Activity
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Load 15m
          </span>
          <span className="card-detail-value" style={{ color: accent.color }}>
            {load15.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div
        style={{
          height: 1,
          background: "var(--border-color)",
          margin: "8px 2px",
          flexShrink: 0,
        }}
      />

      {/* Vertical utilization bars - fill remaining space */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          flex: 1,
          minHeight: 0,
          padding: "8px 0 4px",
          gap: 16,
        }}
      >
        <CpuVerticalProgress value={util} label="CPU UTIL" accent={barColor} />
        <CpuVerticalProgress
          value={load1Pct}
          label="LOAD 1M"
          accent={barColor}
        />
        <CpuVerticalProgress
          value={load5Pct}
          label="LOAD 5M"
          accent={barColor}
        />
        <CpuVerticalProgress
          value={load15Pct}
          label="LOAD 15M"
          accent={barColor}
        />
        <CpuVerticalProgress
          value={temp}
          label="TEMP"
          type="temp"
          max={100}
          accent={barColor}
        />
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

function CpuContent({ accent }: CpuPageProps) {
  const { cpuHistory, cpuTemperatureHistory, cpuRawData } = useMetricsContext();

  const coreData = useMemo(() => {
    if (!cpuRawData?.cores || !Array.isArray(cpuRawData.cores)) return [];
    return cpuRawData.cores as Array<{
      utilization_percent: number;
      temperature_celsius?: number;
    } | null>;
  }, [cpuRawData?.cores]);

  const hasHistory = cpuHistory && cpuHistory.length > 0;
  const hasTempHistory =
    cpuTemperatureHistory && cpuTemperatureHistory.length > 0;

  return (
    <div className="cpu-row">
      {/* Left column - CPU summary card */}
      <div className="cpu-col-left" style={{ flexShrink: 0 }}>
        <CpuSummaryCard accent={accent} />
      </div>

      {/* Right column - per-core bars + combined history chart, evenly split */}
      <div
        className="cpu-charts"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Per-core bars - larger portion */}
        {coreData.length > 0 && (
          <div style={{ flex: 1.3, minHeight: 0 }}>
            <CoreBars cores={coreData} accent={accent} />
          </div>
        )}

        {/* Combined CPU Utilization & Temperature History - reduced height */}
        {hasHistory && hasTempHistory && (
          <MetricChart
            accent={accent}
            title="CPU UTILIZATION & TEMPERATURE HISTORY"
            data={cpuHistory}
            dualData={cpuTemperatureHistory}
            timeFrame={CPU_HISTORY_LABEL}
            yDomain={[0, 100]}
            yAxisTickValues={[0, 25, 50, 75, 100]}
            unit="%"
            dualYDomain={[0, 120]}
            dualYAxisTickValues={[0, 30, 60, 90, 120]}
            dualUnit="°C"
            primaryLabel="CPU Utilization"
            secondaryLabel="CPU Temperature"
            style={{ flex: 0.7, minHeight: 0 }}
          />
        )}
      </div>
    </div>
  );
}

export default function CpuPage({ accent }: CpuPageProps) {
  const { cpuError, retryCpu } = useMetricsContext();

  if (cpuError) {
    return (
      <main className="dashboard-grid">
        <PanelErrorBoundary panelName="CPU">
          <PanelErrorState
            panelName="CPU"
            error={new Error(cpuError)}
            errorInfo={null}
            onRetry={retryCpu}
          />
        </PanelErrorBoundary>
      </main>
    );
  }

  return (
    <main className="dashboard-grid">
      <CpuContent accent={accent} />
    </main>
  );
}
