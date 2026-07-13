import { useMetricsContext } from "../context/MetricsContext";
import MetricChart from "../charts/MetricChart";
import PanelErrorBoundary from "../components/common/PanelErrorBoundary";
import PanelErrorState from "../components/common/PanelErrorState";
import { Card } from "../components/shared/CardComponents";
import {
  Gpu,
  Thermometer,
  Zap,
  Cpu,
  HardDrive,
  Activity,
  Fan,
} from "lucide-react";
import {
  useResolvedAccentColor,
  useThresholdColors,
} from "../utils/accentColors";
import {
  getProgressState,
  getTempState,
  getStateColor,
  getStateLabel,
  worseState,
} from "../utils/progress";
import { GpuMetrics, MetricHistoryPoint } from "../types/metrics";

const GPU_HISTORY_LABEL = "(Last 2m)";

interface GpuPageProps {
  accent: { color: string; glow: string };
}

function formatBytes(gb: number): string {
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}

function getStatusColor(
  util: number,
  temp: number,
): { color: string; label: string } {
  const state = worseState(getProgressState(util), getTempState(temp));
  return { color: getStateColor(state), label: getStateLabel(state) };
}

function getUtilBarColor(
  value: number,
  base: string,
  danger: string,
  warning: string,
): string {
  const state = getProgressState(value);
  if (state === "normal") return base;
  return state === "critical" ? danger : warning;
}

function getTempBarColor(
  temp: number,
  base: string,
  danger: string,
  warning: string,
): string {
  const state = getTempState(temp);
  if (state === "normal") return base;
  return state === "critical" ? danger : warning;
}

function getPowerBarColor(
  value: number,
  limit: number,
  base: string,
  danger: string,
  warning: string,
): string {
  if (limit <= 0) return base;
  const pct = (value / limit) * 100;
  const state = getProgressState(pct);
  if (state === "normal") return base;
  return state === "critical" ? danger : warning;
}

/* ─── Vertical Progress Bar ─── */

function VerticalProgress({
  value,
  label,
  type = "percent",
  max = 100,
  limit,
  accent,
  danger,
  warning,
}: {
  value: number;
  label: string;
  type?: "percent" | "temp" | "power";
  max?: number;
  limit?: number;
  accent: string;
  danger: string;
  warning: string;
}) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  let color: string;
  let displayValue: string;

  if (type === "temp") {
    color = getTempBarColor(value, accent, danger, warning);
    displayValue = `${Math.round(value)}°C`;
  } else if (type === "power") {
    color = getPowerBarColor(value, limit ?? max, accent, danger, warning);
    displayValue = `${Math.round(value)}W`;
  } else {
    color = getUtilBarColor(value, accent, danger, warning);
    displayValue = `${Math.round(value)}%`;
  }

  return (
    <div
      data-accent-el=""
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
          color: "var(--text-primary)",
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
          background: "var(--bg-secondary)",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--border-color)",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          className={color === accent ? "accent-fill" : undefined}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            minHeight: value > 0 ? 2 : 0,
            ...(color === accent
              ? {
                  background: "var(--accent-fill)",
                  backgroundSize: "var(--accent-fill-size, 100% 100%)",
                }
              : { background: color }),
            borderRadius: 5,
            transition: "height 0.6s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "33%",
            left: 3,
            right: 3,
            height: 1,
            background: "var(--border-color)",
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
            background: "var(--border-color)",
            opacity: 0.25,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/* ─── Combined GPU Summary Card ─── */

