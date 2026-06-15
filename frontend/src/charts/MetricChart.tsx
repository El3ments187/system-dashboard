import { useMemo, useState, useEffect, useRef } from 'react';
import { MetricHistoryPoint } from '../types/metrics';
import ChartTooltip from '../components/common/ChartTooltip';

interface ChartProps {
  accent: { color: string; glow: string };
  title: string;
  data: MetricHistoryPoint[] | Record<string, number | null>[];
  color?: string;
  timeFrame?: string;
  dataKeys?: string[];
  chartHeight?: number;
}

function getChartColors(): { grid: string; axis: string; crosshair: string; dotStroke: string } {
  const cs = getComputedStyle(document.documentElement);
  return {
    grid: cs.getPropertyValue('--chart-grid').trim() || '#1e2535',
    axis: cs.getPropertyValue('--chart-axis').trim() || '#2a3143',
    crosshair: cs.getPropertyValue('--chart-crosshair').trim() || '#5a6578',
    dotStroke: cs.getPropertyValue('--chart-dot-stroke').trim() || '#fff',
  };
}

function getSeriesColors(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const primary = cs.getPropertyValue('--accent-primary').trim() || '#3B82F6';
   const secondary = cs.getPropertyValue('--accent-secondary').trim() || '#93C5FD';
  return [primary, secondary];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MetricChart({ accent: _props, title, data, color: _color, timeFrame, dataKeys, chartHeight }: ChartProps) {
  const [chartComponents, setChartComponents] = useState<Record<string, unknown> | null>(null);
  const [chartColors, setChartColors] = useState(() => getChartColors());
  const [seriesColors, setSeriesColors] = useState(() => getSeriesColors());
  const [strokeColor, setStrokeColor] = useState(() => {
    if (_color) return _color;
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#3B82F6';
  });
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    import('recharts').then((recharts) => setChartComponents(recharts));
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const updateSize = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        setChartSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
      }
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    updateSize();
    return () => ro.disconnect();
  }, [chartComponents, chartHeight]);

  useEffect(() => {
    const update = () => {
      setChartColors(getChartColors());
      setSeriesColors(getSeriesColors());
      if (!_color) {
        setStrokeColor(getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#3B82F6');
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bg', 'data-accent'] });
    return () => observer.disconnect();
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
      return result;
    }

    const result = data.map((p, idx) => ({
      x: idx,
      timestampMs: typeof p.timestamp === 'number' ? p.timestamp : p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(String(p.timestamp)).getTime(),
      timeLabel: formatTime((p as MetricHistoryPoint).timestamp),
      value: p.value != null ? Math.round((p.value as number) * 10) / 10 : null,
    }));
    return result;
  }, [data, dataKeys]);

  const fillColor = `${strokeColor}20`;

  const seriesLabels: Record<string, string> = {
    memory: 'Memory Utilization (%)',
    swap: 'Swap Utilization (%)',
  };

  if (!chartComponents) {
    return (
      <div className="chart-container" style={chartHeight ? { minHeight: chartHeight } : undefined}>
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>{title}</span>
          {timeFrame && (
         <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>{timeFrame}</span>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
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

  const dataMaxX = chartData.length > 0 ? chartData.length - 1 : 0;

  const tooltipContent = (props: any) => {
    if (!props || !props.payload || !props.payload[0] || !props.active) return null;
    const payloadArr = props.payload;
    const firstDatum = payloadArr[0]?.payload ?? {};

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
    <div className="chart-container" style={chartHeight ? { minHeight: chartHeight } : undefined}>
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{title}</span>
        {timeFrame && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>{timeFrame}</span>
        )}
      </div>
      {dataKeys && dataKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            {dataKeys.map((key, i) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {i === 1 ? (
                  <div style={{ width: 10, height: 0, borderBottom: `2px dashed ${seriesColors[i % seriesColors.length]}` }} />
                ) : (
                  <div style={{ width: 10, height: 3, borderRadius: 2, background: seriesColors[i % seriesColors.length] }} />
                )}
              <span style={{ fontSize: 9, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                {seriesLabels[key] || key}
              </span>
            </div>
          ))}
        </div>
      )}
      <div ref={chartRef} style={{ flex: 1, minHeight: chartHeight ? chartHeight - 28 : 32, overflow: 'hidden' }}>
        {chartSize && (
          <div style={{ width: chartSize.width, height: chartSize.height }}>
            <AreaChart data={chartData} width={chartSize.width} height={chartSize.height}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 4" />
              <XAxis
                dataKey="x"
                type="number"
                domain={[0, dataMaxX]}
                ticks={chartData.map((_, i) => i)}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: chartColors.axis }}
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
                axisLine={{ stroke: chartColors.axis }}
              />
              <Tooltip
                isAnimationActive={false}
                animationDuration={0}
                content={tooltipContent}
                cursor={{ stroke: chartColors.crosshair, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5 }}
               offset={8}
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
                          strokeDasharray={i === 1 ? "5 5" : "0"}
                          fillOpacity={i === 1 ? 0.2 : 0.3}
                          isAnimationActive={false}
                          animationDuration={0}
                          activeDot={{ r: 5, stroke: chartColors.dotStroke, strokeWidth: 2, fill: keyColor }}
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
                  activeDot={{ r: 5, stroke: chartColors.dotStroke, strokeWidth: 2, fill: strokeColor }}
                />
              )}
            </AreaChart>
          </div>
        )}
      </div>
    </div>
  );
}
