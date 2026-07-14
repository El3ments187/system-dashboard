import { useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { resolveAccentColors, useAccentSync } from "../utils/accentColors";
import { getProgressState } from "../utils/progress";
import { Card } from "../components/shared/CardComponents";
import { readCssVar } from "../utils/cssVar";

interface CoreBarProps {
  cores: Array<{
    utilization_percent: number;
    temperature_celsius?: number;
  } | null>;
}

function getCoreColors(count: number): string[] {
  return resolveAccentColors(count, true);
}

/* ─── Core Row ─── */

const CoreRow = ({
  index,
  util,
  color,
  danger,
  warning,
}: {
  index: number;
  util: number;
  color: string;
  danger: string;
  warning: string;
}) => {
  const state = getProgressState(util);
  const isAccent = state === "normal";
  let barColor: string;
  if (state === "critical") {
    barColor = danger;
  } else if (state === "warning") {
    barColor = warning;
  } else {
    barColor = color;
  }

  return (
    <div
      className="core-row"
      data-accent-el=""
      style={{
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr) 32px",
        alignItems: "stretch",
        gap: 4,
        flex: 1,
        minHeight: 0,
        cursor: "default",
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "right",
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        C{index}
      </span>
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 10,
          margin: "2px 0",
          background: "var(--accent-tint-10)",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          data-testid="per-core-bar"
          data-core-color={barColor}
          data-core-assigned-color={color}
          className={isAccent ? "core-bar" : undefined}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(util, 100)}%`,
            minWidth: util > 0 ? 4 : 0,
            background: isAccent ? "var(--accent-fill)" : barColor,
            backgroundSize: isAccent
              ? "var(--accent-fill-size, 100% 100%)"
              : undefined,
            borderRadius: "inherit",
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 9,
          color: "var(--text-primary)",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "right",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
          alignSelf: "center",
        }}
      >
        {Math.round(util)}%
      </span>
    </div>
  );
};

/* ─── CoreBars Component ─── */

export default function CoreBars({ cores }: CoreBarProps) {
  const [themeTick, setThemeTick] = useState(0);
  useAccentSync(() => setThemeTick((t) => t + 1));

  const borderColor = readCssVar("--border-color") || "#2a3143";

  const indexedCores = useMemo(
    () =>
      cores
        .map((c, i) =>
          c != null ? { index: i, util: c.utilization_percent } : null,
        )
        .filter((c): c is { index: number; util: number } => c != null),
    [cores],
  );

  const totalCores = indexedCores.length;

  const colors = useMemo(
    () => getCoreColors(totalCores),
    [totalCores, themeTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { danger, warning } = useMemo(
    () => ({
      danger: readCssVar("--danger"),
      warning: readCssVar("--warning"),
    }),
    [themeTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const half = Math.ceil(indexedCores.length / 2);
  const colA = indexedCores.slice(0, half);
  const colB = indexedCores.slice(half);

  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
      }}
    >
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={14} style={{ color: "var(--accent-primary)" }} />
          <span className="card-title" style={{ fontSize: "11px" }}>
            Per-Core Utilization
          </span>
        </div>
      </div>

      <div
        style={{ height: 1, background: borderColor, margin: "0 2px 4px" }}
      />

      <style>{`
        .core-row:hover { background: rgba(255,255,255,0.03); border-radius: 4px; }
      `}</style>

      <div
        style={{ flex: 1, minHeight: 0, padding: "0 1px", overflowY: "auto" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 0,
            height: "100%",
          }}
        >
          {[colA, colB].map((col, colIdx) => (
            <div
              key={colIdx}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                minHeight: 0,
                height: "100%",
              }}
            >
              {col.map((c) => (
                <CoreRow
                  key={c.index}
                  index={c.index}
                  util={c.util}
                  color={colors[c.index]}
                  danger={danger}
                  warning={warning}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
