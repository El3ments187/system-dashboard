import { useMemo, useState, useEffect, useRef } from "react";
import { StorageHistoryPoint } from "../../types/metrics";
import {
  resolveAccentColor,
  getSecondarySeriesColor,
  useAccentSync,
  SECONDARY_LINE_DASH,
} from "../../utils/accentColors";

interface Props {
  data: StorageHistoryPoint[];
}

const BUFFER_SIZE = 120;

function fmtBps(bps: number): string {
  if (bps <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.min(
    Math.floor(Math.log(bps) / Math.log(1024)),
    units.length - 1,
  );
  return (bps / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function getChartColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    grid: cs.getPropertyValue("--chart-grid").trim() || "#1e2535",
    axis: cs.getPropertyValue("--chart-axis").trim() || "#2a3143",
    crosshair: cs.getPropertyValue("--chart-crosshair").trim() || "#5a6578",
    dotStroke: cs.getPropertyValue("--chart-dot-stroke").trim() || "#fff",
  };
}

export default function OverviewStorageChart({ data }: Props) {
  const [recharts, setRecharts] = useState<Record<string, unknown> | null>(
    null,
  );
  const [strokeColor, setStrokeColor] = useState(() => resolveAccentColor());
  const [chartColors, setChartColors] = useState(() => getChartColors());
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    import("recharts").then((r) => setRecharts(r as Record<string, unknown>));
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1)
        setChartSize({
          width: Math.floor(r.width),
          height: Math.floor(r.height),
        });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [recharts]);

  useAccentSync(() => {
    setStrokeColor(resolveAccentColor());
    setChartColors(getChartColors());
  });

  const chartData = useMemo(() => {
    const slotMap = new Map<number, any>();
    for (let i = 0; i < BUFFER_SIZE; i++) {
      slotMap.set(i, {
        x: i,
        timestampMs: 0,
        timeLabel: "",
        read: null,
        write: null,
      });
    }
    for (const p of data) {
      if (p.read_bytes_per_sec == null && p.write_bytes_per_sec == null)
        continue;
      const entry = slotMap.get(p.slot) ?? { x: p.slot };
      const d = new Date(p.timestamp);
      entry.timestampMs = d.getTime();
      entry.timeLabel = d.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      entry.read = p.read_bytes_per_sec ?? null;
      entry.write = p.write_bytes_per_sec ?? null;
      slotMap.set(p.slot, entry);
    }
    return Array.from(slotMap.values()).sort((a, b) => a.x - b.x);
  }, [data]);

  const writeColor = getSecondarySeriesColor(strokeColor);

  if (!recharts) {
    return (
      <div
        ref={chartRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        Loading chart...
      </div>
    );
  }

  const AreaChart = recharts.AreaChart as any;
  const Area = recharts.Area as any;
  const XAxis = recharts.XAxis as any;
  const YAxis = recharts.YAxis as any;
  const CartesianGrid = recharts.CartesianGrid as any;
  const Tooltip = recharts.Tooltip as any;

  return (
    <div
      ref={chartRef}
      style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}
    >
      {chartSize && (
        <AreaChart
          data={chartData}
          width={chartSize.width}
          height={chartSize.height}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 4" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, BUFFER_SIZE - 1]}
            ticks={chartData.map((_, i) => i)}
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            axisLine={{ stroke: chartColors.axis }}
            tickFormatter={(v: number) =>
              chartData[Math.round(v)]?.timeLabel ?? ""
            }
            interval="equidistantPreserveStart"
          />
          <YAxis
            width={36}
            type="number"
            domain={[0, (dataMax: number) => Math.max(dataMax, 1024)]}
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            axisLine={{ stroke: chartColors.axis }}
            tickFormatter={(v: number) => fmtBps(v)}
          />
          <Tooltip
            isAnimationActive={false}
            animationDuration={0}
            content={(props: any) => {
              if (!props?.active || !props.payload?.[0]) return null;
              const d = props.payload[0].payload;
              const ts = d.timestampMs
                ? new Date(d.timestampMs).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "";
              return (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {ts && (
                    <div
                      style={{ color: "var(--text-muted)", marginBottom: 4 }}
                    >
                      {ts}
                    </div>
                  )}
                  <div style={{ color: strokeColor }}>
                    Read: {fmtBps(d.read ?? 0)}
                  </div>
                  <div style={{ color: writeColor }}>
                    Write: {fmtBps(d.write ?? 0)}
                  </div>
                </div>
              );
            }}
            cursor={{
              stroke: chartColors.crosshair,
              strokeWidth: 1,
              strokeDasharray: "3 3",
              opacity: 0.5,
            }}
            offset={8}
          />
          <Area
            dataKey="read"
            stroke={strokeColor}
            fill={`${strokeColor}20`}
            strokeWidth={2}
            fillOpacity={0.3}
            isAnimationActive={false}
            animationDuration={0}
            activeDot={{
              r: 5,
              stroke: chartColors.dotStroke,
              strokeWidth: 2,
              fill: strokeColor,
            }}
          />
          <Area
            dataKey="write"
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
        </AreaChart>
      )}
    </div>
  );
}
