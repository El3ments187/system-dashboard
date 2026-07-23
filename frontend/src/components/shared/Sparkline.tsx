import { MetricHistoryPoint } from "../../types/metrics";

interface SparklineProps {
  data: MetricHistoryPoint[] | null;
  color?: string;
  width?: number | string;
  height?: number;
  stretch?: boolean;
}

export default function Sparkline({
  data,
  color = "var(--accent-primary)",
  width = 60,
  height = 18,
  stretch = false,
}: SparklineProps) {
  const resolvedWidth = stretch ? "100%" : width;

  const values = (data ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  if (values.length < 2) {
    return <svg width={resolvedWidth} height={stretch ? "100%" : height} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // When width is a string (e.g. "100%"), use a fixed coordinate space and
  // let the SVG viewBox + CSS handle responsive scaling.
  const coordW = typeof resolvedWidth === "number" ? resolvedWidth : 100;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * coordW;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const points = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = `0,${height} ${points} ${coordW},${height}`;

  const viewBox =
    typeof resolvedWidth === "string" ? `0 0 ${coordW} ${height}` : undefined;

  return (
    <svg
      width={resolvedWidth}
      height={stretch ? "100%" : height}
      viewBox={viewBox}
      preserveAspectRatio={viewBox ? "none" : undefined}
      style={
        stretch
          ? { display: "block", width: "100%", height: "100%" }
          : { display: "block" }
      }
    >
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
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
      />
    </svg>
  );
}
