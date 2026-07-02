import { useMemo, useState, useEffect, useRef } from "react";
import { MetricHistoryPoint } from "../types/metrics";
import {
  resolveAccentColors,
  useAccentSync,
  SECONDARY_LINE_DASH,
} from "../utils/accentColors";

interface ThroughputChartProps {
  genTpsHistory: MetricHistoryPoint[] | null;
  promptTpsHistory: MetricHistoryPoint[] | null;
  accent: { color: string };
  height?: number;
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function computeStats(history: MetricHistoryPoint[] | null): {
  current: number | null;
  avg: number;
  peak: number;
} {
  const values =
    history
      ?.filter((p) => p.value != null && p.value > 0)
      .map((p) => p.value as number) ?? [];
  const current = values.length > 0 ? values[values.length - 1] : null;
  const peak = values.length > 0 ? Math.max(...values) : 0;
  const avg =
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return { current, avg, peak };
}

export default function ThroughputChart({
  genTpsHistory,
  promptTpsHistory,
  height = 80,
}: ThroughputChartProps) {
  const [chartComponents, setChartComponents] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [chartColors, setChartColors] = useState(() => getChartColors());
  const [seriesColors, setSeriesColors] = useState(() =>
    resolveAccentColors(2),
  );
  const accent = { color: seriesColors[0] };
  const promptColor = seriesColors[1];
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    import("recharts").then((r) => setChartComponents(r));
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const updateSize = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1)
        setChartSize({
          width: Math.floor(r.width),
          height: Math.floor(r.height),
        });
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    updateSize();
    return () => ro.disconnect();
  }, []);

  useAccentSync(() => {
    setChartColors(getChartColors());
    setSeriesColors(resolveAccentColors(2));
  });

  const chartData = useMemo(() => {
    if (!genTpsHistory && !promptTpsHistory) return [];
    const maxLen = Math.max(
      genTpsHistory?.length ?? 0,
      promptTpsHistory?.length ?? 0,
    );
    return Array.from({ length: maxLen }, (_, i) => {
      const g = genTpsHistory?.[i];
      const p = promptTpsHistory?.[i];
      return {
        x: i,
        timestampMs:
          g?.timestamp instanceof Date ? g.timestamp.getTime() : 0,
        timeLabel: g ? formatTime(g.timestamp) : "",
        genTps: g?.value != null ? Math.round(g.value * 10) / 10 : null,
        promptTps: p?.value != null ? Math.round(p.value * 10) / 10 : null,
      };
    });
  }, [genTpsHistory, promptTpsHistory]);

  const genStats = computeStats(genTpsHistory);
  const promptStats = computeStats(promptTpsHistory);

  if (!chartComponents || !chartSize) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatBadge
            label="Gen TPS"
            current={genStats.current}
            avg={genStats.avg}
            peak={genStats.peak}
            color={accent.color}
          />
          <StatBadge
            label="Prompt TPS"
            current={promptStats.current}
            avg={promptStats.avg}
            peak={promptStats.peak}
            color={promptColor}
          />
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

  const dataMaxX = chartData.length > 0 ? chartData.length - 1 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatBadge
          label="Gen TPS"
          current={genStats.current}
          avg={genStats.avg}
          peak={genStats.peak}
          color={accent.color}
        />
        <StatBadge
          label="Prompt TPS"
          current={promptStats.current}
          avg={promptStats.avg}
          peak={promptStats.peak}
          color={promptColor}
        />
      </div>
      <div ref={chartRef} style={{ height, overflow: "hidden" }}>
        <div style={{ width: chartSize.width, height: chartSize.height }}>
          <AreaChart
            data={chartData}
            width={chartSize.width}
            height={chartSize.height}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            padding={{ top: 2, right: 2, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, dataMaxX]}
              tick={{ fontSize: 8, fill: "var(--text-muted)" }}
              axisLine={{ stroke: chartColors.axis }}
              tickFormatter={(v: number) => {
                const pt = chartData[Math.round(v)];
                return pt ? pt.timeLabel : "";
              }}
              interval="equidistantPreserveStart"
            />
            <YAxis
              width={24}
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fontSize: 8, fill: "var(--text-muted)" }}
              axisLine={{ stroke: chartColors.axis }}
            />
            <Tooltip
              isAnimationActive={false}
              content={(props: any) => {
                if (!props?.payload?.[0]?.payload) return null;
                const d = props.payload[0].payload;
                return (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 9,
                    }}
                  >
                    <div
                      style={{ color: "var(--text-muted)", marginBottom: 2 }}
                    >
                      {d.timeLabel}
                    </div>
                    <div style={{ color: accent.color }}>
                      Gen TPS: {d.genTps ?? "\u2014"}
                    </div>
                    <div style={{ color: promptColor }}>
                      Prompt TPS: {d.promptTps ?? "\u2014"}
                    </div>
                  </div>
                );
              }}
              cursor={{
                stroke: chartColors.crosshair,
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            <Area
              dataKey="genTps"
              stroke={accent.color}
              fill={`${accent.color}20`}
              strokeWidth={1.5}
              fillOpacity={0.3}
              isAnimationActive={false}
              animationDuration={0}
              activeDot={{
                r: 3,
                stroke: chartColors.dotStroke,
                strokeWidth: 1.5,
                fill: accent.color,
              }}
            />
            <Area
              dataKey="promptTps"
              stroke={promptColor}
              fill={`${promptColor}20`}
              strokeWidth={1.5}
              strokeDasharray={SECONDARY_LINE_DASH}
              fillOpacity={0.2}
              isAnimationActive={false}
              animationDuration={0}
              activeDot={{
                r: 3,
                stroke: chartColors.dotStroke,
                strokeWidth: 1.5,
                fill: promptColor,
              }}
            />
          </AreaChart>
        </div>
      </div>
    </div>
  );
}

function StatBadge({
  label,
  current,
  avg,
  peak,
  color,
}: {
  label: string;
  current: number | null;
  avg: number;
  peak: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: "monospace",
          color,
          fontWeight: 700,
          fontSize: 11,
        }}
      >
        {current != null ? current.toFixed(1) : "\u2014"}
      </span>
      <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
        avg:{avg.toFixed(1)} peak:{peak.toFixed(1)}
      </span>
    </div>
  );
}
