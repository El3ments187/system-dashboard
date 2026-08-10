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
  compareRows,
  gradedRecords,
  groupByEdition,
  groupByTask,
  isBudgetTainted,
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
import type { BenchRecord, BenchRunDetail } from "./types";

const MONO = '"JetBrains Mono", "Fira Code", monospace';

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
          query={query}
          warming={warming}
          openTask={openTask?.runKey === runKey ? openTask.task : null}
          setOpenTask={(task) => setOpenTask(task ? { runKey, task } : null)}
        />
      )}
      {tab === "hist" && (
        <HistoryPane
          bench={bench}
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
  query,
  openTask,
  setOpenTask,
}: {
  detail: BenchRunDetail | null;
  /** A spawned run whose results.json does not exist yet. */
  warming: boolean;
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

  const rows = [...byTask.entries()].filter(([task]) =>
    task.toLowerCase().includes(query.toLowerCase()),
  );

  if (warming)
    return (
      <div
        data-testid="bench-this-run-empty"
        style={{ padding: 16, color: "var(--text-muted)" }}
      >
        No samples recorded yet for this run. bench.py writes results.json when
        the first sample completes; task rows appear then.
      </div>
    );

  if (!detail)
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
            {rows.map(([task, rs]) => {
              const graded = gradedRecords(rs);
              const mean = taskMean(rs);
              const solved = graded.filter((r) => r.solved).length;
              const genMean =
                graded.length === 0
                  ? null
                  : graded.reduce((s, r) => s + r.gen_seconds, 0) /
                    graded.length;
              const tainted = rs.some((r) =>
                isBudgetTainted(records.indexOf(r), trunc),
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
                          title="Recorded after three consecutive truncated replies — measuring the token cap, not the model."
                          style={{
                            marginLeft: 6,
                            font: `8.5px ${MONO}`,
                            color: "var(--warning)",
                            padding: "0 4px",
                          }}
                        >
                          BUDGET
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
                        {rs[0]?.lang}
                      </span>
                    </td>
                    <td style={TD}>
                      <AttemptStrip
                        records={rs}
                        expectedSamples={expectedSamples}
                        live={task === detail.live?.current_task}
                      />
                    </td>
                    <td
                      style={{ ...TD, textAlign: "right", fontWeight: 700 }}
                      data-testid="bench-task-mean"
                    >
                      {mean === null ? (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 400,
                          }}
                        >
                          —
                        </span>
                      ) : (
                        mean.toFixed(2)
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <KOfN solved={solved} of={graded.length} />
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
              <span style={{ color: "var(--text-muted)" }}>
                {" "}
                (excerpt · full text in raw/)
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
  onSelect,
  storedDetails,
}: {
  bench: BenchData;
  onSelect: (id: string) => void;
  storedDetails: BenchRunDetail[];
  now: number;
}) {
  const groups = useMemo(() => groupByEdition(bench.runs), [bench.runs]);
  const detailById = useMemo(() => {
    const m = new Map<string, BenchRunDetail>();
    for (const d of storedDetails) m.set(d.run_id, d);
    return m;
  }, [storedDetails]);

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
            const interrupted = !run.finished;
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
                {interrupted ? (
                  <span
                    data-testid="bench-interrupted"
                    style={{ color: "var(--text-muted)" }}
                  >
                    interrupted · {run.summary?.samples ?? 0} samples
                  </span>
                ) : (
                  <span style={{ fontWeight: 700 }}>
                    {avg === null ? "—" : avg.toFixed(2)}/
                    {run.summary?.max_points ?? "?"}
                  </span>
                )}
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
                  {chips?.comparable &&
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
                        void fetch("/api/bench/resume", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            folder: run.folder,
                            attempts: run.config?.attempts,
                            n: run.config?.n,
                            url: run.config?.url,
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
  const chosenRows = runs.filter((r) => selected.includes(r.run_id));
  const eligibility = compareEligibility(chosenRows);
  const details = storedDetails.filter((d) => selected.includes(d.run_id));
  const rows = useMemo(
    () => (eligibility.eligible ? compareRows(details) : []),
    [details, eligibility.eligible],
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
        {runs.slice(0, 8).map((r) => {
          const on = selected.includes(r.run_id);
          return (
            <button
              key={r.run_id}
              type="button"
              onClick={() =>
                setSelected(
                  on
                    ? selected.filter((id) => id !== r.run_id)
                    : [...selected, r.run_id],
                )
              }
              style={{
                font: `10px ${MONO}`,
                border: `1px solid ${on ? "var(--accent-tint-40)" : "var(--border-color)"}`,
                background: on ? "var(--accent-tint-10)" : "none",
                color: "var(--text-secondary)",
                borderRadius: 6,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {r.models.join(",")} · a{r.config?.attempts ?? "?"} n
              {r.config?.n ?? 1}
            </button>
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
            Comparing <b>{details.length} runs</b> · edition{" "}
            <b style={{ fontFamily: MONO }}>{chosenRows[0]?.suite_hash}</b> ·
            --attempts <b>{chosenRows[0]?.config?.attempts}</b>. Each cell is
            one square per sample and the task's x̄ over samples; Δ is the spread
            of those x̄s.
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
                {details.map((d) => (
                  <th key={d.run_id} data-testid="bench-compare-col" style={TH}>
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
                    · {sampleLabel(d.config)}
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
