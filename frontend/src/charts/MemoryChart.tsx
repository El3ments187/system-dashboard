import { useMemo } from 'react';
import { useMetricsContext } from '../context/MetricsContext';
import MetricChart from './MetricChart';

interface ChartProps {
  accent: { color: string; glow: string };
}

export default function MemoryChart({ accent }: ChartProps) {
  const { memoryHistory, swapHistory } = useMetricsContext();

  const mergedData = useMemo(() => {
    if (!memoryHistory || !swapHistory) return [];
    const memMap = new Map<number, number>();
    for (const point of memoryHistory) {
      if (point.value != null) memMap.set(point.slot, point.value);
    }
    const result: any[] = [];
    const allSlots = new Set([...memMap.keys(), ...swapHistory.map((p: any) => p.slot)]);
    for (const slot of allSlots) {
      const memPoint = memoryHistory.find((p: any) => p.slot === slot);
      const swapPoint = swapHistory.find((p: any) => p.slot === slot);
      const ts = memPoint?.timestamp ? new Date(memPoint.timestamp) : new Date();
      result.push({
        slot,
        timestamp: ts,
        name: ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        memory: memPoint?.value != null ? Math.round((memPoint.value as number) * 10) / 10 : null,
        swap: swapPoint?.value != null ? Math.round((swapPoint.value as number) * 10) / 10 : null,
      });
    }
    return result.sort((a, b) => (a.slot as number) - (b.slot as number));
  }, [memoryHistory, swapHistory]);

  return (
    <MetricChart
      accent={accent}
      title="Memory Utilization History"
      data={mergedData}
      dataKeys={['memory', 'swap']}
      timeFrame="(Last 60s)"
    />
  );
}
