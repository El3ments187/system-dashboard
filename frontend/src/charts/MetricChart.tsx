import { useMemo, useState, useEffect } from 'react';
import { MetricHistoryPoint } from '../types/metrics';
import ChartTooltip from '../components/common/ChartTooltip';

interface ChartProps {
  accent: { color: string; glow: string };
  title: string;
  data: MetricHistoryPoint[] | Record<string, number | null>[];
  color?: string;
  timeFrame?: string;
  dataKeys?: string[];
}

const CROSSHAIR_COLOR = '#5a6578';
const GRID_COLOR = '#1e2535';
const AXIS_COLOR = '#2a3143';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MetricChart({ accent, title, data, color, timeFrame, dataKeys }: ChartProps) {
  const [chartComponents, setChartComponents] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    import('recharts').then((recharts) => setChartComponents(recharts));
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (dataKeys && dataKeys.length > 1) {
      const result = data.map((p: any, idx: number) => ({
        x: idx,
        timestampMs: p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime(),
        timeLabel: formatTime(p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp)),
        ...p,
      }));
      // [TRACE] Stage 3: Chart data (multi-series) — last point
      if (result.length > 0) {
        console.log(`[TRACE-CHART] title=${title} mode=multi-series last_point=`, JSON.stringify(result[result.length - 1]));
      }
      return result;
    }

    if (dataKeys && data.length > 0 && 'read' in (data[0] as Record<string, unknown>)) {
      const typed = data as any[];
      const result = typed.map((p, idx) => ({
        x: idx,
        timestampMs: p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime(),
        timeLabel: formatTime(p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp)),
        read: p.read != null ? Math.round(p.read * 10) / 10 : null,
        write: p.write != null ? Math.round(p.write * 10) / 10 : null,
      }));
      if (result.length > 0) {
        console.log(`[TRACE-CHART] title=${title} mode=read-write last_point=`, JSON.stringify(result[result.length - 1]));
      }
      return result;
    }

    const result = data.map((p, idx) => ({
      x: idx,
      timestampMs: typeof p.timestamp === 'number' ? p.timestamp : p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(String(p.timestamp)).getTime(),
      timeLabel: formatTime((p as MetricHistoryPoint).timestamp),
      value: p.value != null ? Math.round((p.value as number) * 10) / 10 : null,
    }));
    // [TRACE] Stage 3: Chart data (single-series) — last point
    if (result.length > 0) {
      const last = result[result.length - 1];
      const origLast = data[data.length - 1] as MetricHistoryPoint;
      console.log(`[TRACE-CHART] title=${title} mode=single-series orig_value=${origLast.value} -> chart_value=${last.value} point=`, JSON.stringify(last));
    }
    return result;
  }, [data, dataKeys]);

  const seriesColors = [accent.color, accent.glow, '#60a5f5', '#f5a660', '#a6f5a0', '#f5a6a6'];
  const strokeColor = color || accent.color;
  const fillColor = `${strokeColor}20`;

  const seriesLabels: Record<string, string> = {
    memory: 'Memory Utilization (%)',
    swap: 'Swap Utilization (%)',
  };

  if (!chartComponents) {
    return (
      <div className="chart-container">
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>{title}</span>
          {timeFrame && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>{timeFrame}</span>
          )}
        </div>
        <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
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
  const ResponsiveContainer = chartComponents.ResponsiveContainer as any;

  const dataMaxX = chartData.length > 0 ? chartData.length - 1 : 0;

  const tooltipContent = (props: any) => {
    if (!props || !props.payload || !props.payload[0] || !props.active) return null;
    const payloadArr = props.payload;
    const firstDatum = payloadArr[0]?.payload ?? {};

    // [TRACE] Stage 4: Tooltip payload — what Recharts gives us
    console.log(`[TRACE-TOOLTIP] title=${title} index=${props.label} payload_point=`, JSON.stringify(firstDatum), 'all_payloads=', JSON.stringify(payloadArr.map((e: any) => ({ name: e.name, value: e.value }))));

    const ts = firstDatum?.timestampMs ?? 0;
    const timestamp = ts ? new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

    if (dataKeys) {
      const series = payloadArr.map((entry: any, i: number) => ({
        name: seriesLabels[entry.name] || entry.name,
        value: entry.value != null ? `${entry.value}%` : 'N/A',
        color: seriesColors[i % seriesColors.length],
      }));
      return <ChartTooltip timestamp={timestamp} series={series} />;
    }

    const val = payloadArr[0]?.value;
    return <ChartTooltip timestamp={timestamp} series={[{
      name: title,
      value: val != null ? `${val}%` : 'N/A',
      color: strokeColor,
    }]} />;
  };

  return (
    <div className="chart-container">
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{title}</span>
        {timeFrame && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>{timeFrame}</span>
        )}
      </div>
      {dataKeys && dataKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          {dataKeys.map((key, i) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 4, borderRadius: 2, background: seriesColors[i % seriesColors.length] }} />
              <span style={{ fontSize: 10, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                {seriesLabels[key] || key}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ResponsiveContainer>
          <AreaChart data={chartData}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="4 4" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, dataMaxX]}
              ticks={chartData.map((_, i) => i)}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: AXIS_COLOR }}
              tickFormatter={(tickVal: number) => {
                const pt = chartData[Math.round(tickVal)];
                return pt ? pt.timeLabel : '';
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: AXIS_COLOR }}
            />
            <Tooltip
              isAnimationActive={false}
              animationDuration={0}
              content={tooltipContent}
              cursor={{ stroke: CROSSHAIR_COLOR, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5 }}
              offset={12}
            />
            {dataKeys ? (
              dataKeys.map((key, i) => {
                const keyColor = seriesColors[i % seriesColors.length];
                return (
                  <Area
                    key={key}
                    dataKey={key}
                    stroke={keyColor}
                    fill={`${keyColor}20`}
                    strokeWidth={2}
                    fillOpacity={0.3}
                    isAnimationActive={false}
                    animationDuration={0}
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: keyColor }}
                  />
                );
              })
            ) : (
              <Area
                dataKey="value"
                stroke={strokeColor}
                fill={fillColor}
                strokeWidth={2}
                fillOpacity={0.3}
                isAnimationActive={false}
                animationDuration={0}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: strokeColor }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
