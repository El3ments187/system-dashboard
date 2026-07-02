import { useMemo, useState, useEffect, useRef } from "react";
import MetricCard from "./MetricCard";
import { MetricHistoryPoint } from "../../types/metrics";

interface ChartCardProps {
  genTpsHistory: MetricHistoryPoint[] | null;
  promptTpsHistory: MetricHistoryPoint[] | null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeStats(history: MetricHistoryPoint[] | null) {
  const valid =
    history
      ?.filter((p) => p.value != null && !isNaN(p.value as number))
      .map((p) => p.value as number) ?? [];
  if (valid.length === 0) return { current: null, average: null, peak: null };

  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    current: valid[valid.length - 1],
    average: Math.round((sum / valid.length) * 100) / 100,
    peak: Math.max(...valid),
  };
}

export default function ChartCard({
  genTpsHistory,
  promptTpsHistory,
}: ChartCardProps) {
  const [chartComponents, setChartComponents] = useState<Record<
    string,
    unknown
  > | null>(null);
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
        timestampMs: g?.timestamp instanceof Date ? g.timestamp.getTime() : 0,
        timeLabel: g ? formatTime(g.timestamp) : "",
        genTps:
          g?.value != null ? Math.round((g.value as number) * 10) / 10 : null,
        promptTps:
          p?.value != null ? Math.round((p.value as number) * 10) / 10 : null,
      };
    });
  }, [genTpsHistory, promptTpsHistory]);

  const genStats = computeStats(genTpsHistory);
  const promptStats = computeStats(promptTpsHistory);

  if (!chartComponents || !chartSize) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <MetricCard
            label="Gen TPS"
            value={genStats.current}
            color="var(--success)"
          />
          <MetricCard label="Avg Gen" value={genStats.average} />
          <MetricCard label="Peak Gen" value={genStats.peak} />
          <div className="w-px bg-zinc-700 mx-1" />
          <MetricCard
            label="Prompt TPS"
            value={promptStats.current}
            color="var(--accent-primary)"
          />
          <MetricCard label="Avg Prompt" value={promptStats.average} />
          <MetricCard label="Peak Prompt" value={promptStats.peak} />
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
        <MetricCard
          label="Gen TPS"
          value={genStats.current}
          color="var(--success)"
        />
        <MetricCard label="Avg Gen" value={genStats.average} />
        <MetricCard label="Peak Gen" value={genStats.peak} />
        <div className="w-px bg-zinc-700 mx-1" />
        <MetricCard
          label="Prompt TPS"
          value={promptStats.current}
          color="var(--accent-primary)"
        />
        <MetricCard label="Avg Prompt" value={promptStats.average} />
        <MetricCard label="Peak Prompt" value={promptStats.peak} />
      </div>
      <div ref={chartRef} style={{ height: 180, overflow: "hidden" }}>
        <div style={{ width: chartSize.width, height: chartSize.height }}>
          <AreaChart
            data={chartData}
            width={chartSize.width}
            height={chartSize.height}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            padding={{ top: 2, right: 2, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, dataMaxX]}
              tick={{ fontSize: 8, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--chart-axis)" }}
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
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickFormatter={(v: number) => `${v} TPS`}
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
                    <div style={{ color: "var(--success)" }}>
                      Gen TPS: {d.genTps ?? "\u2014"}
                    </div>
                    <div style={{ color: "var(--accent-primary)" }}>
                      Prompt TPS: {d.promptTps ?? "\u2014"}
                    </div>
                  </div>
                );
              }}
              cursor={{
                stroke: "var(--chart-crosshair)",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            <Area
              dataKey="genTps"
              stroke="var(--success)"
              fill="color-mix(in srgb, var(--success) 10%, transparent)"
              strokeWidth={1.5}
              fillOpacity={0.3}
              isAnimationActive={false}
              animationDuration={0}
              activeDot={{
                r: 3,
                stroke: "var(--chart-dot-stroke)",
                strokeWidth: 1.5,
                fill: "var(--success)",
              }}
            />
            <Area
              dataKey="promptTps"
              stroke="var(--accent-primary)"
              fill="color-mix(in srgb, var(--accent-primary) 10%, transparent)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fillOpacity={0.2}
              isAnimationActive={false}
              animationDuration={0}
              activeDot={{
                r: 3,
                stroke: "var(--chart-dot-stroke)",
                strokeWidth: 1.5,
                fill: "var(--accent-primary)",
              }}
            />
          </AreaChart>
        </div>
      </div>
    </div>
  );
}