function GpuSummaryCard({
  gpu,
  index,
}: {
  gpu: GpuMetrics;
  accent: { color: string; glow: string };
  index: number;
}) {
  const barColor = useResolvedAccentColor();
  const { danger, warning } = useThresholdColors();

  const vramPct =
    gpu.vram_total_gb > 0 ? (gpu.vram_used_gb / gpu.vram_total_gb) * 100 : 0;
  const { color: statusColor, label: statusLabel } = getStatusColor(
    gpu.utilization_percent,
    gpu.temperature_celsius,
  );

  const powerMax =
    gpu.power_limit_watts > 0
      ? gpu.power_limit_watts
      : Math.max(gpu.power_usage_watts * 1.5, 1);
  const powerLimit =
    gpu.power_limit_watts > 0 ? gpu.power_limit_watts : undefined;

  return (
    <Card
      className="gpu-summary-card"
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
          <Gpu size={16} style={{ color: "var(--accent-primary)" }} />
          <span className="card-title" style={{ fontSize: "12px" }}>
            GPU {index}
          </span>
        </div>
        <div className="card-status">
          <div className="status-dot" style={{ background: statusColor }} />
          <span style={{ color: statusColor, fontSize: "11px" }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* GPU name */}
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
            textAlign: "center",
          }}
        >
          {gpu.name || "Unknown GPU"}
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

      {/* Metrics grid */}
      <div
        className="card-details gpu-metrics-grid"
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
          <span
            className="card-detail-value"
            style={{ color: "var(--accent-primary)" }}
          >
            {gpu.temperature_celsius.toFixed(0)}°C
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Zap
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Power
          </span>
          <span
            className="card-detail-value"
            style={{ color: "var(--accent-primary)" }}
          >
            {gpu.power_usage_watts.toFixed(0)}W
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <HardDrive
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            VRAM
          </span>
          <span
            className="card-detail-value"
            style={{ color: "var(--accent-primary)" }}
          >
            {formatBytes(gpu.vram_used_gb)} / {formatBytes(gpu.vram_total_gb)}
          </span>
        </div>
        <div className="card-detail-item">
          <span className="card-detail-label">
            <Fan
              size={11}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            />
            Fan
          </span>
          <span
            className="card-detail-value"
            style={{ color: "var(--accent-primary)" }}
          >
            {gpu.fan_speed_rpm > 0 ? `${gpu.fan_speed_rpm} RPM` : "—"}
          </span>
        </div>
        {gpu.clock_speed_mhz != null && gpu.clock_speed_mhz > 0 && (
          <div className="card-detail-item">
            <span className="card-detail-label">
              <Activity
                size={11}
                style={{ marginRight: 4, verticalAlign: "middle" }}
              />
              Clock
            </span>
            <span
              className="card-detail-value"
              style={{ color: "var(--accent-primary)" }}
            >
              {gpu.clock_speed_mhz.toFixed(0)} MHz
            </span>
          </div>
        )}
        {gpu.memory_clock_mhz != null && gpu.memory_clock_mhz > 0 && (
          <div className="card-detail-item">
            <span className="card-detail-label">
              <Cpu
                size={11}
                style={{ marginRight: 4, verticalAlign: "middle" }}
              />
              MemClk
            </span>
            <span
              className="card-detail-value"
              style={{ color: "var(--accent-primary)" }}
            >
              {gpu.memory_clock_mhz.toFixed(0)} MHz
            </span>
          </div>
        )}
        {gpu.driver_version && (
          <div className="card-detail-item" style={{ gridColumn: "1 / -1" }}>
            <span className="card-detail-label">
              <Zap
                size={11}
                style={{ marginRight: 4, verticalAlign: "middle" }}
              />
              Driver
            </span>
            <span
              className="card-detail-value"
              style={{ color: "var(--text-muted)", fontSize: "11px" }}
            >
              {gpu.driver_version}
            </span>
          </div>
        )}
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

      {/* Vertical utilization bars */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          flex: 1,
          minHeight: 0,
          padding: "8px 0 4px",
          gap: 24,
        }}
      >
        <VerticalProgress
          value={gpu.utilization_percent}
          label="GPU UTIL"
          accent={barColor}
          danger={danger}
          warning={warning}
        />
        <VerticalProgress
          value={vramPct}
          label="VRAM"
          accent={barColor}
          danger={danger}
          warning={warning}
        />
        <VerticalProgress
          value={gpu.temperature_celsius}
          label="TEMP"
          type="temp"
          max={120}
          accent={barColor}
          danger={danger}
          warning={warning}
        />
        <VerticalProgress
          value={gpu.power_usage_watts}
          label="POWER"
          type="power"
          max={powerMax}
          limit={powerLimit}
          accent={barColor}
          danger={danger}
          warning={warning}
        />
      </div>
    </Card>
  );
}

