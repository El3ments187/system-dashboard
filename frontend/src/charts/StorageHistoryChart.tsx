import { useMemo, useEffect, useState, useRef } from 'react';
import { StorageHistoryPoint } from '../types/metrics';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTooltip } from '../components/common/TooltipProvider';

interface ChartProps {
  accent: { color: string; glow: string };
  data: Map<string, StorageHistoryPoint[]>;
}

const SERIES_COLORS = ['#4adea4', '#f59b1c', '#60a5f5', '#f5a660', '#a6f5a0', '#f5a6a6', '#a6a6f5', '#f5f5a6'];

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytesPerSec(bps: number): string {
  if (bps <= 0) return '0';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), units.length - 1);
  return (bps / Math.pow(1024, i)).toFixed(1) + units[i];
}

export default function StorageHistoryChart({ accent, data }: ChartProps) {
  const tooltip = useTooltip();
  const [chartComponents, setChartComponents] = useState<Record<string, unknown> | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeTab, setActiveTab] = useState<'throughput' | 'utilization'>('throughput');
  const pendingTooltipRef = useRef<{ timestamp: string; series: Array<{ name: string; value: string; color?: string }> } | null>(null);

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
      const els = document.querySelectorAll('.storage-chart-container');
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
    document.querySelectorAll('.storage-chart-container').forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  const chartData = useMemo(() => {
    const entries = Array.from(data.entries());
    if (entries.length === 0) return [];

    // Merge all device data points by slot
    const slotMap = new Map<number, any>();

    for (const [device, points] of entries) {
      for (const point of points) {
        if (!point) continue;
        const slot = point.slot;
        if (!slotMap.has(slot)) {
          slotMap.set(slot, { slot, name: formatTime(point.timestamp), time: new Date(point.timestamp).getTime() });
        }
        const entry = slotMap.get(slot);
        entry[`${device}_read`] = point.read_bytes_per_sec;
        entry[`${device}_write`] = point.write_bytes_per_sec;
        entry[`${device}_util`] = point.utilization;
      }
    }

    return Array.from(slotMap.values())
      .sort((a, b) => a.time - b.time);
  }, [data]);

  const deviceNames = Array.from(data.keys()).sort();
  const hasData = chartData.length > 0;

  if (!chartComponents) {
    return (
      <div className="chart-container storage-chart-container" style={{ flex: 1, minHeight: 0, height: 0 }}>
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>Storage Performance</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>60s window</span>
        </div>
        <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          Loading chart...
        </div>
      </div>
    );
  }

  const w = chartWidth || 1200;

  return (
    <div className="chart-container storage-chart-container" style={{ flex: 1, minHeight: 0, height: 0 }}>
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Storage Performance</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>60s window</span>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['throughput', 'utilization'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid var(--border-color)',
              background: activeTab === tab ? 'var(--bg-secondary)' : 'transparent',
              color: activeTab === tab ? accent.color : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: activeTab === tab ? 600 : 400,
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
            }}
          >
            {tab === 'throughput' ? 'Throughput' : 'Utilization'}
          </button>
        ))}
      </div>

      {hasData ? (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            {deviceNames.map((device, i) => (
              <div key={device} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 4, borderRadius: 2, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                <span style={{ fontSize: 10, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}>
                  {device}
                </span>
                {activeTab !== 'utilization' && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}>
                    R/W
                  </span>
                )}
              </div>
            ))}
          </div>

          <div style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
            onMouseLeave={() => tooltip.setChartTooltip(null)}
          >
            <ResponsiveContainer width={w} height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid stroke="var(--border-light)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="name"
                  type="category"
                  tick={false}
                  axisLine={{ stroke: 'var(--border-color)' }}
                />
                <YAxis
                  type="number"
                  domain={activeTab === 'utilization' ? [0, 100] : [0, 'dataMax']}
                  fontSize={10}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  tickFormatter={(v: number) => {
                    if (activeTab === 'throughput') return formatBytesPerSec(v);
                    return `${v}%`;
                  }}
                />
               <Tooltip
                   isAnimationActive={false}
                   animationDuration={0}
                  content={(props: any) => {
                       const { payload } = props;
                       if (!payload || !payload[0]) return null;
                       const datum = payload[0].datum;
                      if (!datum) return null;

                      const series = deviceNames.flatMap(device => {
                         const readKey = `${device}_read`;
                         const writeKey = `${device}_write`;
                         const utilKey = `${device}_util`;
                         const readVal = (datum as any)[readKey] ?? 0;
                         const writeVal = (datum as any)[writeKey] ?? 0;
                         const utilVal = (datum as any)[utilKey] ?? 0;
                         const color = SERIES_COLORS[deviceNames.indexOf(device) % SERIES_COLORS.length];
                         return [
                           { name: `${device} Read`, value: formatBytesPerSec(readVal), color },
                           { name: `${device} Write`, value: formatBytesPerSec(writeVal), color },
                           { name: `${device} Util`, value: `${utilVal.toFixed(1)}%`, color },
                         ];
                      });

                      pendingTooltipRef.current = { timestamp: datum.name, series };
                      return null;
                   }}
                />
                 {deviceNames.map((device, i) => {
                     const color = SERIES_COLORS[i % SERIES_COLORS.length];
                     const baseKey = activeTab === 'throughput' ? `${device}_read` : `${device}_util`;
                     const writeKey = activeTab === 'throughput' ? `${device}_write` : null;
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
                       />
                       {writeKey && (
                         <Area
                           dataKey={writeKey}
                           stroke={color}
                           fill={`${color}10`}
                           strokeWidth={2}
                           strokeDasharray="4 4"
                           fillOpacity={0.2}
                           isAnimationActive={false}
                           animationDuration={0}
                         />
                       )}
                     </g>
                   );
                 })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          Waiting for data...
        </div>
      )}
    </div>
  );
}
