/**
 * Bench-only presentational pieces. The reuse map keeps these here: strips,
 * k-of-n pills, subtabs and the legend have no equivalent among the shared
 * components, and nothing else in the app should grow a dependency on them.
 */
import type { CSSProperties } from "react";
import type { BenchAttempt, BenchRecord, CellState } from "./types";
import { attemptFailureExplanation, attemptStatusToCell, cellState } from "./compute";

export const MONO = '"JetBrains Mono", "Fira Code", monospace';

export const PANEL_CARD_STYLE: CSSProperties = {
  position: "relative",
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-light, var(--border-color))",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const CELL_CLASS: Record<CellState, string> = {
  solved: "bench-att solved",
  "solved-late": "bench-att solved late",
  miss: "bench-att miss",
  error: "bench-att error",
  timeout: "bench-att to",
  format: "bench-att format",
  server: "bench-att server",
  live: "bench-att live",
  pending: "bench-att pending",
};

const CELL_TITLE: Record<CellState, string> = {
  solved: "Solved on the first attempt — full points",
  "solved-late": "Solved on a retry — one point fewer per extra attempt",
  miss: "Failed after every attempt",
  error:
    "Crashed or produced nothing runnable — the code never got as far as being wrong",
  timeout: "Code ran but never finished — test or compile process was killed at the time limit",
  format:
    "No runnable code came out of the reply — no code block found, or every one was empty",
  server: "The endpoint never answered — excluded from every rate, not a zero",
  live: "Running now — no result yet",
  pending: "Not run yet",
};

/**
 * In-app navigation for the links this page offers ("set it in Settings",
 * "Start a model on the llama.cpp page"). App.tsx routes off `popstate`, so
 * pushing and dispatching keeps it a client-side move rather than a reload.
 */