/* ─── GPU Row (2-column layout per GPU) ─── */

function GpuRow({
  gpu,
  index,
  accent,
  hasHistory,
  gpuHistory,
  gpuVramUtilHistory,
  gpuTemperatureHistory,
}: {
  gpu: GpuMetrics;
  index: number;
  accent: { color: string; glow: string };
  hasHistory: boolean;
  gpuHistory: MetricHistoryPoint[] | null;
  gpuVramUtilHistory: MetricHistoryPoint[] | null;
  gpuTemperatureHistory: MetricHistoryPoint[] | null;
}) {
  return (
    <div className="gpu-row">
      {/* Left column - combined GPU card */}
      <div className="gpu-col-left">
        <GpuSummaryCard gpu={gpu} accent={accent} index={index} />
      </div>

      {/* Right column - charts stack */}
      <div
        className="gpu-charts"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        {hasHistory &&
          gpuHistory &&
          gpuVramUtilHistory &&
          gpuTemperatureHistory && (
            <>
              <MetricChart
                accent={accent}
                title="GPU Utilization History"
                data={gpuHistory}
                timeFrame={GPU_HISTORY_LABEL}
              />
              <MetricChart
                accent={accent}
                title="VRAM Utilization History"
                data={gpuVramUtilHistory}
                timeFrame={GPU_HISTORY_LABEL}
              />
              <MetricChart
                accent={accent}
                title="GPU Temperature History"
                data={gpuTemperatureHistory}
                timeFrame={GPU_HISTORY_LABEL}
              />
            </>
          )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function GpuPage({ accent }: GpuPageProps) {
  const { gpuError, retryGpu, gpuRawData, perGpuHistories } =
    useMetricsContext();

  const gpuData: GpuMetrics[] = (() => {
    if (Array.isArray(gpuRawData)) return gpuRawData as GpuMetrics[];
    if (gpuRawData) return [gpuRawData as GpuMetrics];
    return [];
  })();

  if (gpuError) {
    return (
      <main className="dashboard-grid">
        <PanelErrorBoundary panelName="GPU">
          <PanelErrorState
            panelName="GPU"
            error={new Error(gpuError)}
            errorInfo={null}
            onRetry={retryGpu}
          />
        </PanelErrorBoundary>
      </main>
    );
  }

  return (
    <main className="dashboard-grid">
      {gpuData.length > 0 ? (
        gpuData.map((gpu, i) => {
          const utilHistory = perGpuHistories.utilHistories[i] ?? null;
          const tempHistory = perGpuHistories.tempHistories[i] ?? null;
          const vramUtilHistory = perGpuHistories.vramUtilHistories[i] ?? null;
          const hasHistory = !!(utilHistory && utilHistory.length > 0);
          return (
            <GpuRow
              key={gpu.name || String(i)}
              gpu={gpu}
              index={i + 1}
              accent={accent}
              hasHistory={hasHistory}
              gpuHistory={utilHistory}
              gpuVramUtilHistory={vramUtilHistory}
              gpuTemperatureHistory={tempHistory}
            />
          );
        })
      ) : (
        <div className="dashboard-row">
          <Card
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 200,
            }}
          >
            <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
              <Activity
                size={32}
                style={{ margin: "0 auto 12px", opacity: 0.5 }}
              />
              <div style={{ fontSize: "14px" }}>No GPU data available</div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
