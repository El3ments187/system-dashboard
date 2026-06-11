import { useMemo, useEffect, useState, useRef } from 'react';
import { MetricHistoryPoint } from '../types/metrics';
import { useTooltip } from '../components/common/TooltipProvider';
import { getMetricDescription } from '../data/metricDescriptions';

interface ChartProps {
  accent: { color: string; glow: string };
  title: string;
  data: MetricHistoryPoint[] | Record<string, number | null>[];
  color?: string;
  timeFrame?: string;
  dataKeys?: string[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MetricChart({ accent, title, data, color, timeFrame, dataKeys }: ChartProps) {
  const tooltip = useTooltip();
  const [chartComponents, setChartComponents] = useState<Record<string, unknown> | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const pendingTooltipRef = useRef<{ timestamp: string; series: Array<{ name: string; value: string; color?: string }>; description?: ReturnType<typeof getMetricDescription> } | null>(null);

  useEffect(() => {
    if (pendingTooltipRef.current) {
      tooltip.setChartTooltip(pendingTooltipRef.current);
      pendingTooltipRef.current = null;
    }
  });

  useEffect(() => {
    import('recharts').then((recharts) => {
      setChartComponents(recharts);
    });
  }, []);

  useEffect(() => {
    const update = () => {
      const els = document.querySelectorAll('.chart-container');
      const arr = Array.from(els);
      arr.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) {
          const idx = arr.indexOf(el);
          if (idx === i) {
            setChartWidth(Math.round(rect.width));
          }
        }
      });
    };
    update();
    const ro = new ResizeObserver(update);
    document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Multi-series path: data already has the fields referenced by dataKeys (e.g. memory, swap)
    if (dataKeys && dataKeys.length > 1) {
      return data.map((p: any) => ({
        timestampMs: p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime(),
        name: formatTime(p.timestamp),
        ...p,
      }));
    }

    // Storage single-series path
    if (dataKeys && data.length > 0 && 'read' in (data[0] as Record<string, unknown>)) {
      const typed = data as any[];
      return typed
        .map(p => ({
          timestampMs: p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime(),
          name: formatTime(p.timestamp),
          read: p.read != null ? Math.round(p.read * 10) / 10 : null,
          write: p.write != null ? Math.round(p.write * 10) / 10 : null,
        }));
    }

    // Generic single-series path
    return data
      .map(p => ({
        timestampMs: p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime(),
        x: (p as MetricHistoryPoint).slot ?? 0,
        name: formatTime((p as MetricHistoryPoint).timestamp),
        value: p.value != null ? Math.round((p.value as number) * 10) / 10 : null,
      }));
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
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>
              {timeFrame}
            </span>
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

  const w = chartWidth || 1200;

  return (
    <div className="chart-container">
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{title}</span>
        {timeFrame && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>
            {timeFrame}
          </span>
        )}
      </div>
      {dataKeys && dataKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          {dataKeys.map((key, i) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 4, borderRadius: 2, background: seriesColors[i % seriesColors.length] }} />
              <span style={{ fontSize: 10, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}>
                {seriesLabels[key] || key}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ResponsiveContainer width={w} height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid stroke="var(--border-light)" strokeDasharray="4 4" />
             <XAxis
               dataKey="timestampMs"
               type="time"
               domain={['dataMin', 'dataMax']}
               tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
               axisLine={{ stroke: 'var(--border-color)' }}
               tickFormatter={(t) => new Date(t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
             />
            <YAxis
              type="number"
              domain={[0, 100]}
              fontSize={10}
              axisLine={{ stroke: 'var(--border-color)' }}
            />
            <Tooltip
              isAnimationActive={false}
              animationDuration={0}
              contentStyle={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                fontSize: 12,
              }}
              content={(props: any) => {
                if (!props || !props.payload || !props.payload[0]) return null;
                const { data } = props;
                const ts = (data as any)?.timestampMs ?? '';
                const timestamp = ts ? new Date(ts).toISOString() : '';

                const series = dataKeys ? dataKeys.map((key, i) => {
                  const val = (data as any)?.[key];
                  const color = seriesColors[i % seriesColors.length];
                  return { name: seriesLabels[key] || key, value: val != null ? `${val}%` : 'N/A', color };
                }) : [{ name: 'Value', value: (data as any)?.value != null ? `${(data as any).value}%` : 'N/A' }];

                const descKey = dataKeys && dataKeys.length === 1 ? `cpu_${dataKeys[0]}` : title.toLowerCase().replace(/\s+/g, '_');
                const description = getMetricDescription(descKey);

                pendingTooltipRef.current = { timestamp, series, description };
                return null;
              }}
              onLeave={() => tooltip.setChartTooltip(null)}
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
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