export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AttemptCell({
  state,
  decorative,
  onClick,
}: {
  state: CellState;
  /** A legend swatch, not a sample. Excluded from the cell test ids so a
   *  count of real cells is never inflated by the key below the table. */
  decorative?: boolean;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={CELL_CLASS[state]}
        title={CELL_TITLE[state]}
        data-cell-state={decorative ? undefined : state}
        data-testid={decorative ? undefined : `bench-cell-${state}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{ cursor: "pointer", border: "none", padding: 0 }}
      />
    );
  }
  return (
    <i
      className={CELL_CLASS[state]}
      title={CELL_TITLE[state]}
      data-cell-state={decorative ? undefined : state}
      data-testid={decorative ? undefined : `bench-cell-${state}`}
    />
  );
}

/** One cell per sample, the outer grouping signal for the Samples column. */
export function SampleStrip({
  records,
  expectedSamples,
  live,
}: {
  records: BenchRecord[];
  expectedSamples?: number;
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

/**
 * Per-attempt cells for one task, grouped by sample so the `--n` boundary
 * is visible. Each sample group shows one cell per attempt:
 *   attempts 1…(attempts_used−1) → miss (ran, didn't solve)
 *   attempt attempts_used         → final outcome (cellState)
 *   attempts after attempts_used  → pending (never ran)
 * `server` is the exception: the endpoint never answered, so no attempt ran —
 * the whole group renders as a single server cell with no invented misses.
 */
export function AttemptStrip({
  records,
  expectedSamples,
  live,
  attempts,
  currentAttempt,
  onAttemptClick,
}: {
  records: BenchRecord[];
  expectedSamples?: number;
  /**
   * Set only for the task currently being worked on. The in-flight sample
   * has no record yet — bench.py appends one when the sample is saved — so
   * the live cell is derived from how many samples have already landed.
   */
  live?: boolean;
  /** From detail.config.attempts. Falls back to max attempts_used seen. */
  attempts?: number;
  /** From detail.live.current_attempt — only relevant when live is true. */
  currentAttempt?: number;
  /** T224: called when an attempt cell is clicked (only when attempts[] present). */
  onAttemptClick?: (record: BenchRecord, attemptNum: number) => void;
}) {
  // Fall back to the highest attempts_used across all records when the config
  // field is absent (runs predating the field). When there are no records yet
  // (warmup before results.json exists), default to 3 — bench.py's own default.
  const attemptsCount =
    attempts ??
    (records.length > 0 ? Math.max(...records.map((r) => r.attempts_used)) : 3);

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
      const r = rs[0];
      if (r.status === "server") {
        // Endpoint never answered — no attempt ran, so no invented miss cells.
        content = <AttemptCell state="server" />;
      } else if (r.attempts && r.attempts.length > 0) {
        // T222: use the per-attempt log when available (-277+).
        const cells: React.ReactNode[] = [];
        for (let a = 1; a <= attemptsCount; a++) {
          const att = r.attempts.find((x: BenchAttempt) => x.attempt === a);
          if (att) {
            const state = attemptStatusToCell(att);
            cells.push(
              <AttemptCell
                key={a}
                state={state}
                onClick={onAttemptClick ? () => onAttemptClick(r, a) : undefined}
              />,
            );
          } else {
            cells.push(<AttemptCell key={a} state="pending" />);
          }
        }
        content = cells;
      } else {
        // Fallback derivation: attempts 1…N-1 = miss, N = final outcome.
        const finalState = cellState(r);
        const cells: React.ReactNode[] = [];
        for (let a = 1; a <= attemptsCount; a++) {
          if (a < r.attempts_used) {
            cells.push(<AttemptCell key={a} state="miss" />);
          } else if (a === r.attempts_used) {
            cells.push(<AttemptCell key={a} state={finalState} />);
          } else {
            cells.push(<AttemptCell key={a} state="pending" />);
          }
        }
        content = cells;
      }
    } else if (s === liveSample) {
      if (currentAttempt !== undefined) {
        // Precise: earlier attempts failed, current is live, later haven't started.
        const cells: React.ReactNode[] = [];
        for (let a = 1; a <= attemptsCount; a++) {
          if (a < currentAttempt) {
            cells.push(<AttemptCell key={a} state="miss" />);
          } else if (a === currentAttempt) {
            cells.push(<AttemptCell key={a} state="live" />);
          } else {
            cells.push(<AttemptCell key={a} state="pending" />);
          }
        }
        content = cells;
      } else {
        // current_attempt absent: cannot claim which attempt is live.
        content = Array.from({ length: attemptsCount }, (_, i) => (
          <AttemptCell key={i} state="live" />
        ));
      }
    } else {
      // Sample hasn't started yet — all attempts pending.
      content = Array.from({ length: attemptsCount }, (_, i) => (
        <AttemptCell key={i} state="pending" />
      ));
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
          className="btn-glow"
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
    ["solved", "Solved"],
    ["solved-late", "On retry (−1 pt each)"],
    ["miss", "Failed"],
    ["error", "Crashed / nothing runnable"],
    ["timeout", "Timeout"],
    ["format", "Format — no code block"],
    ["server", "Excluded"],
    ["live", "In progress"],
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 13,
        flexWrap: "wrap",
        font: `10px ${MONO}`,
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
      <span>│ Separates samples (--n)</span>
    </div>
  );
}

function fmt1(n: number | undefined, unit: string) {
  return n == null ? "—" : `${n.toFixed(1)} ${unit}`;
}

/** T224: per-attempt detail panel, shown when an attempt cell is clicked. */
export function AttemptPanel({
  attempt,
  task,
  sample,
  record,
}: {
  attempt: BenchAttempt;
  task: string;
  sample: number;
  record: BenchRecord;
}) {
  const est = attempt.tokens_estimated ? "~" : "";
  const rows: Array<[string, string]> = [
    ["Gen", fmt1(attempt.gen_seconds, "s")],
    ["Test", fmt1(attempt.test_seconds, "s")],
    ...((): Array<[string, string]> => {
      if (attempt.status === "error" || attempt.status === "format") return [];
      const f = attempt.tests_failed ?? null;
      const p = attempt.tests_passed ?? null;
      if (f === null && p === null) return [["Tests", "—"]];
      const failed = f ?? 0;
      const passed = p ?? 0;
      const total = failed + passed;
      if (failed > 0) return [["Tests", `${failed} failed of ${total}`]];
      if (passed > 0) return [["Tests", `all ${passed} passed`]];
      return [["Tests", "—"]];
    })(),
    ["Tokens", attempt.tokens == null ? "—" : `${est}${attempt.tokens.toLocaleString()}`],
    [
      "Prompt",
      attempt.prompt_tokens == null ? "—" : `${est}${attempt.prompt_tokens.toLocaleString()}`,
    ],
    ...(attempt.thinking_tokens != null
      ? ([["Thinking", `${attempt.thinking_tokens.toLocaleString()} tok`]] as Array<
          [string, string]
        >)
      : []),
    ["Blocks", attempt.code_blocks == null ? "—" : String(attempt.code_blocks)],
    ...(attempt.nudges != null && attempt.nudges > 0
      ? ([["Nudges", String(attempt.nudges)]] as Array<[string, string]>)
      : []),
    ...(attempt.finish_reason != null && attempt.finish_reason !== "stop"
      ? ([["Finish", attempt.finish_reason]] as Array<[string, string]>)
      : []),
    ...(attempt.cut_mid_block
      ? ([["Cut mid-block", "yes"]] as Array<[string, string]>)
      : []),
    ...((): Array<[string, string]> => {
      // The drowned-draft rescue (schema 4+), in bench.py's own words: a draft
      // that ran out of room is "carried forward", either "finished in place"
      // or used to "seed a retry". This changes what the attempt IS — one
      // seeded from a draft did not start cold — so comparing attempts without
      // it compares things that are not alike. One row, so the two flags cannot
      // collide on a React key.
      const how: string[] = [];
      if (attempt.draft_continued) how.push("finished in place");
      if (attempt.draft_seeded) how.push("seeded a retry");
      if (how.length === 0) return [];
      return [["Drowned draft", `carried forward — ${how.join(", ")}`]];
    })(),
  ];

  const explanationLines = attemptFailureExplanation(attempt, record.tests_expected);
  // Prefer the attempt's OWN failed list (schema 4+). The record's
  // `first_failed` describes attempt 1 alone, so T249's guard stands: it may
  // stand in for attempt 1 and never for a later one.
  //
  // `?? null` rather than `?? []` on purpose — an ABSENT list is an older file
  // and falls back, an EMPTY one is schema 4 saying this attempt named no
  // failed assertions (the real aborted run's server attempts are exactly
  // that), which must not be overwritten by the record's list.
  const attemptFailed = attempt.failed ?? null;
  let failedLabels: string[];
  if (attemptFailed !== null) failedLabels = attemptFailed;
  else if (attempt.attempt === 1) failedLabels = record.first_failed ?? [];
  else failedLabels = [];
  const showFirstFailed = failedLabels.length > 0;

  return (
    <div
      data-testid="bench-attempt-panel"
      style={{ padding: "8px 12px", font: `11px ${MONO}` }}
    >
      <div
        style={{
          font: "600 9px Inter, system-ui, sans-serif",
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        {task} · sample {sample} · attempt {attempt.attempt}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {rows.map(([label, value]) => (
          <span key={label} style={{ color: "var(--text-muted)" }}>
            {label}:{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{value}</span>
          </span>
        ))}
      </div>
      {showFirstFailed && (
        <div style={{ marginTop: 6 }}>
          {failedLabels.slice(0, 6).map((a, i) => (
            <div
              key={i}
              data-testid="bench-attempt-first-failed"
              style={{ color: "var(--danger)", padding: "1px 0" }}
            >
              ✗ {a}
            </div>
          ))}
        </div>
      )}
      {explanationLines.length > 0 && (
        <div data-testid="bench-attempt-explanation" style={{ marginTop: 6 }}>
          {explanationLines.map((line, i) => (
            <div key={i} style={{ color: "var(--warning)", padding: "1px 0" }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
