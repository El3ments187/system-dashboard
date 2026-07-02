import { useMemo, useState, useEffect, useRef } from "react";
import { MetricHistoryPoint } from "../types/metrics";
import ChartTooltip from "../components/common/ChartTooltip";
import { resolveAccentColors, useAccentSync } from "../utils/accentColors";

interface PerCoreCpuChartProps {
  accent: { color: string; glow: string };
  title: string;
  data: Array<MetricHistoryPoint[] | null>;
  timeFrame?: string;
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

function getCoreColors(count: number): string[] {
  return resolveAccentColors(count, true);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PerCoreCpuChart({
  title,
  data,
  timeFrame,
}: PerCoreCpuChartProps) {
  const [chartComponents, setChartComponents] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [chartColors, setChartColors] = useState(() => getChartColors());
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

  useAccentSync(() => setChartColors(getChartColors()));

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const firstHistory = data.find((h) => h && h.length > 0);
    if (!firstHistory) return [];
    return firstHistory.map((point, idx) => ({
      x: idx,
      timestampMs:
        point.timestamp instanceof Date
          ? point.timestamp.getTime()
          : new Date(point.timestamp).getTime(),
      timeLabel: formatTime(
        point.timestamp instanceof Date
          ? point.timestamp
          : new Date(point.timestamp),
      ),
    })) as any;
  }, [data]);

  const seriesData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const firstHistory = data.find((h) => h && h.length > 0);
    if (!firstHistory) return [];
    const numTimePoints = firstHistory.length;
    const result: Record<string, number | null>[] = [];

    for (let i = 0; i < numTimePoints; i++) {
      const point: Record<string, number | null> = { x: i };
      data.forEach((history, coreIdx) => {
        if (history && history[i]) {
          const val = history[i] as any;
          point[`core${coreIdx}`] =
            val.value != null ? Math.round(val.value * 10) / 10 : null;
        } else {
          point[`core${coreIdx}`] = null;
        }
      });
      result.push(point);
    }
    return result;
  }, [data]);

  const activeCores = data.filter((h) => h && h.length > 0).length;
  const coreColors = useMemo(
    () => getCoreColors(activeCores),
    [activeCores, chartColors], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Legend: show first 24 cores + "more" indicator for large core counts
  const legendLimit = Math.min(activeCores, 24);
  const showMore = activeCores > 24;

  const tooltipContent = (props: any) => {
    if (!props || !props.payload || !props.payload[0] || !props.active)
      return null;

    const ts = props.payload[0]?.payload?.timestampMs ?? 0;
    const timestamp = ts
      ? new Date(ts).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "";

    const series = data
      .map((history, coreIdx) => {
        if (!history || history.length === 0) return null;
        const firstPoint = history.find((p) => p);
        if (!firstPoint) return null;
        const dataKey = `core${coreIdx}`;
        const value = props.payload[0]?.payload?.[dataKey];
        return {
          name: `Core ${coreIdx}`,
          value: value != null ? `${value}%` : "N/A",
          color: coreColors[coreIdx] || "#888",
        };
      })
      .filter(Boolean) as any[];

    return <ChartTooltip timestamp={timestamp} series={series} />;
  };

  const dataMaxX = chartData.length > 0 ? chartData.length - 1 : 0;

  if (!chartComponents) {
    return (
      <div className="chart-container" style={{ flex: 1, minHeight: 0 }}>
        <div
          className="chart-title"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span>{title}</span>
          {timeFrame && (
            <span
              style={{
                color: "var(--text-muted)",
                fontWeight: 400,
                fontSize: "11px",
              }}
            >
              {timeFrame}
            </span>
          )}
        </div>
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

  const LineChart = chartComponents.LineChart as any;
  const Line = chartComponents.Line as any;
  const XAxis = chartComponents.XAxis as any;
  const YAxis = chartComponents.YAxis as any;
  const CartesianGrid = chartComponents.CartesianGrid as any;
  const Tooltip = chartComponents.Tooltip as any;

  return (
    <div className="chart-container" style={{ flex: 1, minHeight: 0 }}>
      <div
        className="chart-title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span>{title}</span>
        {timeFrame && (
          <span
            style={{
              color: "var(--text-muted)",
              fontWeight: 400,
              fontSize: "12px",
            }}
          >
            {timeFrame}
          </span>
        )}
      </div>

      {/* Legend */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}
      >
        {Array.from({ length: legendLimit }, (_, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 3 }}
          >
            <div
              data-testid="per-core-legend-swatch"
              data-core-color={coreColors[i]}
              style={{
                width: 10,
                height: 3,
                borderRadius: 2,
                background: coreColors[i],
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              Core {i}
            </span>
          </div>
        ))}
        {showMore && (
          <span
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            +{activeCores - legendLimit} more cores
          </span>
        )}
      </div>

      <div ref={chartRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {chartSize && (
          <div style={{ width: chartSize.width, height: chartSize.height }}>
            <LineChart
              data={seriesData}
              width={chartSize.width}
              height={chartSize.height}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              padding={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 4" />
              <XAxis
                dataKey="x"
                type="number"
                domain={[0, dataMaxX]}
                ticks={chartData.map((_val: any, i: number) => i)}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={{ stroke: chartColors.axis }}
                interval="equidistantPreserveStart"
              />
              <YAxis
                width={28}
                type="number"
                domain={[0, 100]}
                tickValues={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={{ stroke: chartColors.axis }}
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
                offset={8}
              />
              {data.map((history, coreIdx) => {
                if (!history || history.length === 0) return null;
                const dataKey = `core${coreIdx}`;
                const color = coreColors[coreIdx] || "#888";
                return (
                  <Line
                    key={dataKey}
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                    isAnimationActive={false}
                    animationDuration={0}
                    activeDot={{
                      r: 4,
                      stroke: chartColors.dotStroke,
                      strokeWidth: 1,
                      fill: color,
                    }}
                  />
                );
              })}
            </LineChart>
          </div>
        )}
      </div>
    </div>
  );
}
