import { useMemo, useState, useEffect, useRef, useId } from "react";
import { MetricHistoryPoint } from "../types/metrics";
import ChartTooltip from "../components/common/ChartTooltip";
import {
  resolveAccentColors,
  resolveAccentColor,
  useAccentSync,
  SECONDARY_LINE_DASH,
} from "../utils/accentColors";
import { ChartFrame } from "../components/shared/CardComponents";
import { getChartChromeColors } from "../utils/chartColors";

function fillOpacityFor(isSecondary: boolean, i: number): number {
  if (!isSecondary) return 0.12;
  return i === 1 ? 0.2 : 0.3;
}

interface ChartProps {
  accent: { color: string; glow: string };
  title: string;
  data: MetricHistoryPoint[] | Record<string, number | null>[];
  color?: string;
  timeFrame?: string;
  dataKeys?: string[];
  yDomain?: [number, number];
  yAxisTickValues?: number[];
  unit?: string;
  style?: React.CSSProperties;
  chartType?: "area" | "bar";
  // Dual-axis support
  dualData?: MetricHistoryPoint[];
  dualYDomain?: [number, number];
  dualYAxisTickValues?: number[];
  dualUnit?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}

function getSeriesColors(contextEl?: Element | null): string[] {
  return resolveAccentColors(2, false, contextEl);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function resolveTimestampMs(p: MetricHistoryPoint | undefined): number {
  if (!p) return 0;
  return p.timestamp.getTime();
}

export default function MetricChart({
  title,
  data,
  color: _color,
  timeFrame,
  dataKeys,
  yDomain,
  yAxisTickValues,
  unit,
  style,
  chartType = "area",
  dualData,
  dualYDomain,
  dualYAxisTickValues,
  dualUnit,
  primaryLabel,
  secondaryLabel,
}: ChartProps) {
  const gradientId = `mc-fill-${useId().replace(/:/g, "")}`;
  const [chartComponents, setChartComponents] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [chartColors, setChartColors] = useState(() => getChartChromeColors());
  const [seriesColors, setSeriesColors] = useState(() => getSeriesColors());
  const [strokeColor, setStrokeColor] = useState(
    () => _color || resolveAccentColor(),
  );
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
    setChartColors(getChartChromeColors());
    setSeriesColors(getSeriesColors(chartRef.current));
    if (!_color) {
      setStrokeColor(resolveAccentColor(chartRef.current));
    }
  }, [_color, !!chartComponents]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (dataKeys && dataKeys.length > 1) {
      const result = data.map((p: any, idx: number) => ({
        x: idx,
        timestampMs:
          p.timestamp instanceof Date
            ? p.timestamp.getTime()
            : new Date(p.timestamp).getTime(),
        timeLabel: formatTime(
          p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp),
        ),
        ...p,
      }));
      return result;
    }

    if (
      dataKeys &&
      data.length > 0 &&
      "read" in (data[0] as Record<string, unknown>)
    ) {
      const typed = data as any[];
      const result = typed.map((p, idx) => ({
        x: idx,
        timestampMs:
          p.timestamp instanceof Date
            ? p.timestamp.getTime()
            : new Date(p.timestamp).getTime(),
        timeLabel: formatTime(
          p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp),
        ),
        read: p.read != null ? Math.round(p.read * 10) / 10 : null,
        write: p.write != null ? Math.round(p.write * 10) / 10 : null,
      }));
      return result;
    }

    // Dual-axis mode: merge primary and secondary data
    if (dualData && dualData.length > 0) {
      const maxLen = Math.max(data.length, dualData.length);
      const result = Array.from({ length: maxLen }, (_, idx) => {
        const p = data[idx] as MetricHistoryPoint | undefined;
        const d = dualData[idx] as MetricHistoryPoint | undefined;
        return {
          x: idx,
          timestampMs: resolveTimestampMs(p),
          timeLabel: p ? formatTime((p as MetricHistoryPoint).timestamp) : "",
          value:
            p?.value != null ? Math.round((p.value as number) * 10) / 10 : null,
          dualValue:
            d?.value != null ? Math.round((d.value as number) * 10) / 10 : null,
        };
      });
      return result;
    }

    const result = data.map((p, idx) => ({
      x: idx,
      timestampMs: resolveTimestampMs(p as MetricHistoryPoint),
      timeLabel: formatTime((p as MetricHistoryPoint).timestamp),
      value: p.value != null ? Math.round((p.value as number) * 10) / 10 : null,
    }));
    return result;
  }, [data, dataKeys, dualData]);

  const seriesLabels: Record<string, string> = {
    memory: "Memory Utilization (%)",
    swap: "Swap Utilization (%)",
  };

  if (!chartComponents) {
    return (
      <ChartFrame style={style}>
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
      </ChartFrame>
    );
  }

  const AreaChart = chartComponents.AreaChart as any;
  const Area = chartComponents.Area as any;
  const BarChart = chartComponents.BarChart as any;
  const Bar = chartComponents.Bar as any;
  const XAxis = chartComponents.XAxis as any;
  const YAxis = chartComponents.YAxis as any;
  const CartesianGrid = chartComponents.CartesianGrid as any;
  const Tooltip = chartComponents.Tooltip as any;

  const dataMaxX = chartData.length > 0 ? chartData.length - 1 : 0;

  const renderAreaElements = (A: any) => {
    if (dualData && dualData.length > 0) {
      return (
        <>
          <A
            yAxisId="left"
            dataKey="value"
            stroke="var(--accent-primary)"
            fill="var(--accent-primary)"
            strokeWidth={2}
            fillOpacity={0.12}
            isAnimationActive={false}
            animationDuration={0}
            activeDot={{
              r: 5,
              stroke: chartColors.dotStroke,
              strokeWidth: 2,
              fill: strokeColor,
            }}
          />
          <A
            yAxisId="right"
            dataKey="dualValue"
            stroke={seriesColors[1]}
            fill={`${seriesColors[1]}20`}
            strokeWidth={2}
            strokeDasharray={SECONDARY_LINE_DASH}
            fillOpacity={0.2}
            isAnimationActive={false}
            animationDuration={0}
            activeDot={{
              r: 5,
              stroke: chartColors.dotStroke,
              strokeWidth: 2,
              fill: seriesColors[1],
            }}
          />
        </>
      );
    }
    if (dataKeys) {
      return dataKeys.map((key: string, i: number) => {
        const keyColor = seriesColors[i % seriesColors.length];
        const isSecondary = i > 0;
        return (
          <A
            key={key}
            dataKey={key}
            stroke={isSecondary ? keyColor : "var(--accent-primary)"}
            fill={isSecondary ? `${keyColor}20` : "var(--accent-primary)"}
            strokeWidth={2}
            strokeDasharray={i === 1 ? SECONDARY_LINE_DASH : "0"}
            fillOpacity={fillOpacityFor(isSecondary, i)}
            isAnimationActive={false}
            animationDuration={0}
            activeDot={{
              r: 5,
              stroke: chartColors.dotStroke,
              strokeWidth: 2,
              fill: keyColor,
            }}
          />
        );
      });
    }
    return (
      <A
        dataKey="value"
        stroke={`url(#${gradientId}-stroke)`}
        fill={`url(#${gradientId})`}
        strokeWidth={2}
        fillOpacity={0.35}
        isAnimationActive={false}
        animationDuration={0}
        activeDot={{
          r: 5,
          stroke: chartColors.dotStroke,
          strokeWidth: 2,
          fill: strokeColor,
        }}
      />
    );
  };

  const fillGradientDefs = (
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop
          offset="0%"
          style={{ stopColor: "var(--accent-fill-stop-1)", stopOpacity: 0.5 }}
        />
        <stop
          offset="100%"
          style={{ stopColor: "var(--accent-fill-stop-2)", stopOpacity: 0.05 }}
        />
      </linearGradient>
      {/* Full-opacity twin used for the line stroke itself, so Gradient/Rainbow/Spectrum
          modes visibly tint the line, not just the area fill beneath it. Under Solid mode
          --accent-fill-stop-1/2 are identical, so this renders as a flat line — no change. */}
      <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
        <stop
          offset="0%"
          style={{ stopColor: "var(--accent-fill-stop-1)", stopOpacity: 1 }}
        />
        <stop
          offset="100%"
          style={{ stopColor: "var(--accent-fill-stop-2)", stopOpacity: 1 }}
        />
      </linearGradient>
    </defs>
  );

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

    // Dual-axis mode tooltip
    if (dualData && dualData.length > 0) {
      const primaryVal = firstDatum?.value;
      const secondaryVal = firstDatum?.dualValue;
      return (
        <ChartTooltip
          timestamp={timestamp}
          series={[
            {
              name: primaryLabel || title,
              value: primaryVal != null ? `${primaryVal}${unit || "%"}` : "N/A",
              color: strokeColor,
            },
            {
              name: secondaryLabel || "Secondary",
              value:
                secondaryVal != null
                  ? `${secondaryVal}${dualUnit || ""}`
                  : "N/A",
              color: seriesColors[1],
            },
          ]}
        />
      );
    }

    if (dataKeys) {
      const series = payloadArr.map((entry: any, i: number) => ({
        name: seriesLabels[entry.name] || entry.name,
        value: entry.value != null ? `${entry.value}%` : "N/A",
        color: seriesColors[i % seriesColors.length],
      }));
      return <ChartTooltip timestamp={timestamp} series={series} />;
    }

    const val = payloadArr[0]?.value;
    return (
      <ChartTooltip
        timestamp={timestamp}
        series={[
          {
            name: title,
            value: val != null ? `${val}${unit || "%"}` : "N/A",
            color: strokeColor,
          },
        ]}
      />
    );
  };

  return (
    <ChartFrame style={style}>
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
      {dataKeys && dataKeys.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          {dataKeys.map((key, i) => (
            <div
              key={key}
              style={{ display: "flex", alignItems: "center", gap: 3 }}
            >
              {i === 1 ? (
                <div
                  style={{
                    width: 10,
                    height: 0,
                    borderBottom: `2px dashed ${seriesColors[i % seriesColors.length]}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 10,
                    height: 3,
                    borderRadius: 2,
                    background:
                      i === 0
                        ? "var(--accent-primary)"
                        : seriesColors[i % seriesColors.length],
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 9,
                  color: "var(--text-primary)",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              >
                {seriesLabels[key] || key}
              </span>
            </div>
          ))}
        </div>
      )}
      {dualData && dualData.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div
              style={{
                width: 10,
                height: 3,
                borderRadius: 2,
                background: "var(--accent-primary)",
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              {primaryLabel || title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div
              style={{
                width: 10,
                height: 3,
                borderRadius: 2,
                background: seriesColors[1],
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              {secondaryLabel || "Secondary"}
            </span>
          </div>
        </div>
      )}
      <div ref={chartRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {chartSize && (
          <div style={{ width: chartSize.width, height: chartSize.height }}>
            {chartType === "bar" ? (
              <BarChart
                data={chartData}
                width={chartSize.width}
                height={chartSize.height}
                barGap={2}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={chartColors.grid}
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[0, dataMaxX]}
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
                  domain={yDomain || [0, 100]}
                  tickValues={yAxisTickValues}
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
                <Bar
                  dataKey="value"
                  fill="var(--accent-primary)"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                  animationDuration={0}
                />
              </BarChart>
            ) : (
              <AreaChart
                data={chartData}
                width={chartSize.width}
                height={chartSize.height}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                {fillGradientDefs}
                <CartesianGrid
                  stroke={chartColors.grid}
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[0, dataMaxX]}
                  ticks={chartData.map((_, i) => i)}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickFormatter={(tickVal: number) => {
                    const pt = chartData[Math.round(tickVal)];
                    return pt ? pt.timeLabel : "";
                  }}
                  interval="equidistantPreserveStart"
                />
                {dualData && dualData.length > 0 ? (
                  <>
                    <YAxis
                      width={28}
                      yAxisId="left"
                      type="number"
                      domain={yDomain || [0, 100]}
                      tickValues={yAxisTickValues}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={{ stroke: chartColors.axis }}
                    />
                    <YAxis
                      width={28}
                      yAxisId="right"
                      type="number"
                      orientation="right"
                      domain={dualYDomain || [0, 100]}
                      tickValues={dualYAxisTickValues}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={{ stroke: chartColors.axis }}
                    />
                  </>
                ) : (
                  <YAxis
                    width={28}
                    type="number"
                    domain={yDomain || [0, 100]}
                    tickValues={yAxisTickValues}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    axisLine={{ stroke: chartColors.axis }}
                  />
                )}
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
                {renderAreaElements(Area)}
              </AreaChart>
            )}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
