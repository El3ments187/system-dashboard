import { useMetricsContext } from '../context/MetricsContext';
import MetricChart from './MetricChart';

interface ChartProps {
  accent: { color: string; glow: string };
}

export default function CpuChart({ accent }: ChartProps) {
  const { cpuHistory } = useMetricsContext();
  return <MetricChart accent={accent} title="CPU Utilization History" data={cpuHistory} timeFrame="(Last 60s)" />;
}
