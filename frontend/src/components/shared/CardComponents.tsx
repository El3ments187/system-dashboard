import React from "react";

/* ─── status badge (identical across all cards) ─── */
export function StatusBadge({ online }: { online: boolean }) {
  const c = online ? "var(--success)" : "var(--danger)";
  return (
    <span
      className="status-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        padding: "2px 6px",
        borderRadius: 3,
        background: `${c}18`,
        color: c,
        fontWeight: 600,
        letterSpacing: 0.5,
        textShadow: "var(--text-shadow-sm)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c,
          display: "inline-block",
        }}
      />
      {online ? "ONLINE" : "OFFLINE"}
    </span>
  );
}

/* ─── section wrapper (identical across all cards) ─── */
export function Section({
  title,
  icon,
  children,
  style,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="card-section"
      style={{
        padding: "3px 8px 1px",
        borderBottom: "1px solid var(--border-color)",
        ...style,
      }}
    >
      {(title || icon) && (
        <div className="section-header">
          {icon && (
            <span style={{ color: "var(--accent-primary)" }}>{icon}</span>
          )}
          {title && (
            <span
              className="section-title"
              style={{ textShadow: "var(--text-shadow-sm)" }}
            >
              {title}
            </span>
          )}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

/* ─── card header (identical across all cards) ─── */
export function CardHeader({
  icon,
  title,
  online,
  right,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  online?: boolean;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 15px",
          borderBottom: "1px solid var(--border-light, var(--border-color))",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "1.1px",
          }}
        >
          {icon && (
            <span
              style={{
                color: "var(--accent-primary)",
                display: "flex",
                alignItems: "center",
              }}
            >
              {icon}
            </span>
          )}
          {title}
        </div>
        {right}
      </div>
    );
  }
  return (
    <div
      className="card-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {icon}
      <span
        className="card-title"
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.8,
          color: "var(--text-primary)",
          textShadow: "var(--text-shadow-sm)",
        }}
      >
        {title}
      </span>
      <div style={{ flex: 1 }} />
      {right ?? (online !== undefined && <StatusBadge online={online} />)}
    </div>
  );
}

/* ─── canonical accent spine (absolute-positioned, used inside position:relative cards) ─── */
export function AccentSpine() {
  return (
    <>
      <span className="card-accent-spine accent-glow-target" aria-hidden>
        <span className="sheen-flow-overlay" aria-hidden />
        <span className="bright-breathe" aria-hidden />
        <span className="bright-surge" aria-hidden />
      </span>
      <span className="inner-glow-breathe" aria-hidden />
    </>
  );
}

/* ─── card shell (identical across all cards) ─── */
export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="article"
      data-accent-el=""
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)",
        overflow: "visible",
        minWidth: 0,
        flex: "1 1 0",
        paddingLeft: "16px",
      }}
    >
      <AccentSpine />
      {children}
    </div>
  );
}

/* ─── universal card root (one component for every card on every page) ─── */
export function Card({
  children,
  style,
  className,
  role,
  baseClass,
  innerClassName,
  spine = true,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** undefined = default "article"; null = omit role attribute */
  role?: string | null;
  /** CSS class(es) for the root div; defaults to "metric-card card" */
  baseClass?: string;
  /** When set, wraps children in <div className={innerClassName}> */
  innerClassName?: string;
  spine?: boolean;
}) {
  const roleAttr = role === undefined ? "article" : role || undefined;
  const resolvedBase = baseClass ?? "metric-card card";
  const inner = innerClassName ? (
    <div className={innerClassName}>{children}</div>
  ) : (
    children
  );
  return (
    <div
      {...(roleAttr !== undefined ? { role: roleAttr } : {})}
      className={[resolvedBase, className].filter(Boolean).join(" ")}
      data-accent-el=""
      style={style}
    >
      {spine && <AccentSpine />}
      {inner}
    </div>
  );
}

/* ─── settings card wrapper ─── */
export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <Card role={null} baseClass="settings-card">
      {children}
    </Card>
  );
}

/* ─── chart frame: the canonical wrapper for every chart surface ─── */
export function ChartFrame({
  children,
  style,
  accentScope = false,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /**
   * By default the frame carries data-accent-el="inherit" — the accent
   * indexer's explicit opt-out — so the chart takes its hue from the nearest
   * page-provided scope (e.g. Overview's ov-card). Pages that render charts
   * WITHOUT a scoped wrapper (GPU, CPU) pass accentScope so each chart is its
   * own indexed element; otherwise every chart resolves the ROOT scope and,
   * in spectrum/rainbow modes, shows the same hue cycling in the same phase.
   */
  accentScope?: boolean;
}) {
  return (
    <div
      className="chart-container"
      data-accent-el={accentScope ? "" : "inherit"}
      style={{ flex: 1, minHeight: 0, ...style }}
    >
      <AccentSpine />
      {children}
    </div>
  );
}

/* ─── scrollable content area ─── */
export function ScrollContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}
