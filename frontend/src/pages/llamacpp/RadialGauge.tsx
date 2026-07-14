import React from "react";

export function RadialGauge({
  pct,
  color,
  size = 110,
  children,
}: {
  pct: number | null;
  color?: string;
  size?: number;
  children?: React.ReactNode;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startDeg = 135;
  const totalDeg = 270;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number) => {
    const a = toRad(startDeg + deg);
    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  };
  const pctClamped = Math.min(100, Math.max(0, pct ?? 0));
  const progressDeg = (pctClamped / 100) * totalDeg;
  const trackPath = `M ${pt(0)} A ${r} ${r} 0 1 1 ${pt(totalDeg)}`;
  const largeArcFlag = progressDeg > 180 ? 1 : 0;
  const progPath =
    progressDeg > 0
      ? `M ${pt(0)} A ${r} ${r} 0 ${largeArcFlag} 1 ${pt(progressDeg)}`
      : "";
  const gaugeColor = color ?? "var(--accent-primary)";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
      >
        <path
          d={trackPath}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {progPath && (
          <path
            d={progPath}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
      </svg>
      {children && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
