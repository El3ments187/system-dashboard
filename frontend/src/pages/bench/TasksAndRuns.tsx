/**
 * Tasks & Runs — the four views, as subtabs of one card.
 *
 * Every number here is derived in `compute.ts` so the semantics can be
 * tested without rendering; this file is layout and wording.
 */
import { Fragment, useLayoutEffect, useMemo, useState } from "react";
import { List, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { BenchConsole } from "./BenchConsole";
import { TargetBadge } from "../BenchPage";
import { Card, CardHeader } from "../../components/shared/CardComponents";
import MetricTile from "../../components/shared/MetricTile";
import { fmtNum } from "../llamacpp/parts";
import { fmtUptime } from "../llamaCppUtils";
import {
  AttemptCell,
  AttemptStrip,
  KOfN,
  MONO,
  navigateTo,
  PANEL_CARD_STYLE,
  StripLegend,
  SubTabs,
  type BenchTab,
} from "./parts";
import {
  assertionCanary,
  benchLocalDate,
  budgetHarmed,
  compareEligibility,
  compareNotation,
  compareRows,
  deltaSpread,
  compareSlotOptions,
  gradedRecords,
  groupCoverage,
  languageBreakdown,
  runTaskRoster,
  groupByEdition,
  groupByTask,
  failureExplanation,
  rowTaint,
  leadsCoverage,
  leadsFromRuns,
  regressionChips,
  isNonDefaultTarget,
  runNaming,
  runTaskAvg,
  sampleLabel,
  sortByLangOrder,
  taskMean,
  truncationState,
} from "./compute";
import type { BenchData } from "./useBenchData";
import type { BenchRecord, BenchRunDetail, BenchRunRow } from "./types";



/** Compare renders at most three columns, so it offers exactly three slots. */
const COMPARE_SLOTS = 3;

/** Column gap shared by every row in the Compare score+language block. */
const CMP_COL_GAP = 12;
// Widest language label is "gdscript" (8 chars). At 12px mono ≈7.2px/ch → 57.6px;
// 64px gives ~6px headroom at that font size and more at This Run's 11px.
// Both blocks share this constant so adding a ninth-character language triggers one change.
const LANG_LABEL_PX = 64;
// 40px ≈ 6ch at 11px mono; sized for "+100.0" (widest renderDiff output).
const cmpCols = (n: number) => `${LANG_LABEL_PX}px repeat(${n}, 1fr) 40px`;
// This Run's lang block: 5 columns (lang score passes tests speed). Separate from
// cmpCols (which has a Δ column instead of the last two value columns).
const THIS_RUN_LANG_COLS = `${LANG_LABEL_PX}px 1fr 1fr 1fr 1fr`;

type NormalizedLangEntry = {
  score: number | null;
  passes: number | null;
  tests: number | null;
  speed: number | null;
};

function normalizeLangEntry(v: unknown): NormalizedLangEntry {
  if (typeof v !== "object" || v === null) {
    return { score: typeof v === "number" ? v : null, passes: null, tests: null, speed: null };
  }
  const o = v as Record<string, unknown>;
  return {
    score: (o.score as number | null | undefined) ?? null,
    passes:
      (o.passes as number | null | undefined) ??
      (o.correctness as number | null | undefined) ??
      null,
    tests: (o.tests as number | null | undefined) ?? null,
    speed: (o.speed as number | null | undefined) ?? null,
  };
}

/**
 * Each cutoff names its OWN remedy. They are not interchangeable: raising
 * `--max-tokens` does nothing for a bench.py budget stop, and `--nudge-at`
 * does nothing for a server-side truncation. Both tooltips also state the
 * contagion, because the badge marks every sample from the trigger onward,
 * not only the one that was cut.
 */
// Shared tail: the badge marks every task from the trigger onward, not only
// the one that was actually cut. Moved here from the banner (T111) so the
// explanation lives beside the badge it describes, not beside the count.
const BUDGET_CONTAGION =
  " More rows carry the badge than the banner's count: every task from the first stop onward was scored under the same cap.";

const TAINT_TOOLTIP: Record<"budget" | "truncation", string> = {
  budget:
    "Recorded at or after bench.py stopped a reply at its own --nudge-at budget, so this score measures the cutoff rather than the model. Raise --nudge-at or --max-nudges; --max-tokens does not affect this." +
    BUDGET_CONTAGION,
  truncation:
    "Recorded at or after three consecutive replies the server cut short (finish_reason: length), so this score measures the token cap rather than the model. Raise --max-tokens; --nudge-at does not affect this.",
};

// T114 — a tainted task that scored full marks: the cap was in effect but
// nothing in the data shows it changed the result. Weaker claim than budget.
const TAINT_BUDGET_PASS =
  "Ran under the --nudge-at budget cap and scored full marks — the cap was in effect during this task, so its score is not directly comparable with pre-trigger runs, but nothing here shows the cap changed the result." +
  BUDGET_CONTAGION;

/**
 * A run whose identity is not known yet: no detail has loaded ("none"), or a
 * spawned run has no results.json ("warming:<folder>"). These become a real
 * run id when the SAME run's data arrives — which is not a run change.
 */
const isPlaceholderRunKey = (key: string) =>
  key === "none" || key.startsWith("warming:");

/** A task with no record is queued or skipped — never 0.00, which reads as
 *  a scored result. */
function pendingLabel(skipped: boolean, queued: boolean): string {
  if (skipped) return "skipped";
  if (queued) return "queued";
  return "—";
}

/**
 * What a pane says when it has nothing to show. A large blank panel reads as
 * a failure to load; this says which of the two it is.
 */
function EmptyPane({ children }: { children: React.ReactNode }) {
  return (
    <p
      data-testid="bench-empty-pane"
      style={{
        margin: "14px 12px",
        font: "11px Inter, system-ui, sans-serif",
        color: "var(--text-muted)",
        maxWidth: "70ch",
      }}
    >
      {children}
    </p>
  );
}

/** History's outcome cell: still running, interrupted, or a final score. */
function RunOutcome({
  isLiveRun,
  interrupted,
  samples,
  avg,
  maxPoints,
  score,
}: {
  isLiveRun: boolean;
  interrupted: boolean;
  samples: number;
  avg: number | null;
  maxPoints: number | string;
  /** localbench -157+ headline score; undefined means pre-157 run. */
  score?: number | null;
}) {
  if (isLiveRun)
    return (
      <span data-testid="bench-run-running" style={{ color: "var(--success)" }}>
        running · {samples} samples so far
      </span>
    );
  if (interrupted)
    return (
      <span
        data-testid="bench-interrupted"
        style={{ color: "var(--text-muted)" }}
      >
        interrupted · {samples} samples
      </span>
    );
  // Post-157: show the 0–100 headline score
  if (score !== undefined) {
    return (
      <span style={{ fontWeight: 700 }}>
        {score === null ? "—" : score.toFixed(1)}/100
      </span>
    );
  }
  return (
    <span style={{ fontWeight: 700 }}>
      {avg === null ? "—" : avg.toFixed(2)}/{maxPoints}
    </span>
  );
}



const TH: React.CSSProperties = {
  font: "600 11px Inter, system-ui, sans-serif",
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: "1px solid var(--border-light)",
  position: "sticky",
  top: 0,
  background: "var(--bg-card)",
  // Sticky alone does not win paint order against cells that come later in
  // the DOM — an opaque background is necessary but not sufficient, so
  // scrolling rows rendered over the header text. The spine sits at 3 and
  // stays above this.
  zIndex: 2,
};

const TD: React.CSSProperties = {
  padding: "5px 10px",
  borderBottom: "1px solid var(--border-light)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

const EDHEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "10px 12px 4px",
  font: "600 9.5px Inter, system-ui, sans-serif",
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

/**
 * Where runs are stored. Read-only DISPLAY of the configured `bench_dir`
 * (settings.json) — the Settings page is where it is SET, so there is no
 * second editable copy here. An empty slot would read as a bug, and an
 * unset value with nowhere to fix it is worse, so the unset state says so
 * and points at Settings.
 */
function RunsPathChip({ benchDir }: { benchDir: string | null }) {
  const unset = !benchDir;
  return (
    <span
      data-testid="bench-runs-path"
      title={
        unset
          ? "bench_dir is not configured. Set it on the Settings page; the Bench page reads runs from <bench_dir>/runs."
          : `${benchDir}/runs`
      }
      style={{
        font: `10.5px ${MONO}`,
        color: unset ? "var(--warning)" : "var(--text-secondary)",
        background: "var(--bg-secondary)",
        border: `1px solid ${unset ? "color-mix(in srgb, var(--warning) 45%, transparent)" : "var(--border-light)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "3px 9px",
        maxWidth: 260,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {unset ? (
        <>
          bench_dir unset —{" "}
          <a
            href="/settings"
            style={{ color: "var(--accent-primary)" }}
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/settings");
            }}
          >
            set it in Settings
          </a>
        </>
      ) : (
        `${benchDir}/runs`
      )}
    </span>
  );
}

export function TasksAndRuns({
  bench,
  running,
  warming,
  outputFolder,
  resumingFolder,
  onResume,
}: {
  bench: BenchData;
  running: boolean;
  /** A spawned run whose results.json does not exist yet. */
  warming: boolean;
  /** Run folder for the Console tab's toolbar note (moved out of the hero). */
  outputFolder: string;
  resumingFolder: string | null;
  onResume: (folder: string, init: RequestInit) => void;
}) {
  const { detail, runs, storedDetails, selectRun, refresh } = bench;
  // While a spawned run is warming, `detail` is still the PREVIOUS run, so
  // that is the identity this pane must refuse to draw as "this run".
  // Execution order, from --list — results.json's own tasks[] is sorted
  // alphabetically and would make the live row appear to jump around.
  const runLangs = warming
    ? (bench.current.run?.langs?.split(",") ?? null)
    : (detail?.config?.langs ?? null);
  const roster = useMemo(
    () => runTaskRoster(bench.taskList?.tasks, runLangs),
    [bench.taskList, runLangs],
  );
  const unavailableLangs = useMemo(
    () =>
      new Set(
        (bench.check?.tracks ?? [])
          .filter((t) => !t.available)
          .map((t) => t.lang),
      ),
    [bench.check],
  );

  const runKey = warming
    ? `warming:${bench.current.run?.folder ?? ""}`
    : (detail?.run_id ?? "none");
  const [tab, setTab] = useState<BenchTab>("tasks");
  const [query, setQuery] = useState("");
  // Keyed by RUN AND TASK. Keyed by task alone, an expanded drilldown
  // stayed expanded when the run underneath it changed — and a run change is
  // exactly when its contents stop belonging to what is on screen.
  const [openTask, setOpenTask] = useState<{
    runKey: string;
    task: string;
  } | null>(null);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);

  const taskLangOrder = useMemo(
    () =>
      bench.taskList
        ? [...new Set(bench.taskList.tasks.map((t) => t.lang))]
        : undefined,
    [bench.taskList],
  );
  const byLangRaw = warming ? null : (detail?.summary?.by_language ?? null);
  const byLang =
    byLangRaw && Object.keys(byLangRaw as Record<string, unknown>).length > 0
      ? (byLangRaw as Record<string, unknown>)
      : null;
  const langRatiosList = useMemo(
    () => languageBreakdown(warming ? [] : (detail?.records ?? [])),
    [detail, warming],
  );

  // Roster rows render before the run's detail exists, so a click can be
  // keyed to a placeholder. Migrate it when the real id arrives — dropping it
  // collapsed an expanded task the moment the poll landed. A real id becoming
  // a DIFFERENT real id is still a run change and still closes it (T64).
  // T141: useLayoutEffect fires before paint so there is no visual flash,
  // and it is safe under StrictMode's double-invocation (the update is idempotent).
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (openTask && openTask.runKey !== runKey && isPlaceholderRunKey(openTask.runKey)) {
      setOpenTask({ runKey, task: openTask.task });
    }
  }, [openTask, runKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const currentEdition = detail?.suite_hash ?? runs[0]?.suite_hash ?? "";

  // Default comparison: the newest runs that are actually comparable — same
  // edition AND same --attempts. Picking an incomplete set would open the tab
  // on a refusal rather than on a comparison.
  const defaultCompare = useMemo(() => {
    const candidates = runs.filter((r) => r.suite_hash === currentEdition);
    const anchor = candidates[0];
    if (!anchor) return [];
    return candidates
      .filter((r) => r.config?.attempts === anchor.config?.attempts)
      .slice(0, 3)
      .map((r) => r.run_id);
  }, [runs, currentEdition]);
  const selectedCompare = compareIds ?? defaultCompare;

  return (
    <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
      <CardHeader
        compact
        icon={<List size={13} />}
        title="Tasks & Runs"
        titleAccentBar
        right={
          /* CardHeader(compact) lays its two children out with
             space-between, so anything handed to `right` is pushed to the
             far edge — which is what opened a large gap between the title
             and the path chip. The design's toolbar has no such spacer: it
             is one flex row, gap 8, with margin-left:auto on the SEARCH
             alone. Growing this node and left-aligning inside it restores
             exactly that, without touching the shared CardHeader. */
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: 1,
              marginLeft: 8,
              justifyContent: "flex-start",
              minWidth: 0,
            }}
          >
            <RunsPathChip benchDir={bench.benchDir} />
            <SubTabs
              active={tab}
              onChange={setTab}
              compareCount={selectedCompare.length}
            />
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                marginLeft: "auto",
              }}
            >
              <Search
                size={12}
                style={{
                  position: "absolute",
                  left: 7,
                  top: 6,
                  color: "var(--text-muted)",
                }}
              />
              <input
                id="bench-search-tasks"
                name="bench-search-tasks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                aria-label="Search tasks"
                style={{
                  font: `11px ${MONO}`,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  padding: "4px 9px 4px 24px",
                  width: 140,
                }}
              />
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh runs"
              className="btn-glow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                font: "600 10px Inter, system-ui, sans-serif",
                border: "1px solid var(--border-light)",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 9px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </span>
        }
      />

      {tab === "tasks" && (
        <>
          {(byLang || langRatiosList.length > 0) && (
            byLang ? (
              <div
                data-testid="bench-lang-breakdown"
                style={{
                  padding: "6px 12px 4px",
                  font: `11px ${MONO}`,
                  color: "var(--text-primary)",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                <div
                  data-testid="bench-lang-table-header"
                  style={{
                    display: "grid",
                    gridTemplateColumns: THIS_RUN_LANG_COLS,
                    gap: `0 ${CMP_COL_GAP}px`,
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 3,
                  }}
                >
                  <span>Language</span>
                  <span style={{ textAlign: "right" }}>Score</span>
                  <span style={{ textAlign: "right" }}>Passes</span>
                  <span style={{ textAlign: "right" }}>Tests</span>
                  <span style={{ textAlign: "right" }}>Speed</span>
                </div>
                {sortByLangOrder(Object.keys(byLang), taskLangOrder).map(
                  (lang) => {
                    const entry = normalizeLangEntry(byLang[lang]);
                    return (
                      <div
                        key={lang}
                        data-testid="bench-lang-row"
                        style={{
                          display: "grid",
                          gridTemplateColumns: THIS_RUN_LANG_COLS,
                          gap: `0 ${CMP_COL_GAP}px`,
                        }}
                      >
                        <span>{lang}</span>
                        <span style={{ textAlign: "right" }}>
                          {entry.score != null ? entry.score.toFixed(1) : "—"}
                        </span>
                        <span style={{ textAlign: "right" }}>
                          {entry.passes != null ? entry.passes.toFixed(1) : "—"}
                        </span>
                        <span style={{ textAlign: "right" }}>
                          {entry.tests != null ? entry.tests.toFixed(1) : "—"}
                        </span>
                        <span style={{ textAlign: "right" }}>
                          {entry.speed != null ? entry.speed.toFixed(1) : "—"}
                        </span>
                      </div>
                    );
                  },
                )}
                {detail?.summary?.score !== undefined && (
                  <div
                    data-testid="bench-lang-all-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: THIS_RUN_LANG_COLS,
                      gap: `0 ${CMP_COL_GAP}px`,
                      borderTop: "1px solid var(--border-color)",
                      marginTop: 3,
                      paddingTop: 3,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    <span>ALL</span>
                    <span style={{ textAlign: "right" }}>
                      {detail.summary.score != null
                        ? detail.summary.score.toFixed(1)
                        : "—"}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {detail.summary.passes_100 != null
                        ? detail.summary.passes_100.toFixed(1)
                        : "—"}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {detail.summary.tests_100 != null
                        ? detail.summary.tests_100.toFixed(1)
                        : "—"}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {detail.summary.speed_weighted != null
                        ? detail.summary.speed_weighted.toFixed(1)
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                data-testid="bench-lang-breakdown"
                style={{
                  padding: "4px 12px",
                  font: `11px ${MONO}`,
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                by language:{" "}
                {langRatiosList
                  .map((l) => `${l.lang} ${l.solved}/${l.total}`)
                  .join(" \u00b7 ")}
              </div>
            )
          )}
          <ThisRunPane
            detail={detail}
            roster={roster}
            unavailableLangs={unavailableLangs}
            query={query}
            warming={warming}
            openTask={openTask?.runKey === runKey ? openTask.task : null}
            setOpenTask={(task) => setOpenTask(task ? { runKey, task } : null)}
          />
        </>
      )}
      {tab === "hist" && (
        <HistoryPane
          bench={bench}
          running={running}
          onSelect={selectRun}
          storedDetails={storedDetails}
          resumingFolder={resumingFolder}
          onResume={onResume}
        />
      )}
      {tab === "cmp" && (
        <ComparePane
          bench={bench}
          selected={selectedCompare}
          setSelected={setCompareIds}
        />
      )}
      {tab === "leads" && (
        <LeadsPane details={storedDetails} edition={currentEdition} />
      )}
      {/* Mounted at all times: the log is a background process's output, so
          hiding the pane must not stop it streaming or reset its state. */}
      <div
        style={{
          display: tab === "console" ? "flex" : "none",
          flexDirection: "column",
          flex: tab === "console" ? 1 : undefined,
          minHeight: 0,
        }}
      >
        <BenchConsole
          running={running}
          active={tab === "console"}
          outputFolder={outputFolder}
        />
      </div>
    </Card>
  );
}

// ── This run ────────────────────────────────────────────────────────────────

function ThisRunPane({
  detail,
  warming,
  roster,
  unavailableLangs,
  query,
  openTask,
  setOpenTask,
}: {
  detail: BenchRunDetail | null;
  /** A spawned run whose results.json does not exist yet. */
  warming: boolean;
  /** Every task this run covers, in execution order. */
  roster: Array<{ id: string; lang: string }>;
  /** Languages whose toolchain is missing — their tasks never run. */
  unavailableLangs: Set<string>;
  query: string;
  openTask: string | null;
  setOpenTask: (t: string | null) => void;
}) {
  // Nothing file-derived describes the spawned run until its own file lands.
  // Rendering `detail` here is how another run's failure detail appeared
  // under a run that had not completed a sample.
  const records = useMemo(
    () => (warming ? [] : (detail?.records ?? [])),
    [detail, warming],
  );
  const trunc = useMemo(() => truncationState(records), [records]);
  const byTask = useMemo(() => groupByTask(records), [records]);
  // T155: build once outside the row map so taint lookup is O(1), not O(n).
  // First-occurrence wins to match indexOf semantics (same-reference duplicates
  // cannot arise from normal API responses, but the semantics should match).
  const indexOf = useMemo(() => {
    const m = new Map<(typeof records)[0], number>();
    records.forEach((r, i) => {
      if (!m.has(r)) m.set(r, i);
    });
    return m;
  }, [records]);
  const expectedSamples = detail?.config?.n ?? 1;

  // Rows come from the ROSTER, not from the records, so every task this run
  // covers is visible from the first render instead of the table growing one
  // row at a time while the hero already says "27 of 27". A task with no
  // record yet renders queued — never zeros, which read as a scored result.
  //
  // T156: widen the tuple to carry lang from the roster so skipped-vs-queued
  // follows the roster field, not a re-parse of the task id string.
  // In the byTask fallback every entry has at least one record (BenchRecord.lang
  // is required), so rs[0].lang is always defined there — the split is
  // unreachable but kept as a type-safe last resort.
  const rows: Array<[string, typeof records, string]> =
    roster.length > 0
      ? roster.map((t) => [t.id, byTask.get(t.id) ?? [], t.lang])
      : [...byTask.entries()].map(([id, rs]) => [
          id,
          rs,
          rs[0]?.lang ?? id.split("/")[0],
        ]);
  const visible = rows.filter(([task]) =>
    task.toLowerCase().includes(query.toLowerCase()),
  );

  // With a roster there is always something to show — a warming run displays
  // its whole queue. The empty state is only for having neither.
  if (!detail && roster.length === 0)
    return (
      <div
        data-testid="bench-this-run-empty"
        style={{ padding: 16, color: "var(--text-muted)" }}
      >
        No run selected.
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            font: `12px ${MONO}`,
          }}
        >
          <thead>
            <tr>
              <th style={TH}>Task</th>
              <th style={TH}>Language</th>
              <th style={TH} title={`×${expectedSamples} samples per task`}>
                Samples
              </th>
              <th style={{ ...TH, textAlign: "right" }}>Attempts</th>
              <th style={{ ...TH, textAlign: "right" }}>Average points</th>
              <th style={{ ...TH, textAlign: "right" }}>Solved</th>
              <th style={{ ...TH, textAlign: "right" }}>Average time</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(([task, rs, lang]) => {
              const skipped = rs.length === 0 && unavailableLangs.has(lang);
              const queued = rs.length === 0 && !skipped;
              const graded = gradedRecords(rs);
              const mean = taskMean(rs);
              const solved = graded.filter((r) => r.solved).length;
              const genMean =
                graded.length === 0
                  ? null
                  : graded.reduce((s, r) => s + r.gen_seconds, 0) /
                    graded.length;
              const maxAttempts =
                rs.length === 0
                  ? null
                  : Math.max(...rs.map((r) => r.attempts_used));
              const tainted = rowTaint(
                rs.map((r) => indexOf.get(r) ?? -1),
                trunc,
              );
              const harmed = budgetHarmed(tainted, graded);
              let taintTitle: string | undefined;
              if (tainted === "truncation") {
                taintTitle = TAINT_TOOLTIP.truncation;
              } else if (tainted !== null) {
                taintTitle = harmed ? TAINT_TOOLTIP.budget : TAINT_BUDGET_PASS;
              }
              return (
                <Fragment key={task}>
                  <tr
                    onClick={() => setOpenTask(openTask === task ? null : task)}
                    style={{ cursor: "pointer" }}
                    data-testid="bench-task-row"
                  >
                    <td style={{ ...TD, color: "var(--text-primary)" }}>
                      {task}
                      {tainted && (
                        <span
                          className="bench-tainted"
                          data-taint={tainted}
                          data-testid="bench-taint-badge"
                          title={taintTitle}
                          style={{
                            marginLeft: 6,
                            font: `8.5px ${MONO}`,
                            color: "var(--warning)",
                            padding: "0 4px",
                          }}
                        >
                          {tainted === "budget" ? "BUDGET" : "TRUNCATED"}
                        </span>
                      )}
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          font: "600 9px Inter, system-ui, sans-serif",
                          border: "1px solid var(--border-light)",
                          borderRadius: 4,
                          padding: "1px 5px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {rs[0]?.lang ?? lang}
                      </span>
                    </td>
                    <td style={TD}>
                      <AttemptStrip
                        records={rs}
                        expectedSamples={expectedSamples}
                        live={task === detail?.live?.current_task}
                      />
                    </td>
                    <td
                      style={{ ...TD, textAlign: "right" }}
                      data-testid="bench-task-attempts"
                    >
                      {maxAttempts === null ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        maxAttempts
                      )}
                    </td>
                    <td
                      style={{ ...TD, textAlign: "right", fontWeight: 700 }}
                      data-testid="bench-task-mean"
                    >
                      {/* A task with no record is queued or skipped — never
                          0.00, which reads as a scored result. */}
                      {mean === null ? (
                        <span
                          data-testid="bench-task-pending"
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 400,
                          }}
                        >
                          {pendingLabel(skipped, queued)}
                        </span>
                      ) : (
                        mean.toFixed(2)
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      {rs.length === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <KOfN solved={solved} of={graded.length} />
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      {genMean === null ? "—" : fmtUptime(genMean)}
                    </td>
                  </tr>
                  {openTask === task && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          ...TD,
                          whiteSpace: "normal",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        <Drilldown records={rs} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <StripLegend />
    </div>
  );
}

function Drilldown({ records }: { records: BenchRecord[] }) {
  // T112 — keep worst selection correct; branch the HEADER separately.
  const failingRecord = records.find((r) => !r.solved && r.status !== "server");
  const serverOnly =
    records.length > 0 && records.every((r) => r.status === "server");
  const worst = failingRecord ?? records[0];
  if (!worst) return null;
  const explanation = failureExplanation(worst);
  const canary = assertionCanary(worst);
  // "Tokens: completion" is a SUM over the sample's attempts; "Tokens: largest
  // request" is the MAX of any single call. Different units — the shared prefix
  // groups them; the second word carries the distinction (bench.py once hit
  // 47,258 summed vs 23,300 max context, which reads as broken without this).
  const est = worst.tokens_estimated ? "~" : "";
  const estTitle = worst.tokens_estimated
    ? "Estimated by the harness, not reported by the server"
    : undefined;
  const drilldownSuffix = (() => {
    if (failingRecord) return " — why it failed";
    if (serverOnly) return " — endpoint did not answer";
    return " — attempt detail";
  })();

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            font: "600 9px Inter, system-ui, sans-serif",
            letterSpacing: "0.6px",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {worst.task}{drilldownSuffix}
        </span>
        {canary.applicable && (
          <span
            data-testid="bench-canary"
            title="The grader ran the number of assertions the suite declares. A mismatch means suite drift, not a model result."
            style={{
              marginLeft: "auto",
              font: `10px ${MONO}`,
              color: canary.ok ? "var(--success)" : "var(--danger)",
              fontWeight: canary.ok ? 400 : 700,
            }}
          >
            tests {canary.ran}/{canary.expected}
            {canary.ok
              ? " ✓"
              : " ✗ SUITE DRIFT — assertion count disagrees with the suite"}
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div>
          {(worst.first_failed ?? []).slice(0, 6).map((a, i) => (
            <div
              key={i}
              style={{
                font: `11px ${MONO}`,
                color: "var(--danger)",
                padding: "1px 0",
              }}
            >
              ✗ {a}
            </div>
          ))}
          {/* A cut-off sample has NO failed assertions — nothing failed, the
              run was amputated — so without this the panel fell through to a
              head window of the log, which shows passes and only passes. */}
          {explanation.reason && (
            <div
              data-testid="bench-failure-reason"
              style={{
                font: `11px ${MONO}`,
                color: "var(--warning)",
                padding: "1px 0",
              }}
            >
              {explanation.reason}
            </div>
          )}
          {explanation.unreached > 0 && (
            <div
              data-testid="bench-unreached"
              style={{
                font: `11px ${MONO}`,
                color: "var(--text-secondary)",
                padding: "1px 0",
              }}
            >
              {explanation.unreached} of{" "}
              {worst.tests_expected || worst.tests_total} assertions never ran
            </div>
          )}
          {explanation.history && (
            <div
              data-testid="bench-failure-history"
              style={{
                font: `10.5px ${MONO}`,
                color: "var(--text-muted)",
                padding: "1px 0",
              }}
            >
              {explanation.history}
              {explanation.remedy ? ` ${explanation.remedy}` : ""}
            </div>
          )}
          {worst.detail &&
            ((worst.first_failed ?? []).length > 0 ? (
              /* T113 — the failure list already shows what went wrong.
                 bench.py stores detail[:400], which is the HEAD of the log;
                 test runners print passes first, so the failing assertion is
                 never in these bytes. Suppress the blockquote; keep the
                 raw/ pointer because it is the reader's route to the full log. */
              <div
                data-testid="bench-detail-excerpt-label"
                style={{
                  font: `10px ${MONO}`,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Full log in raw/
              </div>
            ) : (
              <blockquote
                style={{
                  margin: "7px 0 0",
                  padding: "7px 10px",
                  background:
                    "color-mix(in srgb, var(--bg-secondary) 70%, black)",
                  borderLeft: "2px solid var(--danger)",
                  borderRadius: "0 6px 6px 0",
                  font: `11px/1.5 ${MONO}`,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {worst.detail.slice(0, 260)}
                {/* This is the START of the log, not the failure: bench.py
                    stores `detail[:400]` (`bench.py:1726`) and test runners
                    print passes first, so for a cut-off sample the failure is
                    not in these bytes at all. Labelled for what it is. */}
                <span
                  data-testid="bench-detail-excerpt-label"
                  style={{ color: "var(--text-muted)" }}
                >
                  {" "}
                  (start of the log · full text in raw/)
                </span>
              </blockquote>
            ))}
        </div>
        <div>
          <div
            data-testid="bench-drill-flags"
            style={{
              marginBottom: 7,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {worst.cut_mid_block && (
              <FlagChip
                label="CUT MID-BLOCK"
                title="Output stopped inside a code fence — the answer was physically truncated."
              />
            )}
            {worst.truncated && (
              <FlagChip
                label="TRUNCATED"
                title="The reply hit the token ceiling."
              />
            )}
            {/* `> 0`, not a bare `&&`: this is a count, and `0 && …` renders
                the digit 0 rather than nothing. */}
            {worst.nudged > 0 && (
              <FlagChip
                label="NUDGED"
                title="Generation stalled and needed a continuation prompt."
              />
            )}
            {worst.stopped_at_budget && (
              <FlagChip
                label="STOPPED AT BUDGET"
                title="A complete block was in hand, so the stream was cut at the nudge budget."
              />
            )}
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}
          >
            <MetricTile
              accent
              mono
              testId="bench-gen-tile"
              label="Generation time"
              value={fmtUptime(worst.gen_seconds)}
              valueSize={12}
            />
            <MetricTile
              accent
              mono
              testId="bench-tokens-sum"
              label="Tokens: completion"
              value={`${est}${fmtNum(worst.completion_tokens)}`}
              valueSize={12}
              style={estTitle ? { cursor: "help" } : undefined}
            />
            <MetricTile
              accent
              mono
              testId="bench-tokens-max"
              label="Tokens: largest request"
              value={`${est}${fmtNum(worst.total_tokens)}`}
              valueSize={12}
            />
          </div>
          {worst.tokens_estimated && (
            <div
              data-testid="bench-tokens-estimated"
              title={estTitle}
              style={{
                font: `9.5px ${MONO}`,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              ~ estimated by the harness, not reported by the server
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagChip({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        font: `600 9px ${MONO}`,
        border: "1px solid var(--warning)",
        color: "var(--warning)",
        borderRadius: 5,
        padding: "2px 7px",
        cursor: "help",
      }}
    >
      {label}
    </span>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function editionAgeLabel(gi: number): string {
  return gi === 1 ? "previous edition" : "older edition";
}

function HistoryPane({
  bench,
  running,
  onSelect,
  storedDetails,
  resumingFolder,
  onResume,
}: {
  bench: BenchData;
  /** The page's liveness signal — the same one the hero and Start/Stop use. */
  running: boolean;
  onSelect: (id: string) => void;
  storedDetails: BenchRunDetail[];
  resumingFolder: string | null;
  onResume: (folder: string, init: RequestInit) => void;
}) {
  const groups = useMemo(() => groupByEdition(bench.runs), [bench.runs]);
  const detailById = useMemo(() => {
    const m = new Map<string, BenchRunDetail>();
    for (const d of storedDetails) m.set(d.run_id, d);
    return m;
  }, [storedDetails]);

  if (bench.runs.length === 0)
    return (
      <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
        <EmptyPane>
          No stored runs yet. Every finished run is written to the runs folder
          and appears here — start one from Run Setup.
        </EmptyPane>
      </div>
    );

  return (
    <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
      {/* Only when there IS more than one edition. Unconditional, it warned
          about mixed editions on a history containing exactly one — and the
          block below already tests `gi > 0` before drawing an edition cut, so
          the count was available all along. Naming them matches what
          `compareEligibility` tells the reader in the same situation. */}
      {groups.length > 1 && (
        <div
          className="bench-banner"
          data-testid="bench-cross-edition"
          style={{ margin: "10px 12px", fontSize: 12 }}
        >
          <TriangleAlert size={13} />
          <span>
            These runs span {groups.length} suite editions (
            <b style={{ fontFamily: MONO }}>
              {groups.map((g) => g.suiteHash).join(", ")}
            </b>
            ) — cross-edition scores are not comparable, because the benchmark
            itself changed.
          </span>
        </div>
      )}
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div
              className="bench-cut"
              data-testid="bench-edition-cut"
              style={{
                margin: "12px",
                font: "11px Inter, system-ui, sans-serif",
              }}
            >
              Edition changed — scores across this line measure different
              benchmarks
            </div>
          )}
          <div style={EDHEAD} data-testid="bench-edition-head">
            {gi === 0 ? "current edition" : editionAgeLabel(gi)}
            <span
              style={{
                font: `10px ${MONO}`,
                textTransform: "none",
                letterSpacing: 0,
                border: "1px solid var(--border-light)",
                borderRadius: 999,
                padding: "1px 8px",
                background: "var(--bg-secondary)",
              }}
            >
              {g.suiteHash}
            </span>
          </div>
          {g.runs.map((run, i) => {
            const prev = g.runs[i + 1];
            const a = prev ? detailById.get(prev.run_id) : undefined;
            const b = detailById.get(run.run_id);
            const chips =
              a && b
                ? regressionChips(
                    {
                      models: a.models,
                      suite_hash: a.suite_hash,
                      records: a.records,
                      config: a.config,
                    },
                    {
                      models: b.models,
                      suite_hash: b.suite_hash,
                      records: b.records,
                      config: b.config,
                    },
                  )
                : null;
            // T86 — "not finished" is true of a run that is STILL GOING as
            // well as one that stopped, and the two were conflated: the live
            // run showed as "interrupted" with a Resume button. Resuming a
            // live run is not a no-op — it would spawn a second process
            // against the same run directory. Liveness comes from the same
            // signal driving the hero and Start/Stop, not a second rule.
            // T126: identify liveness by the running process's folder, not by
            // which run the user has selected. bench.detail changes when the
            // user clicks a history entry; the spawned process's folder does
            // not. Fallback to detail comparison for CLI-started runs where
            // current.running is false.
            const isLiveRun =
              running &&
              (bench.current.running && bench.current.run?.folder != null
                ? run.folder === bench.current.run.folder
                : run.run_id === bench.detail?.run_id);
            const interrupted = !run.finished && !isLiveRun;
            // Chips compare solved-state between two runs; against a run
            // still in progress that is a partial score, so a task not yet
            // reached reads as a regression. Suppressed until it finishes.
            const showChips = chips && run.finished;
            const avg = b ? runTaskAvg(b.records) : null;
            return (
              <div
                key={run.run_id}
                onClick={() => onSelect(run.run_id)}
                data-testid="bench-run-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "7px 12px",
                  borderBottom: "1px solid var(--border-light)",
                  font: `12px ${MONO}`,
                  cursor: "pointer",
                  opacity: interrupted ? 0.9 : 1,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {/* ISO, like the header: 8/11/2026 is ambiguous outside
                      the US and the two surfaces disagreed. */}
                  {benchLocalDate(run.created)}
                </span>
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  data-testid="bench-run-name"
                >
                  {/* Real model first, alias second and LABELLED — the same
                      order the hero uses. A bare "· looping-model" left the
                      reader guessing which of the two facts it was. */}
                  {(() => {
                    const naming = runNaming(run.models, run.config);
                    return (
                      <>
                        {naming.primary}
                        {isNonDefaultTarget(run.config?.url, bench.defaultUrl) && (
                          <span style={{ marginLeft: 6 }}>
                            <TargetBadge url={run.config?.url ?? ""} />
                          </span>
                        )}
                        {naming.alias && (
                          <span
                            data-testid="bench-run-alias"
                            title="--label names a run in the results; it does not select or describe the model. The model above is the one actually benchmarked."
                            style={{
                              color: "var(--text-muted)",
                              fontSize: 10.5,
                              marginLeft: 6,
                            }}
                          >
                            · Benchmark Alias: {naming.alias}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </span>
                <RunOutcome
                  isLiveRun={isLiveRun}
                  interrupted={interrupted}
                  samples={run.summary?.samples ?? 0}
                  avg={avg}
                  maxPoints={run.summary?.max_points ?? "?"}
                  score={run.summary?.score}
                />
                <span
                  style={{
                    font: "11px Inter, system-ui, sans-serif",
                    color: "var(--text-muted)",
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span data-testid="bench-provenance">
                    {sampleLabel(run.config)}
                  </span>
                  {showChips &&
                    chips?.comparable &&
                    (chips.up.length > 0 || chips.down.length > 0) && (
                      <span
                        data-testid="bench-regression-chips"
                        title={`Compared with the previous run of the same model in this edition. Newly solved: ${chips.up.join(", ") || "none"}. Regressed: ${chips.down.join(", ") || "none"}. A solved→unsolved flip within one edition is a real capability change, not benchmark drift.`}
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          cursor: "help",
                          fontFamily: MONO,
                          fontWeight: 600,
                        }}
                      >
                        {chips.up.length > 0 && (
                          <span style={{ color: "var(--success)" }}>
                            ▲{chips.up.length}
                          </span>
                        )}
                        {chips.down.length > 0 && (
                          <span style={{ color: "var(--danger)" }}>
                            ▼{chips.down.length}
                          </span>
                        )}
                      </span>
                    )}
                  {interrupted && (
                    <button
                      type="button"
                      data-testid="bench-resume"
                      disabled={resumingFolder === run.folder}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onResume(run.folder, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          // Every setting bench.py's resume guard compares.
                          // Omitting one does not inherit the run's value —
                          // bench.py checks it against its own default and
                          // exits, which killed every resume of a
                          // dashboard-started run. `temperature` is sent even
                          // when null: null means "the flag was omitted", and
                          // the backend forwards no flag for it.
                          body: JSON.stringify({
                            folder: run.folder,
                            attempts: run.config?.attempts,
                            n: run.config?.n,
                            url: run.config?.url,
                            model: run.models[0],
                            temperature: run.config?.temperature ?? null,
                            time_budget: run.config?.time_budget,
                            time_step: run.config?.time_step,
                          }),
                        });
                      }}
                      style={{
                        font: "600 10px Inter, system-ui, sans-serif",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        borderRadius: "var(--radius-sm)",
                        padding: "2px 10px",
                        cursor: resumingFolder === run.folder ? "not-allowed" : "pointer",
                        opacity: resumingFolder === run.folder ? 0.6 : 1,
                      }}
                    >
                      {resumingFolder === run.folder ? "Resuming…" : "Resume"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Compare ─────────────────────────────────────────────────────────────────

function ComparePane({
  bench,
  selected,
  setSelected,
}: {
  bench: BenchData;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const { runs, storedDetails } = bench;

  // One source of truth: the columns ARE the slots. The chip cloud drew from
  // `runs` while the columns came from `storedDetails`, so a selected run
  // whose detail was missing silently vanished from the table and the two
  // sets disagreed with no way to tell which was authoritative. A column now
  // exists for every chosen run; an unreadable detail shows as blank cells,
  // which is visible, rather than as a missing column, which is not.
  const detailById = useMemo(() => {
    const m = new Map<string, BenchRunDetail>();
    for (const d of storedDetails) m.set(d.run_id, d);
    return m;
  }, [storedDetails]);

  const slots = useMemo(
    () => Array.from({ length: COMPARE_SLOTS }, (_, i) => selected[i] ?? ""),
    [selected],
  );
  const chosen = useMemo(() => slots.filter(Boolean), [slots]);
  const chosenRows = useMemo(
    () =>
      chosen
        .map((id) => runs.find((r) => r.run_id === id))
        .filter((r): r is BenchRunRow => Boolean(r)),
    [chosen, runs],
  );
  const details = useMemo(
    () => chosenRows.map((r) => detailById.get(r.run_id) ?? null),
    [chosenRows, detailById],
  );
  const eligibility = compareEligibility(chosenRows, runs);
  const taskOrder = bench.taskList?.tasks;
  const rows = useMemo(
    () => (eligibility.eligible ? compareRows(details, taskOrder) : []),
    [details, eligibility.eligible, taskOrder],
  );

  // T115: tasks present in some runs but not all.
  // T188: source switched from records (scored only) to tasks[] (attempted).
  const coverageNote = useMemo(() => {
    if (!eligibility.eligible || details.length < 2) return null;
    const taskSets = details.map((d) => new Set(d?.tasks ?? []));
    const allTasks = new Set(taskSets.flatMap((s) => [...s]));
    const partial = [...allTasks].filter((t) =>
      taskSets.some((s) => !s.has(t)),
    );
    if (partial.length === 0) return null;
    const sharedCount = [...allTasks].filter((t) =>
      taskSets.every((s) => s.has(t)),
    ).length;
    return { tasks: partial, sharedCount };
  }, [details, eligibility.eligible]);

  const setSlot = (index: number, runId: string) => {
    const next = [...slots];
    next[index] = runId;
    setSelected(next.filter(Boolean));
  };

  const allSlotOptions = useMemo(
    () => slots.map((_, i) => compareSlotOptions(runs, slots, i, bench.defaultUrl)),
    [runs, slots, bench.defaultUrl],
  );

  return (
    <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {slots.map((slotValue, i) => {
          const options = allSlotOptions[i];
          return (
            <label
              key={i}
              style={{ display: "flex", flexDirection: "column", gap: 3 }}
            >
              <span
                style={{
                  font: "600 9px Inter, system-ui, sans-serif",
                  letterSpacing: "0.6px",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Column {i + 1}
              </span>
              <select
                data-testid={`bench-compare-slot-${i}`}
                // A form field without id/name is reported by the browser's
                // own issue panel and is not addressable by assistive tech.
                id={`bench-compare-slot-${i}`}
                name={`bench-compare-slot-${i}`}
                aria-label={`Comparison column ${i + 1}`}
                value={slotValue}
                onChange={(e) => setSlot(i, e.target.value)}
                style={{
                  font: `10px ${MONO}`,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  borderRadius: 6,
                  padding: "3px 6px",
                  maxWidth: 320,
                }}
              >
                {/* Always reachable, including while a refusal is shown —
                    this is the deselect path the chips never had. */}
                <option value="">— none —</option>
                {options.map((o) => (
                  <option
                    key={o.runId}
                    value={o.runId}
                    disabled={o.disabled}
                    title={o.reason ?? undefined}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      {!eligibility.eligible ? (
        <div
          className="bench-banner"
          data-testid="bench-compare-refusal"
          style={{ margin: "0 12px 12px", fontSize: 12 }}
        >
          <TriangleAlert size={13} />
          <span>{eligibility.message}</span>
        </div>
      ) : (
        <>
          <div
            style={{
              margin: "0 12px 10px",
              font: "11px Inter, system-ui, sans-serif",
              color: "var(--text-secondary)",
            }}
          >
            Comparing <b>{chosenRows.length} runs</b> · edition{" "}
            <b style={{ fontFamily: MONO }}>{chosenRows[0]?.suite_hash}</b> ·{" "}
            <b>{compareNotation(chosenRows[0]?.config)}</b>. Each cell is one
            square per sample and the task's average over samples; Δ is the
            spread of those averages.
          </div>
          {coverageNote && (
            <div
              className="bench-banner"
              data-testid="bench-compare-coverage"
              style={{ margin: "0 12px 10px", fontSize: 11 }}
              title={coverageNote.tasks.join(", ")}
            >
              <TriangleAlert size={13} />
              <span>
                Runs share {coverageNote.sharedCount}{" "}
                {coverageNote.sharedCount === 1 ? "task" : "tasks"}.{" "}
                {coverageNote.tasks.length}{" "}
                {coverageNote.tasks.length === 1 ? "task appears" : "tasks appear"}{" "}
                in some but not all runs:{" "}
                <span style={{ fontFamily: MONO }}>
                  {groupCoverage(coverageNote.tasks)}
                </span>
                .
              </span>
            </div>
          )}
          {/* Score strip + lang block — T190: one wrapper IIFE so cols, gap,
              and sameTaskSet are in scope for both sub-blocks; nothing is
              redeclared in the second block. */}
          {(() => {
            // Gate Δ on task-set equality — equal count but different ids
            // is a miscomparison that summary.tasks (a count) cannot detect.
            // Lifted here so the ALL row consumes the same rule, not a copy.
            const taskSet0 = new Set(details[0]?.tasks ?? []);
            const taskSet1 = details[1] ? new Set(details[1].tasks ?? []) : null;
            const sameTaskSet =
              chosenRows.length === 2 &&
              taskSet1 !== null &&
              taskSet0.size === taskSet1.size &&
              [...taskSet0].every((t) => taskSet1!.has(t));

            const cols = cmpCols(chosenRows.length);

            const s0 = chosenRows[0]?.summary?.score;
            const s1 = chosenRows[1]?.summary?.score;
            const scoreDiff =
              sameTaskSet &&
              typeof s0 === "number" &&
              typeof s1 === "number"
                ? s0 - s1
                : null;

            const getPassesVal = (s: (typeof chosenRows)[0]["summary"]) =>
              s?.passes_100 !== undefined
                ? s.passes_100
                : s?.correctness_100 !== undefined
                  ? s.correctness_100
                  : null;
            const p0 = getPassesVal(chosenRows[0]?.summary);
            const p1 = getPassesVal(chosenRows[1]?.summary);
            const passesDiff =
              sameTaskSet && p0 !== null && p1 !== null ? p0 - p1 : null;

            const t0 = chosenRows[0]?.summary?.tests_100;
            const t1 = chosenRows[1]?.summary?.tests_100;
            const testsDiff =
              sameTaskSet && typeof t0 === "number" && typeof t1 === "number"
                ? t0 - t1
                : null;

            const sw0 = chosenRows[0]?.summary?.speed_weighted;
            const sw1 = chosenRows[1]?.summary?.speed_weighted;
            const speedDiff =
              sameTaskSet && typeof sw0 === "number" && typeof sw1 === "number"
                ? sw0 - sw1
                : null;

            const labelStyle: React.CSSProperties = {
              color: "var(--text-muted)",
              fontSize: 10,
              textAlign: "left",
            };
            const numStyle: React.CSSProperties = { textAlign: "right" };
            const renderDiff = (
              diff: number | null,
              testId: string,
            ) => (
              <span
                data-testid={testId}
                style={{
                  fontWeight: 700,
                  textAlign: "right",
                  color:
                    diff === null
                      ? "var(--text-muted)"
                      : diff > 0
                        ? "var(--success)"
                        : diff < 0
                          ? "var(--danger)"
                          : "var(--text-secondary)",
                }}
              >
                {diff === null
                  ? "—"
                  : diff >= 0
                    ? `+${diff.toFixed(1)}`
                    : diff.toFixed(1)}
              </span>
            );

            const anyPartial = chosenRows.some((r) => r.summary?.partial === true);

            // Score strip — only rendered when at least one selected run has
            // the -157+ score field. Pre-157 runs show "—" rather than 0.
            const scoreStrip = chosenRows.some((r) => r.summary?.score !== undefined) ? (
              <div
                data-testid="bench-compare-scores"
                style={{
                  margin: "0 12px 10px",
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: `4px ${CMP_COL_GAP}px`,
                  font: `11px ${MONO}`,
                  color: "var(--text-secondary)",
                }}
              >
                {/* Run label header — same text as per-task table column headers */}
                <span />
                {chosenRows.map((r) => {
                  const naming = runNaming(r.models, r.config);
                  return (
                    <span
                      key={r.run_id}
                      data-testid="bench-compare-score-header"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "right",
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                      }}
                    >
                      {naming.primary}
                      {naming.alias ? ` (alias ${naming.alias})` : ""}
                      {" · "}
                      {compareNotation(r.config)}
                    </span>
                  );
                })}
                <span />

                {/* Score row */}
                <span style={labelStyle}>Score</span>
                {chosenRows.map((r) => {
                  const s = r.summary;
                  const sc = s?.score;
                  const hasField = sc !== undefined;
                  return (
                    <span key={r.run_id} style={{ fontWeight: 700, textAlign: "right" }}>
                      {hasField ? (sc === null ? "—" : `${sc.toFixed(1)}/100`) : "—"}
                    </span>
                  );
                })}
                {renderDiff(scoreDiff, "bench-compare-score-diff")}

                {/* Partial run notes row — one cell per run, same grid shape */}
                {anyPartial && (
                  <>
                    <span />
                    {chosenRows.map((r) => (
                      <span key={r.run_id} style={{ textAlign: "right" }}>
                        {r.summary?.partial === true && (
                          <span
                            data-testid="bench-compare-partial-note"
                            style={{
                              fontWeight: 400,
                              fontSize: 9,
                              color: "var(--warning)",
                            }}
                          >
                            partial run
                          </span>
                        )}
                      </span>
                    ))}
                    <span />
                  </>
                )}

                {/* Passes row: -185+ field; -165 fallback: correctness_100 */}
                <span style={labelStyle}>Passes</span>
                {chosenRows.map((r) => {
                  const passes = getPassesVal(r.summary);
                  return (
                    <span key={r.run_id} style={numStyle}>
                      {passes !== null ? passes.toFixed(1) : "—"}
                    </span>
                  );
                })}
                {renderDiff(passesDiff, "bench-compare-passes-diff")}

                {/* Tests row: -185+ only; — for -165 and pre-scoring */}
                <span style={labelStyle}>Tests</span>
                {chosenRows.map((r) => {
                  const t = r.summary?.tests_100;
                  return (
                    <span key={r.run_id} style={numStyle}>
                      {t !== undefined && t !== null ? t.toFixed(1) : "—"}
                    </span>
                  );
                })}
                {renderDiff(testsDiff, "bench-compare-tests-diff")}

                {/* Speed */}
                <span style={labelStyle}>Speed</span>
                {chosenRows.map((r) => {
                  const sw = r.summary?.speed_weighted;
                  return (
                    <span key={r.run_id} style={numStyle}>
                      {sw !== undefined && sw !== null ? sw.toFixed(1) : "—"}
                    </span>
                  );
                })}
                {renderDiff(speedDiff, "bench-compare-speed-diff")}
              </div>
            ) : null;

            const allLangs = sortByLangOrder(
              [
                ...new Set(
                  details.flatMap((d) =>
                    d ? Object.keys(d.summary?.by_language ?? {}) : [],
                  ),
                ),
              ],
              bench.taskList?.tasks.map((t) => t.lang),
            );
            const langSection = allLangs.length > 0 ? (
              <div
                data-testid="bench-compare-lang"
                style={{
                  margin: "0 12px 10px",
                  font: `12px ${MONO}`,
                  color: "var(--text-secondary)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    gap: `2px ${CMP_COL_GAP}px`,
                    fontWeight: 600,
                    fontSize: 9,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  <span>Language</span>
                  {chosenRows.map((r) => {
                    const naming = runNaming(r.models, r.config);
                    return (
                      <span key={r.run_id} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {naming.primary}
                      </span>
                    );
                  })}
                  <span style={{ textAlign: "right" }}>spread</span>
                </div>
                {allLangs.map((lang) => {
                  const scores = details.map((d) => {
                    if (!d) return null;
                    const v = d.summary?.by_language?.[lang];
                    if (v === undefined) return null;
                    if (typeof v !== "object" || v === null)
                      return typeof v === "number" ? v : null;
                    return v.score != null ? v.score : null;
                  });
                  const allPresent =
                    scores.length >= 2 && scores.every((s) => s !== null);
                  // T188: suppress Δ when runs covered different task subsets
                  // for this language — equal lang score counts can still hide
                  // different task ids.
                  const langPrefix = lang + "/";
                  const sameLangTasks = (() => {
                    if (details.length < 2) return false;
                    const s0 = new Set((details[0]?.tasks ?? []).filter(t => t.startsWith(langPrefix)));
                    const s1 = new Set((details[1]?.tasks ?? []).filter(t => t.startsWith(langPrefix)));
                    return s0.size === s1.size && [...s0].every(t => s1.has(t));
                  })();
                  const delta = allPresent && sameLangTasks
                    ? (deltaSpread(scores)?.toFixed(1) ?? null)
                    : null;
                  return (
                    <div
                      key={lang}
                      data-testid="bench-compare-lang-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: cols,
                        gap: `2px ${CMP_COL_GAP}px`,
                      }}
                    >
                      <span>{lang}</span>
                      {scores.map((s, i) => (
                        <span key={i}>{s !== null ? s.toFixed(1) : "—"}</span>
                      ))}
                      <span style={{ textAlign: "right" }}>
                        {delta ?? "—"}
                      </span>
                    </div>
                  );
                })}
                {(() => {
                  if (!details.some((d) => d?.summary?.score !== undefined))
                    return null;
                  const overallScores = details.map((d) =>
                    d?.summary?.score !== undefined
                      ? (d.summary.score ?? null)
                      : null,
                  );
                  const allPresent =
                    overallScores.length >= 2 &&
                    overallScores.every((s) => s !== null);
                  const delta = allPresent && sameTaskSet
                    ? (deltaSpread(overallScores)?.toFixed(1) ?? null)
                    : null;
                  return (
                    <div
                      data-testid="bench-compare-all-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: cols,
                        gap: `2px ${CMP_COL_GAP}px`,
                        borderTop: "1px solid var(--border-color)",
                        marginTop: 3,
                        paddingTop: 3,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      <span>ALL</span>
                      {overallScores.map((s, i) => (
                        <span key={i}>{s != null ? s.toFixed(1) : "—"}</span>
                      ))}
                      <span style={{ textAlign: "right" }}>{delta ?? "—"}</span>
                    </div>
                  );
                })()}
              </div>
            ) : null;

            if (!scoreStrip && !langSection) return null;
            return <>{scoreStrip}{langSection}</>;
          })()}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              font: `12px ${MONO}`,
            }}
          >
            <thead>
              <tr>
                <th style={TH}>Task</th>
                {chosenRows.map((d) => {
                  const naming = runNaming(d.models, d.config);
                  return (
                    <th
                      key={d.run_id}
                      data-testid="bench-compare-col"
                      data-run-id={d.run_id}
                      style={TH}
                    >
                      {isNonDefaultTarget(d.config?.url, bench.defaultUrl) && (
                        <span style={{ marginRight: 5 }}>
                          <TargetBadge url={d.config?.url ?? ""} />
                        </span>
                      )}
                      {/* Same convention as the hero and History. */}
                      {naming.primary}
                      {naming.alias ? ` (alias ${naming.alias})` : ""}{" "}
                      · {compareNotation(d.config)}
                    </th>
                  );
                })}
                <th style={{ ...TH, textAlign: "right" }}>Δ spread</th>
                <th style={{ ...TH, textAlign: "right" }}>Average time (s)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.task} data-testid="bench-compare-row">
                  <td style={{ ...TD, color: "var(--text-primary)" }}>
                    {row.task}
                  </td>
                  {row.means.map((m, i) => (
                    <td key={i} style={TD}>
                      <span className="bench-strip">
                        {row.cells[i].map((c, j) => (
                          <AttemptCell key={j} state={c} />
                        ))}
                      </span>{" "}
                      <span style={{ fontWeight: 700 }}>
                        {m === null ? "—" : m.toFixed(2)}
                      </span>
                    </td>
                  ))}
                  <td
                    style={{
                      ...TD,
                      textAlign: "right",
                      color:
                        (row.delta ?? 0) > 1 ? "var(--warning)" : undefined,
                      fontWeight: (row.delta ?? 0) > 1 ? 700 : 400,
                    }}
                    data-testid="bench-delta"
                  >
                    {row.delta === null ? "—" : row.delta.toFixed(2)}
                  </td>
                  <td
                    style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}
                    data-testid="bench-gen-mean"
                  >
                    {row.genMeans.every((g) => g === null)
                      ? "—"
                      : row.genMeans
                          .map((g) => (g === null ? "—" : g.toFixed(1)))
                          .join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p
            style={{
              margin: "10px 12px",
              font: "11px Inter, system-ui, sans-serif",
              color: "var(--text-muted)",
              maxWidth: "70ch",
            }}
          >
            {taskOrder && taskOrder.length > 0
              ? "Sorted by suite task order."
              : "Sorted by Δ: the tasks where runs disagree most are the ones that discriminate between these models."}{" "}
            The strongest comparison uses{" "}
            <code>--report</code>
            {" "}to load pre-scored results into one view; pick the same
            edition and{" "}
            <code>--attempts</code>
            {" "}across runs to keep the metrics comparable.
          </p>
        </>
      )}
    </div>
  );
}

// ── Leads ───────────────────────────────────────────────────────────────────

function LeadsPane({
  details,
  edition,
}: {
  details: BenchRunDetail[];
  edition: string;
}) {
  const rows = useMemo(
    () => leadsFromRuns(details, edition),
    [details, edition],
  );
  const coverage = useMemo(
    () => leadsCoverage(details, edition),
    [details, edition],
  );
  return (
    <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
      <p
        style={{
          margin: "10px 12px",
          font: "11px Inter, system-ui, sans-serif",
          color: "var(--text-muted)",
          maxWidth: "70ch",
        }}
      >
        The same assertion failing on attempt 1 across different models is
        either a genuinely discriminating test or a defective prompt — one run
        cannot tell them apart. Treat this as a lead list, not a leaderboard.
        Fed by first_failed[] across stored runs, current edition{" "}
        <b style={{ fontFamily: MONO }}>{edition}</b> only.
        {/* What the list CANNOT see. A cut-off sample has no failed
            assertion — nothing failed, the run was amputated — so it
            contributes nothing here, and the remaining rows look like one
            uniquely broken task rather than the few that failed by
            assertion. */}
        {coverage.skipped > 0 && (
          <>
            {" "}
            <b data-testid="bench-leads-skipped">
              {coverage.skipped} unsolved{" "}
              {coverage.skipped === 1 ? "sample is" : "samples are"} missing
              from it
            </b>
            : a sample cut off before it finished has no failed assertion to
            report, so whatever went wrong there cannot appear in this list.
          </>
        )}
        {coverage.models < 2 && (
          <>
            {" "}
            <b data-testid="bench-leads-unranked">
              Only one model is in history, so every row ties at 1/1 and this is
              not a ranking yet
            </b>{" "}
            — it needs a second model before the order means anything.
          </>
        )}
      </p>
      {rows.length === 0 && (
        <EmptyPane>
          Nothing to lead on yet: no assertion has failed on attempt 1 in this
          edition. That is not the same as a clean run — a sample cut off before
          it finished reports no failed assertion at all.
        </EmptyPane>
      )}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          font: `12px ${MONO}`,
        }}
      >
        <thead>
          <tr>
            <th style={TH}>Assertion — failing cold</th>
            <th style={{ ...TH, textAlign: "right" }}>Models</th>
            <th style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 40).map((r, i) => (
            <tr key={i} data-testid="bench-lead-row">
              <td style={{ ...TD, whiteSpace: "normal", fontSize: 11 }}>
                {r.assertion}
                <div
                  style={{ font: `10px ${MONO}`, color: "var(--text-muted)" }}
                >
                  {r.task}
                </div>
              </td>
              <td style={{ ...TD, textAlign: "right" }}>
                {r.models}/{r.totalModels}
              </td>
              <td style={TD}>
                <span
                  style={{
                    display: "inline-flex",
                    font: "500 10px Inter, system-ui, sans-serif",
                    borderRadius: 20,
                    padding: "1px 8px",
                    border: `1px solid ${r.models >= Math.max(2, r.totalModels - 1) ? "color-mix(in srgb, var(--warning) 45%, transparent)" : "var(--border-color)"}`,
                    color:
                      r.models >= Math.max(2, r.totalModels - 1)
                        ? "var(--warning)"
                        : "var(--text-secondary)",
                  }}
                >
                  {r.models >= Math.max(2, r.totalModels - 1)
                    ? "inspect prompt"
                    : "watch"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
