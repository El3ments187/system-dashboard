import { useMemo, useState, useEffect, useRef } from "react";
import { StorageHistoryPoint } from "../types/metrics";
import ChartTooltip from "../components/common/ChartTooltip";
import {
  resolveAccentColors,
  getSecondarySeriesColor,
  useAccentSync,
  SECONDARY_LINE_DASH,
} from "../utils/accentColors";

interface ChartProps {
  data: Map<string, StorageHistoryPoint[]>;
}

function getSeriesColors(): string[] {
  // Resolve more than 2 stops so multi-device storage charts get visible
  // variety in rainbow-wave / spectrum modes instead of cycling 2 colors.
  return resolveAccentColors(8);
}

function getChartColors(): {
  grid: string;
  axis: string;
  crosshair: string;
  dotStroke: string;
} {
  const cs = getComputedStyle(document.documentElement);
  return {
    grid: cs.getPropertyValue("--chart-grid").trim() || "#1e2535",
    axis: cs.getPropertyValue("--chart-axis").trim() || "#2a3143",
    crosshair: cs.getPropertyValue("--chart-crosshair").trim() || "#5a6578",
    dotStroke: cs.getPropertyValue("--chart-dot-stroke").trim() || "#fff",
  };
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytesPerSec(bps: number): string {
  if (bps <= 0) return "0";
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.min(
    Math.floor(Math.log(bps) / Math.log(1024)),
    units.length - 1,
  );
  return (bps / Math.pow(1024, i)).toFixed(1) + units[i];
}

// Fixed rolling buffer size for 60s window at 500ms polling
const STORAGE_BUFFER_SIZE = 120;

function initSlotMap(size: number): Map<number, any> {
  const map = new Map<number, any>();
  for (let i = 0; i < size; i++) {
    map.set(i, { x: i, timeLabel: "", timestampMs: 0 });
  }
  return map;
}

function isPlaceholderPoint(point: StorageHistoryPoint): boolean {
  return (
    point.read_bytes_per_sec == null &&
    point.write_bytes_per_sec == null &&
    point.utilization == null
  );
}

function applyPointToSlot(
  slotMap: Map<number, any>,
  device: string,
  point: StorageHistoryPoint,
): void {
  const slot = point.slot;
  if (isPlaceholderPoint(point)) {
    const existing = slotMap.get(slot);
    if (existing && existing.timestampMs === 0 && point.timestamp) {
      existing.timeLabel = formatTime(point.timestamp);
      existing.timestampMs = new Date(point.timestamp).getTime();
    }
    return;
  }
  if (!slotMap.has(slot)) {
    slotMap.set(slot, {
      x: slot,
      timeLabel: formatTime(point.timestamp),
      timestampMs: new Date(point.timestamp).getTime(),
    });
  }
  const entry = slotMap.get(slot);
  entry.timeLabel = formatTime(point.timestamp);
  entry.timestampMs = new Date(point.timestamp).getTime();
  entry[`${device}_read`] = point.read_bytes_per_sec;
  entry[`${device}_write`] = point.write_bytes_per_sec;
  entry[`${device}_util`] = point.utilization;
}

export default function StorageHistoryChart({ data }: ChartProps) {
  const [chartComponents, setChartComponents] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [activeTab, setActiveTab] = useState<"throughput" | "utilization">(
    "throughput",
  );
  const [chartColors, setChartColors] = useState(() => getChartColors());
  const [seriesColors, setSeriesColors] = useState(() => getSeriesColors());
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    import("recharts").then((recharts) => setChartComponents(recharts));
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const updateSize = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        setChartSize({
          width: Math.floor(r.width),
          height: Math.floor(r.height),
        });
      }
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    updateSize();
    return () => ro.disconnect();
  }, [chartComponents]);

  useAccentSync(() => {
    setChartColors(getChartColors());
    setSeriesColors(getSeriesColors());
  });

  const chartData = useMemo(() => {
    const entries = Array.from(data.entries());
    if (entries.length === 0) return [];

    const slotMap = initSlotMap(STORAGE_BUFFER_SIZE);
    for (const [device, points] of entries) {
      for (const point of points) {
        if (!point) continue;
        applyPointToSlot(slotMap, device, point);
      }
    }
    return Array.from(slotMap.values()).sort((a, b) => a.x - b.x);
  }, [data]);

  const deviceNames = Array.from(data.keys()).sort();
  const hasData = chartData.length > 0;

  if (!chartComponents) {
    return (
      <div
        className="chart-container storage-chart-container"
        style={{ flex: 1, minHeight: 0, height: 0 }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          Loading chart...
        </div>
      </div>
    );
  }

  const AreaChart = chartComponents.AreaChart as any;
  const Area = chartComponents.Area as any;
  const XAxis = chartComponents.XAxis as any;
  const YAxis = chartComponents.YAxis as any;
  const CartesianGrid = chartComponents.CartesianGrid as any;
  const Tooltip = chartComponents.Tooltip as any;

  const tooltipContent = (props: any) => {
    if (!props || !props.payload || !props.payload[0] || !props.active)
      return null;
    const payloadArr = props.payload;
    const firstDatum = payloadArr[0]?.payload ?? {};

    const ts = firstDatum?.timestampMs ?? 0;
    const timestamp = ts
      ? new Date(ts).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "";

    const series = payloadArr.map((entry: any) => ({
      name: entry.name,
      value:
        activeTab === "throughput"
          ? formatBytesPerSec(entry.value ?? 0)
          : `${(entry.value ?? 0).toFixed(1)}%`,
      color: entry.color || seriesColors[0],
    }));

    return <ChartTooltip timestamp={timestamp} series={series} />;
  };

  return (
    <div
      className="chart-container storage-chart-container"
      style={{ flex: 1, minHeight: 0, height: 0 }}
    >
      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
        {(["throughput", "utilization"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              border: "1px solid var(--border-color)",
              background:
                activeTab === tab ? "var(--bg-secondary)" : "transparent",
              color:
                activeTab === tab
                  ? "var(--accent-primary)"
                  : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: activeTab === tab ? 600 : 400,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {tab === "throughput" ? "Throughput" : "Utilization"}
          </button>
        ))}
      </div>

      {hasData ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            {deviceNames.map((device, i) => (
              <div
                key={device}
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <div
                  style={{
                    width: 10,
                    height: 3,
                    borderRadius: 2,
                    background: seriesColors[i % seriesColors.length],
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--text-primary)",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  }}
                >
                  {device}
                </span>
                {activeTab !== "utilization" && (
                  <span
                    style={{
                      fontSize: 8,
                      color: "var(--text-muted)",
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                  >
                    R/W
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            ref={chartRef}
            style={{ flex: 1, minHeight: 32, overflow: "hidden" }}
          >
            {chartSize && (
              <div style={{ width: chartSize.width, height: chartSize.height }}>
                <AreaChart
                  data={chartData}
                  width={chartSize.width}
                  height={chartSize.height}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  padding={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={chartColors.grid}
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, STORAGE_BUFFER_SIZE - 1]}
                    ticks={chartData.map((_, i) => i)}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={{ stroke: chartColors.axis }}
                    tickFormatter={(tickVal: number) => {
                      const pt = chartData[Math.round(tickVal)];
                      return pt ? pt.timeLabel : "";
                    }}
                    interval="equidistantPreserveStart"
                  />
                  <YAxis
                    width={28}
                    type="number"
                    domain={
                      activeTab === "utilization" ? [0, 100] : [0, "dataMax"]
                    }
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={{ stroke: chartColors.axis }}
                    tickFormatter={(v: number) => {
                      if (activeTab === "throughput")
                        return formatBytesPerSec(v);
                      return `${v}%`;
                    }}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    animationDuration={0}
                    content={tooltipContent}
                    cursor={{
                      stroke: chartColors.crosshair,
                      strokeWidth: 1,
                      strokeDasharray: "3 3",
                      opacity: 0.5,
                    }}
                    offset={12}
                  />
                  {deviceNames.map((device, i) => {
                    const color = seriesColors[i % seriesColors.length];
                    const writeColor = getSecondarySeriesColor(color);
                    const baseKey =
                      activeTab === "throughput"
                        ? `${device}_read`
                        : `${device}_util`;
                    const writeKey =
                      activeTab === "throughput" ? `${device}_write` : null;
                    return (
                      <g key={device}>
                        <Area
                          dataKey={baseKey}
                          stroke={color}
                          fill={`${color}20`}
                          strokeWidth={2}
                          fillOpacity={0.3}
                          isAnimationActive={false}
                          animationDuration={0}
                          activeDot={{
                            r: 5,
                            stroke: chartColors.dotStroke,
                            strokeWidth: 2,
                            fill: color,
                          }}
                        />
                        {writeKey && (
                          <Area
                            dataKey={writeKey}
                            stroke={writeColor}
                            fill={`${writeColor}10`}
                            strokeWidth={2}
                            strokeDasharray={SECONDARY_LINE_DASH}
                            fillOpacity={0.2}
                            isAnimationActive={false}
                            animationDuration={0}
                            activeDot={{
                              r: 5,
                              stroke: chartColors.dotStroke,
                              strokeWidth: 2,
                              fill: writeColor,
                            }}
                          />
                        )}
                      </g>
                    );
                  })}
                </AreaChart>
              </div>
            )}
          </div>
        </>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          Waiting for data...
        </div>
      )}
    </div>
  );
}
