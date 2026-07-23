import { MetricHistoryPoint } from "../../types/metrics";

const GAP_MS = 3_000;

function windowAnchorNow(windowMs: number | undefined): number {
  return windowMs != null ? Date.now() : 0;
}

function computeX(
  p: MetricHistoryPoint & { value: number },
  i: number,
  total: number,
  windowMs: number | undefined,
  now: number,
  coordW: number
): number {
  if (windowMs != null) {
    const t = p.timestamp instanceof Date ? p.timestamp.getTime() : now;
    return Math.max(0, Math.min(1, (t - (now - windowMs)) / windowMs)) * coordW;
  }
  return (i / Math.max(total - 1, 1)) * coordW;
}

function computeY(
  value: number,
  domain: [number, number] | undefined,
  height: number,
  flat: boolean,
  min: number,
  range: number
): number {
  if (domain != null) {
    const [d0, d1] = domain;
    const span = d1 - d0 || 1;
    return height - Math.max(0, Math.min(1, (value - d0) / span)) * height;
  }
  if (flat) return height / 2;
  return height - ((value - min) / range) * height;
}

function splitSegments(
  filtered: (MetricHistoryPoint & { value: number })[],
  coords: [number, number][],
  windowMs: number | undefined,
  now: number
): [number, number][][] {
  const segments: [number, number][][] = [];
  let seg: [number, number][] = [coords[0]];
  for (let i = 1; i < filtered.length; i++) {
    if (windowMs != null) {
      const tCurr =
        filtered[i].timestamp instanceof Date
          ? (filtered[i].timestamp as Date).getTime()
          : now;
      const tPrev =
        filtered[i - 1].timestamp instanceof Date
          ? (filtered[i - 1].timestamp as Date).getTime()
          : now;
      if (tCurr - tPrev > GAP_MS) {
        segments.push(seg);
        seg = [];
      }
    }
    seg.push(coords[i]);
  }
  segments.push(seg);
  return segments;
}

function buildLinePath(segments: [number, number][][]): string {
  return segments
    .map((s) => s.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x},${y}`).join(" "))
    .join(" ");
}

function buildAreaPath(segments: [number, number][][], height: number): string {
  return segments
    .filter((s) => s.length >= 2)
    .map((s) => {
      const inner = s.map(([x, y]) => `${x},${y}`).join(" L");
      return `M${s[0][0]},${height} L${inner} L${s[s.length - 1][0]},${height} Z`;
    })
    .join(" ");
}

interface SparklineProps {
  data: MetricHistoryPoint[] | null;
  color?: string;
  width?: number | string;
  height?: number;
  stretch?: boolean;
  windowMs?: number;
  domain?: [number, number];
}

export default function Sparkline({
  data,
  color = "var(--accent-primary)",
  width = 60,
  height = 18,
  stretch = false,
  windowMs,
  domain,
}: SparklineProps) {
  const resolvedWidth = stretch ? "100%" : width;

  const filtered = (data ?? []).filter(
    (p): p is MetricHistoryPoint & { value: number } =>
      p.value != null && isFinite(p.value)
  );

  if (filtered.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: stretch ? "100%" : resolvedWidth,
          height: stretch ? "100%" : height,
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        Currently Unavailable
      </div>
    );
  }

  const values = filtered.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const flat = max === min;
  const coordW = typeof resolvedWidth === "number" ? resolvedWidth : 100;
  const now = windowAnchorNow(windowMs);

  const coords = filtered.map((p, i) => [
    computeX(p, i, filtered.length, windowMs, now, coordW),
    computeY(p.value, domain, height, flat, min, range),
  ] as [number, number]);

  const viewBox =
    typeof resolvedWidth === "string" ? `0 0 ${coordW} ${height}` : undefined;
  const svgProps = {
    width: resolvedWidth,
    height: stretch ? ("100%" as const) : height,
    viewBox,
    preserveAspectRatio: viewBox ? ("none" as const) : undefined,
    style: stretch
      ? { display: "block" as const, width: "100%", height: "100%" }
      : { display: "block" as const },
  };

  if (filtered.length === 1) {
    const [cx, cy] = coords[0];
    return (
      <svg {...svgProps}>
        <circle cx={cx} cy={cy} r={1} fill={color} />
      </svg>
    );
  }

  const segments = splitSegments(filtered, coords, windowMs, now);
  const linePath = buildLinePath(segments);
  const areaPath = buildAreaPath(segments, height);

  return (
    <svg {...svgProps}>
      {areaPath && (
        <path d={areaPath} fill={color} fillOpacity={0.15} stroke="none" />
      )}
      <path
        d={linePath}
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
