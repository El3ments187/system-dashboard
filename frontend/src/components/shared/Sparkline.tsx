import { MetricHistoryPoint } from "../../types/metrics";

interface SparklineProps {
  data: MetricHistoryPoint[] | null;
  color?: string;
  width?: number;
  height?: number;
}

export default function Sparkline({
  data,
  color = "var(--accent-primary)",
  width = 60,
  height = 18,
}: SparklineProps) {
  const values = (data ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  if (values.length < 2) {
    return <svg width={width} height={height} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const points = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon
        points={areaPoints}
        fill={color}
        fillOpacity={0.15}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
