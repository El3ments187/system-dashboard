import type { ReactNode } from "react";

interface MetricTileProps {
  label: ReactNode;
  value: string | number | null;
  unit?: string;
  color?: string;
}

export default function MetricTile({
  label,
  value,
  unit = "",
  color,
}: MetricTileProps) {
  const displayValue =
    value !== null && value !== undefined ? `${value}${unit}` : "\u2014";

  return (
    <div
      className="metric-tile"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        padding: "5px 7px",
        minWidth: 0,
        minHeight: 34,
      }}
    >
      <span
        className="metric-tile-label"
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 2,
          textShadow: "var(--text-shadow-sm)",
        }}
      >
        {label}
      </span>
      <span
        className="metric-tile-value"
        style={{
          fontSize: 15,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: color || "var(--text-primary)",
          textShadow: "var(--text-shadow-sm)",
        }}
      >
        {displayValue}
      </span>
    </div>
  );
}
