import { useMetricsContext } from "../context/MetricsContext";
import MetricChart from "./MetricChart";

interface ChartProps {
  accent: { color: string; glow: string };
}

export default function GpuChart({ accent }: ChartProps) {
  const { gpuHistory } = useMetricsContext();
  return (
    <MetricChart
      accent={accent}
      title="GPU Utilization History"
      data={gpuHistory}
      timeFrame="(Last 60s)"
    />
  );
}
