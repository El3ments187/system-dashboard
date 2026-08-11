/**
 * Tasks & Runs — the four views, as subtabs of one card.
 *
 * Every number here is derived in `compute.ts` so the semantics can be
 * tested without rendering; this file is layout and wording.
 */
import { Fragment, useMemo, useState } from "react";
import { List, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { BenchConsole } from "./BenchConsole";
import { TargetBadge } from "../BenchPage";
import { AlertSeverity, useAlertsContext } from "../../context/AlertsContext";
import { Card, CardHeader } from "../../components/shared/CardComponents";
import MetricTile from "../../components/shared/MetricTile";
import { fmtNum } from "../llamacpp/parts";
import { fmtUptime } from "../llamaCppUtils";
import {
  AttemptCell,
  AttemptStrip,
  KOfN,
  StripLegend,
  SubTabs,
  type BenchTab,
} from "./parts";
import {
  assertionCanary,
  compareEligibility,
  compareNotation,
  compareRows,
  compareSlotOptions,
  gradedRecords,
  runTaskRoster,
  groupByEdition,
  groupByTask,
  failureExplanation,
  rowTaint,
  leadsFromRuns,
  regressionChips,
  isNonDefaultTarget,
  runNaming,
  runTaskAvg,
  sampleLabel,
  taskMean,
  truncationState,
} from "./compute";
import type { BenchData } from "./useBenchData";
import type { BenchRecord, BenchRunDetail, BenchRunRow } from "./types";

const MONO = '"JetBrains Mono", "Fira Code", monospace';

/** Compare renders at most three columns, so it offers exactly three slots. */
const COMPARE_SLOTS = 3;

/**
 * Each cutoff names its OWN remedy. They are not interchangeable: raising
 * `--max-tokens` does nothing for a bench.py budget stop, and `--nudge-at`
 * does nothing for a server-side truncation. Both tooltips also state the
 * contagion, because the badge marks every sample from the trigger onward,
 * not only the one that was cut.
 */
const TAINT_TOOLTIP: Record<"budget" | "truncation", string> = {
  budget:
    "Recorded at or after bench.py stopped a reply at its own --nudge-at budget, so this score measures the cutoff rather than the model. Raise --nudge-at or --max-nudges; --max-tokens does not affect this.",
  truncation:
    "Recorded at or after three consecutive replies the server cut short (finish_reason: length), so this score measures the token cap rather than the model. Raise --max-tokens; --nudge-at does not affect this.",
};

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

/** History's outcome cell: still running, interrupted, or a final score. */
function RunOutcome({
  isLiveRun,
  interrupted,
  samples,
  avg,
  maxPoints,
}: {
  isLiveRun: boolean;
  interrupted: boolean;
  samples: number;
  avg: number | null;
  maxPoints: number | string;
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
  return (
    <span style={{ fontWeight: 700 }}>
      {avg === null ? "—" : avg.toFixed(2)}/{maxPoints}
    </span>
  );
}

const PANEL_CARD_STYLE: React.CSSProperties = {
  position: "relative",
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-light, var(--border-color))",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const TH: React.CSSProperties = {
  font: "600 9px Inter, system-ui, sans-serif",
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
              window.history.pushState({}, "", "/settings");
              window.dispatchEvent(new PopStateEvent("popstate"));
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
  now,
  running,
  warming,
  outputFolder,
}: {
  bench: BenchData;
  now: number;
  running: boolean;
  /** A spawned run whose results.json does not exist yet. */
  warming: boolean;
  /** Run folder for the Console tab's toolbar note (moved out of the hero). */
  outputFolder: string;
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

  // Roster rows render before the run's detail exists, so a click can be
  // keyed to a placeholder. Migrate it when the real id arrives — dropping it
  // collapsed an expanded task the moment the poll landed. A real id becoming
  // a DIFFERENT real id is still a run change and still closes it (T64).
  // Adjusted during render, not in an effect: an effect would paint the
  // collapsed row first and then re-render.
  if (openTask && openTask.runKey !== runKey) {
    if (isPlaceholderRunKey(openTask.runKey))
      setOpenTask({ runKey, task: openTask.task });
  }

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
        <ThisRunPane
          detail={detail}
          roster={roster}
          unavailableLangs={unavailableLangs}
          query={query}
          warming={warming}
          openTask={openTask?.runKey === runKey ? openTask.task : null}
          setOpenTask={(task) => setOpenTask(task ? { runKey, task } : null)}
        />
      )}
      {tab === "hist" && (
        <HistoryPane
          bench={bench}
          running={running}
          onSelect={selectRun}
          storedDetails={storedDetails}
          now={now}
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
  const expectedSamples = detail?.config?.n ?? 1;

  // Rows come from the ROSTER, not from the records, so every task this run
  // covers is visible from the first render instead of the table growing one
  // row at a time while the hero already says "27 of 27". A task with no
  // record yet renders queued — never zeros, which read as a scored result.
  const rows: Array<[string, typeof records]> =
    roster.length > 0
      ? roster.map((t) => [t.id, byTask.get(t.id) ?? []])
      : [...byTask.entries()];
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
              <th style={TH}>Lang</th>
              <th style={TH}>
                Samples ×{expectedSamples} — attempts within each
              </th>
              <th style={{ ...TH, textAlign: "right" }}>x̄ pts</th>
              <th style={{ ...TH, textAlign: "right" }}>Solved</th>
              <th style={{ ...TH, textAlign: "right" }}>Gen x̄</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(([task, rs]) => {
              const lang = task.split("/")[0];
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
              const tainted = rowTaint(
                rs.map((r) => records.indexOf(r)),
                trunc,
              );
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
                          title={TAINT_TOOLTIP[tainted]}
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
                        colSpan={6}
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
  const worst =
    records.find((r) => !r.solved && r.status !== "server") ?? records[0];
  if (!worst) return null;
  const explanation = failureExplanation(worst);
  const canary = assertionCanary(worst);
  // completion_tokens is a SUM over the sample's attempts; total_tokens is the
  // LARGEST SINGLE request. Different units — labelled as such so they are
  // never read as one figure.
  const est = worst.tokens_estimated ? "~" : "";
  const estTitle = worst.tokens_estimated
    ? "Estimated by the harness, not reported by the server"
    : undefined;

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
          {worst.task} — why it failed
        </span>
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
          {worst.detail && (
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
          )}
        </div>
        <div>
          <div
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
            {worst.nudged && (
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
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
          >
            <MetricTile
              accent
              mono
              label="Gen"
              value={fmtUptime(worst.gen_seconds)}
              valueSize={12}
            />
            <MetricTile
              accent
              mono
              label="Test"
              value={fmtUptime(worst.test_seconds)}
              valueSize={12}
            />
            <MetricTile
              accent
              mono
              testId="bench-tokens-sum"
              label="Completion Σ (all attempts)"
              value={`${est}${fmtNum(worst.completion_tokens)}`}
              valueSize={12}
              style={estTitle ? { cursor: "help" } : undefined}
            />
            <MetricTile
              accent
              mono
              testId="bench-tokens-max"
              label="Largest single request"
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

function HistoryPane({
  bench,
  running,
  onSelect,
  storedDetails,
}: {
  bench: BenchData;
  /** The page's liveness signal — the same one the hero and Start/Stop use. */
  running: boolean;
  onSelect: (id: string) => void;
  storedDetails: BenchRunDetail[];
  now: number;
}) {
  const { addAlert } = useAlertsContext();
  const groups = useMemo(() => groupByEdition(bench.runs), [bench.runs]);
  const detailById = useMemo(() => {
    const m = new Map<string, BenchRunDetail>();
    for (const d of storedDetails) m.set(d.run_id, d);
    return m;
  }, [storedDetails]);

  // bench.py refuses a resume whose conditions differ from the recorded run by
  // exiting on launch. The response was previously discarded, so the run
  // simply never appeared and the reason stayed in the Console tab.
  const resumeRun = async (init: RequestInit) => {
    try {
      const res = await fetch("/api/bench/resume", init);
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!body.success) {
        addAlert(
          AlertSeverity.Error,
          "bench",
          `Resume refused: ${body.error ?? "bench.py did not start"}`,
        );
      }
    } catch {
      addAlert(
        AlertSeverity.Error,
        "bench",
        "Resume failed: the dashboard could not be reached",
      );
    }
  };

  return (
    <div style={{ overflow: "auto", flex: "1 1 0", minHeight: 160 }}>
      <div
        className="bench-banner"
        style={{ margin: "10px 12px", fontSize: 12 }}
      >
        <TriangleAlert size={13} />
        <span>
          Cross-edition scores are not comparable — the benchmark itself
          changed.
        </span>
      </div>
      {groups.map((g, gi) => (
        <div key={g.suiteHash}>
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
          <div style={EDHEAD}>
            {gi === 0 ? "current edition" : "previous edition"}
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
                    },
                    {
                      models: b.models,
                      suite_hash: b.suite_hash,
                      records: b.records,
                    },
                  )
                : null;
            // T86 — "not finished" is true of a run that is STILL GOING as
            // well as one that stopped, and the two were conflated: the live
            // run showed as "interrupted" with a Resume button. Resuming a
            // live run is not a no-op — it would spawn a second process
            // against the same run directory. Liveness comes from the same
            // signal driving the hero and Start/Stop, not a second rule.
            const isLiveRun = running && run.run_id === bench.detail?.run_id;
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
                  {new Date(run.created).toLocaleDateString()}
                </span>
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  data-testid="bench-run-name"
                >
                  {/* Real model first, alias second and LABELLED — the same
                      order the hero uses. A bare "· looping-model" left the
                      reader guessing which of the two facts it was. */}
                  {runNaming(run.models, run.config).primary}
                  {isNonDefaultTarget(run.config?.url, bench.defaultUrl) && (
                    <span style={{ marginLeft: 6 }}>
                      <TargetBadge url={run.config?.url ?? ""} />
                    </span>
                  )}
                  {runNaming(run.models, run.config).alias && (
                    <span
                      data-testid="bench-run-alias"
                      title="--label names a run in the results; it does not select or describe the model. The model above is the one actually benchmarked."
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 10.5,
                        marginLeft: 6,
                      }}
                    >
                      · Benchmark Alias:{" "}
                      {runNaming(run.models, run.config).alias}
                    </span>
                  )}
                </span>
                <RunOutcome
                  isLiveRun={isLiveRun}
                  interrupted={interrupted}
                  samples={run.summary?.samples ?? 0}
                  avg={avg}
                  maxPoints={run.summary?.max_points ?? "?"}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        void resumeRun({
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
                        cursor: "pointer",
                      }}
                    >
                      Resume
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
  const eligibility = compareEligibility(chosenRows);
  const rows = useMemo(
    () => (eligibility.eligible ? compareRows(details) : []),
    [details, eligibility.eligible],
  );

  const setSlot = (index: number, runId: string) => {
    const next = [...slots];
    next[index] = runId;
    setSelected(next.filter(Boolean));
  };

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
          const options = compareSlotOptions(runs, slots, i, bench.defaultUrl);
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
            square per sample and the task's x̄ over samples; Δ is the spread of
            those x̄s.
          </div>
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
                {chosenRows.map((d) => (
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
                    {runNaming(d.models, d.config).primary}
                    {runNaming(d.models, d.config).alias
                      ? ` (alias ${runNaming(d.models, d.config).alias})`
                      : ""}{" "}
                    · {compareNotation(d.config)}
                  </th>
                ))}
                <th style={{ ...TH, textAlign: "right" }}>Δ spread</th>
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
            Sorted by Δ: the tasks where runs disagree most are the ones that
            discriminate between these models — or indict a prompt. The
            strongest comparison needs none of this machinery: several models in
            ONE run (-m repeated) shares edition, sweep and server session by
            construction.
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
      </p>
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
