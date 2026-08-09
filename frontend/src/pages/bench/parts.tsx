/**
 * Bench-only presentational pieces. The reuse map keeps these here: strips,
 * k-of-n pills, subtabs and the legend have no equivalent among the shared
 * components, and nothing else in the app should grow a dependency on them.
 */
import type { BenchRecord, CellState } from "./types";
import { cellState } from "./compute";

const CELL_CLASS: Record<CellState, string> = {
  solved: "bench-att solved",
  "solved-late": "bench-att solved late",
  miss: "bench-att miss",
  timeout: "bench-att to",
  server: "bench-att server",
  live: "bench-att live",
  pending: "bench-att pending",
};

const CELL_TITLE: Record<CellState, string> = {
  solved: "solved on the first attempt — full points",
  "solved-late": "solved on a retry — one point fewer per extra attempt",
  miss: "failed after every attempt",
  timeout: "timed out or the reply could not be parsed",
  server: "the endpoint never answered — excluded from every rate, not a zero",
  live: "in progress",
  pending: "not run yet",
};

export function AttemptCell({
  state,
  decorative,
}: {
  state: CellState;
  /** A legend swatch, not a sample. Excluded from the cell test ids so a
   *  count of real cells is never inflated by the key below the table. */
  decorative?: boolean;
}) {
  return (
    <i
      className={CELL_CLASS[state]}
      title={CELL_TITLE[state]}
      data-cell-state={decorative ? undefined : state}
      data-testid={decorative ? undefined : `bench-cell-${state}`}
    />
  );
}

/**
 * One square per sample, grouped so the `--n` boundary is visible. A sample
 * is a fresh conversation; the attempts inside it are retries.
 */
export function AttemptStrip({
  records,
  expectedSamples,
  live,
}: {
  records: BenchRecord[];
  expectedSamples?: number;
  /**
   * Set only for the task currently being worked on. The in-flight sample
   * has no record yet — bench.py appends one when the sample is saved — so
   * the live cell is derived from how many samples have already landed.
   */
  live?: boolean;
}) {
  const bySample = [...records].sort((a, b) => a.sample - b.sample);
  const groups = new Map<number, BenchRecord[]>();
  for (const r of bySample) {
    const g = groups.get(r.sample);
    if (g) g.push(r);
    else groups.set(r.sample, [r]);
  }
  const total = Math.max(expectedSamples ?? 0, groups.size);
  // The next sample without a record is the one in flight.
  const liveSample = live ? groups.size : -1;
  const out: React.ReactNode[] = [];
  for (let s = 0; s < total; s += 1) {
    const rs = groups.get(s);
    if (s > 0) out.push(<span key={`d${s}`} className="bench-sdiv" />);
    let content: React.ReactNode;
    if (rs && rs.length > 0) {
      content = rs.map((r, i) => <AttemptCell key={i} state={cellState(r)} />);
    } else if (s === liveSample) {
      content = <AttemptCell state="live" />;
    } else {
      content = <AttemptCell state="pending" />;
    }
    out.push(
      <span key={`g${s}`} className="bench-sgrp">
        {content}
      </span>,
    );
  }
  return <span className="bench-strip">{out}</span>;
}

/** How many samples solved the task at all — the consistency signal. */
export function KOfN({ solved, of }: { solved: number; of: number }) {
  if (of === 0)
    return (
      <span className="bench-kofn none" data-testid="bench-kofn">
        —
      </span>
    );
  let tone = "none";
  if (solved === of) tone = "all";
  else if (solved > 0) tone = "some";
  return (
    <span className={`bench-kofn ${tone}`} data-testid="bench-kofn">
      {solved}/{of}
    </span>
  );
}

export type BenchTab = "tasks" | "hist" | "cmp" | "leads" | "console";

export function SubTabs({
  active,
  onChange,
  compareCount,
}: {
  active: BenchTab;
  onChange: (t: BenchTab) => void;
  compareCount: number;
}) {
  const tabs: Array<{ id: BenchTab; label: string }> = [
    { id: "tasks", label: "This run" },
    { id: "hist", label: "History" },
    { id: "cmp", label: `Compare ${compareCount || ""}`.trim() },
    { id: "leads", label: "Leads" },
    { id: "console", label: "Console" },
  ];
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-pressed={active === t.id}
          data-testid={`bench-tab-${t.id}`}
          style={{
            font: "600 10px Inter, system-ui, sans-serif",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            background: active === t.id ? "var(--accent-tint-10)" : "none",
            border: `1px solid ${active === t.id ? "var(--border-light)" : "transparent"}`,
            color:
              active === t.id ? "var(--accent-primary)" : "var(--text-muted)",
            padding: "3px 10px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </span>
  );
}

export function StripLegend() {
  const items: Array<[CellState, string]> = [
    ["solved", "solved"],
    ["solved-late", "on retry (−1 pt each)"],
    ["miss", "failed"],
    ["timeout", "timeout/format"],
    ["server", "server — excluded, never a zero"],
    ["live", "in progress"],
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 13,
        flexWrap: "wrap",
        font: '10px "JetBrains Mono", "Fira Code", monospace',
        color: "var(--text-muted)",
        padding: "7px 12px",
        borderTop: "1px solid var(--border-light)",
      }}
    >
      {items.map(([state, label]) => (
        <span
          key={state}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <AttemptCell state={state} decorative />
          {label}
        </span>
      ))}
      <span>│ separates samples (--n)</span>
    </div>
  );
}
