const R = 54;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;

function gaugeColor(pct: number): string {
  if (pct >= 85) return "#e56a61";
  if (pct >= 60) return "#e6a95c";
  return "var(--accent-primary)";
}

interface Props {
  pct: number;
}

export default function RadialGauge({ pct }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const valueArc = ((ARC * clamped) / 100).toFixed(2);
  const color = gaugeColor(clamped);

  return (
    <svg
      width="126"
      height="126"
      viewBox="0 0 150 150"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <g transform="rotate(135 75 75)">
        <circle
          cx="75"
          cy="75"
          r={R}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC.toFixed(2)} ${C.toFixed(2)}`}
        />
        <circle
          cx="75"
          cy="75"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${valueArc} ${C.toFixed(2)}`}
        />
      </g>
      <text
        x="75"
        y="74"
        textAnchor="middle"
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fontSize="30"
        fontWeight="500"
        fill="var(--text-primary)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {clamped.toFixed(1)}
      </text>
      <text
        x="75"
        y="94"
        textAnchor="middle"
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fontSize="13"
        fill="var(--text-muted)"
      >
        %
      </text>
    </svg>
  );
}
