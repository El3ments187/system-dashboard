import type { CSSProperties, ReactNode } from "react";

interface MetricTileProps {
  label: ReactNode;
  value: string | number | null;
  unit?: string;
  color?: string;
  accent?: boolean;
  testId?: string;
  accentEl?: string;
  mono?: boolean;
  style?: CSSProperties;
  icon?: ReactNode;
  valueSize?: number;
  labelSize?: number;
}

export default function MetricTile({
  label,
  value,
  unit = "",
  color,
  accent,
  testId,
  accentEl,
  mono,
  style,
  icon,
  valueSize = 13,
  labelSize = 9,
}: MetricTileProps) {
  const displayValue =
    value !== null && value !== undefined ? `${value}${unit}` : "\u2014";

  let accentElVal: string | undefined;
  if (accentEl !== undefined) accentElVal = accentEl;
  else if (accent) accentElVal = "";
  else accentElVal = undefined;

  return (
    <div
      className="metric-tile"
      {...(accentElVal !== undefined ? { "data-accent-el": accentElVal } : {})}
      {...(testId !== undefined ? { "data-testid": testId } : {})}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: accent
          ? "1px solid var(--accent-tint-40)"
          : "1px solid var(--border-color)",
        background: accent ? "var(--accent-tint-10)" : "var(--bg-secondary)",
        padding: "3px 5px",
        minWidth: 0,
        minHeight: 24,
        ...style,
      }}
    >
      <span
        className="metric-tile-label"
        style={{
          fontSize: labelSize,
          fontWeight: 600,
          color: accent ? "var(--accent-primary)" : "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 1,
          textShadow: "var(--text-shadow-sm)",
          ...(icon
            ? { display: "flex", alignItems: "center", gap: 3 }
            : undefined),
        }}
      >
        {icon && (
          <span style={{ display: "flex", alignItems: "center", opacity: 0.7 }}>
            {icon}
          </span>
        )}
        {label}
      </span>
      <span
        className="metric-tile-value"
        style={{
          fontSize: valueSize,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          ...(mono
            ? { fontFamily: '"JetBrains Mono", "Fira Code", monospace' }
            : undefined),
          color: color || "var(--text-primary)",
          textShadow: "var(--text-shadow-sm)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displayValue}
      </span>
    </div>
  );
}
