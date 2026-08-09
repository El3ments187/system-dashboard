/**
 * Bench — runs and reads localbench.
 *
 * One page in the llama.cpp grammar: running vs idle swaps card CONTENTS,
 * never the layout. Every figure comes from results.json at runtime; no task
 * name or count is hardcoded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlaskConical,
  Gauge as GaugeIcon,
  SlidersHorizontal,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Card, CardHeader } from "../components/shared/CardComponents";
import MetricTile from "../components/shared/MetricTile";
import ProgressBar from "../components/shared/ProgressBar";
import PanelErrorBoundary from "../components/common/PanelErrorBoundary";
import { RadialGauge } from "./llamacpp/RadialGauge";
import { StatusIndicator } from "./llamacpp/StatusIndicator";
import { fmtNum, middleTruncate } from "./llamacpp/parts";
import { fmtUptime } from "./llamaCppUtils";
import { AlertSeverity, useAlertsContext } from "../context/AlertsContext";
import { useMetricsContext } from "../context/MetricsContext";
import { useBenchData, isRunning } from "./bench/useBenchData";
import { TasksAndRuns } from "./bench/TasksAndRuns";
import { BenchFooter } from "./bench/BenchFooter";
import {
  estimatedRunSeconds,
  flakyTasks,
  gradedRecords,
  isNonDefaultTarget,
  runNaming,
  runTaskScope,
  startDisabledReason,
  greedyInterlock,
  heartbeatAgeMs,
  historicalTaskMedian,
  isHeartbeatStale,
  runTaskAvg,
  serverExcludedCount,
  truncationState,
} from "./bench/compute";
import type {
  BenchCheck,
  BenchCurrent,
  BenchLive,
  BenchRunDetail,
  BenchReadiness,
  BenchRunRow,
  BenchTaskList,
  CurrentRun,
} from "./bench/types";

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

const LABEL_STYLE: React.CSSProperties = {
  font: "600 9px Inter, system-ui, sans-serif",
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const BODY_STYLE: React.CSSProperties = {
  padding: "10px 15px 13px",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

/**
 * A run pointed at anything but the configured llama-server. Without this a
 * mockserver dry run and a real benchmark are indistinguishable — in the
 * live view and, worse, in History where the scores persist.
 */
export function TargetBadge({ url }: { url: string }) {
  return (
    <span
      data-testid="bench-mock-badge"
      title={`This run targets ${url}, not the configured llama-server. Scores from a mock or alternate endpoint are not comparable with real benchmark runs.`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        font: "600 9px Inter, system-ui, sans-serif",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        border: "1px solid var(--warning)",
        color: "var(--warning)",
        borderRadius: 4,
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      mock / other server
    </span>
  );
}

function CornerIndex({ n }: { n: string }) {
  return (
    <span
      style={{ fontSize: 9, fontFamily: MONO, color: "var(--border-color)" }}
    >
      {n}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        font: "500 10.5px Inter, system-ui, sans-serif",
        borderRadius: 20,
        padding: "2px 9px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Progress is the live counter while running, and complete once finished. */
function computeDonePct(
  live: BenchLive,
  detail: BenchRunDetail | null,
): number | null {
  if (live.total && live.total > 0)
    return Math.round(((live.done ?? 0) / live.total) * 100);
  if (detail) return 100;
  return null;
}

/**
 * Pacing is heartbeat-and-median, never wall clock: some tasks legitimately
 * run for over an hour, so elapsed time alone proves nothing.
 */
function pacingText(median: number | null, taskElapsed: number | undefined) {
  if (median === null)
    return "no stored median for this task yet — the heartbeat is the only health signal";
  const verdict = (taskElapsed ?? 0) <= median ? "on pace" : "over median";
  return `median for this task: ${fmtUptime(median)} — ${verdict}. Heartbeat and median decide health; elapsed alone proves nothing.`;
}

// ── Row 1 ───────────────────────────────────────────────────────────────────

/**
 * Where the hero's identity row comes from.
 *
 * Process state wins while a run this backend spawned is alive — bench.py
 * writes `live` only when it SAVES results.json, and the first save is a
 * whole sample away, so the file cannot be the source of liveness. A run
 * started from the CLI has no process state and falls through to the file,
 * which is the original polling path, unchanged.
 */
function heroIdentity(
  detail: BenchRunDetail | null,
  current: BenchCurrent,
  runs: BenchRunRow[],
) {
  const spawned = current.running ? current.run : null;
  const naming = detail
    ? runNaming(detail.models, detail.config)
    : { name: "no run selected", model: null };

  const labelMasksModel =
    !!spawned?.label && spawned.model !== spawned.label ? spawned.model : null;

  const detailFolder =
    runs.find((r) => r.run_id === detail?.run_id)?.folder ?? null;
  // Warming applies to THE RUN THAT IS RUNNING. A stale detail from a
  // previously selected run has records and would otherwise hide the notice.
  const showingSpawnedRun =
    !!spawned?.folder && detailFolder === spawned.folder;

  return {
    displayName: spawned
      ? (spawned.label ?? spawned.model ?? "starting…")
      : naming.name,
    displayModel: spawned ? labelMasksModel : naming.model,
    folder: spawned?.folder ?? detailFolder ?? "",
    startedAt: spawned?.started ?? detail?.created ?? null,
    configLabel: configLabelOf(spawned, detail),
    warming:
      current.running &&
      (!showingSpawnedRun || (detail?.records?.length ?? 0) === 0),
  };
}

function configLabelOf(
  spawned: CurrentRun | null,
  detail: BenchRunDetail | null,
): string | null {
  const attempts = spawned?.attempts ?? detail?.config?.attempts ?? null;
  const n = spawned?.n ?? detail?.config?.n ?? null;
  const temp = spawned?.temperature ?? detail?.config?.temperature ?? null;
  if (attempts === null && n === null && temp === null) return null;
  return `a${attempts ?? "?"} · n${n ?? 1} · t${temp ?? 0}`;
}

function HeroCard({
  detail,
  check,
  runs,
  live,
  running,
  stale,
  beatAge,
  truncationWarned,
  current,
  defaultUrl,
  targetUrl,
  taskList,
}: {
  detail: BenchRunDetail | null;
  check: BenchCheck | null;
  runs: BenchRunRow[];
  live: BenchLive;
  running: boolean;
  stale: boolean;
  beatAge: number | null;
  truncationWarned: boolean;
  current: BenchCurrent;
  defaultUrl: string;
  targetUrl: string;
  taskList: BenchTaskList | null;
}) {
  const { displayName, displayModel, folder, startedAt, configLabel, warming } =
    heroIdentity(detail, current, runs);

  // A live run's own flags win; otherwise the selected run's stored config.
  const liveLangs = current.running ? current.run?.langs : null;
  const scope = runTaskScope(
    taskList?.tasks,
    liveLangs ? liveLangs.split(",") : detail?.config?.langs,
  );
  const serverErrors = live.consecutive_server_errors ?? 0;
  // While a run is live the target is the one it was spawned with; for a
  // stored run it is the url preserved in its own config; before any run
  // it is whatever Run Setup currently shows.
  const heroTarget =
    (current.running ? current.run?.url : null) ??
    detail?.config?.url ??
    targetUrl;
  const heartbeatText =
    beatAge === null
      ? "no heartbeat yet"
      : `heartbeat ${Math.round(beatAge / 1000)}s ago`;

  return (
    <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
      <CardHeader
        compact
        icon={<FlaskConical size={13} />}
        title="Bench Run"
        titleAccentBar
        right={<CornerIndex n="01" />}
      />
      <div style={BODY_STYLE}>
        <div
          data-testid="bench-hero-model"
          style={{
            font: `700 22px ${MONO}`,
            letterSpacing: "-1px",
            margin: "4px 0 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {middleTruncate(displayName, 30)}
        </div>
        {displayModel && (
          <div
            data-testid="bench-hero-real-model"
            title="--label replaces the model name in the run's own records, so the label is shown as the run's name and the real model beneath it."
            style={{
              font: `10.5px ${MONO}`,
              color: "var(--text-muted)",
              margin: "0 0 4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            label · model {middleTruncate(displayModel, 34)}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            alignItems: "center",
            margin: "4px 0 8px",
          }}
        >
          <StatusIndicator status={running ? "running" : "stopped"} />
          {detail && (
            <Chip>
              edition <b style={{ fontFamily: MONO }}>{detail.suite_hash}</b>
            </Chip>
          )}
          {check && (
            <Chip>
              localbench <b style={{ fontFamily: MONO }}>{check.version}</b>
            </Chip>
          )}
          {/* THIS run's scope. Suite-wide availability (and which
              toolchains are missing) lives in Run Setup's Toolchains row —
              duplicating it here reads as "the whole suite is running". */}
          <Chip>
            <b style={{ fontFamily: MONO }} data-testid="bench-hero-taskcount">
              {scope.count}
            </b>{" "}
            of {scope.total} tasks
            {scope.langsLabel ? ` · ${scope.langsLabel}` : ""}
          </Chip>
          {/* What this run actually targets. A mock and a real benchmark
              are otherwise identical on screen. */}
          <Chip>
            <span data-testid="bench-target-url" style={{ fontFamily: MONO }}>
              {heroTarget || "no target"}
            </span>
          </Chip>
          {isNonDefaultTarget(heroTarget, defaultUrl) && (
            <TargetBadge url={heroTarget} />
          )}
        </div>

        {warming && (
          <div
            data-testid="bench-warming"
            style={{
              font: `10.5px ${MONO}`,
              color: "var(--text-muted)",
              margin: "0 0 8px",
            }}
          >
            first sample in progress — no results file yet. bench.py writes
            results.json when a sample completes, so scores and strips appear
            after the first one lands.
          </div>
        )}

        {running && !warming && (
          <div style={{ margin: "0 0 8px" }}>
            <span
              className={stale ? "bench-pulse stale" : "bench-pulse"}
              data-testid="bench-heartbeat"
              style={{ font: `600 10.5px ${MONO}` }}
            >
              <span className="bench-dot" />
              {heartbeatText}
              {stale ? " — stale" : ""}
            </span>
          </div>
        )}

        {serverErrors >= 1 && (
          <div
            className="bench-banner"
            data-testid="bench-server-banner"
            style={{ margin: "0 0 10px", padding: "5px 10px", fontSize: 11 }}
          >
            <TriangleAlert size={13} />
            <span>
              <b style={{ fontFamily: MONO }}>{serverErrors}</b> consecutive
              server errors — the sweep aborts itself at 3. Affected samples are
              re-run on --resume, never scored as zeros.
            </span>
          </div>
        )}

        {truncationWarned && (
          <div
            className="bench-banner"
            data-testid="bench-truncation-banner"
            style={{ margin: "0 0 10px", padding: "5px 10px", fontSize: 11 }}
          >
            <TriangleAlert size={13} />
            <span>
              Three replies in a row hit the token ceiling — results from that
              point are not a measure of skill. The run continues; this is a
              warning, not an abort. Raise <b>--max-tokens</b> and start the
              server with at least that much context (<b>-c</b>). If it fires on
              short tasks, suspect a chat-template mismatch rather than a low
              ceiling.
            </span>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginTop: "auto",
          }}
        >
          <MetricTile
            accent
            mono
            label="Started"
            value={startedAt ? new Date(startedAt).toLocaleTimeString() : null}
            valueSize={14}
          />
          <MetricTile
            accent
            mono
            label="Elapsed"
            value={fmtUptime(
              live.run_elapsed ?? detail?.summary?.seconds ?? null,
            )}
            valueSize={14}
          />
          <MetricTile
            accent
            mono
            label="Output"
            value={folder ? middleTruncate(`runs/${folder}`, 22) : null}
            valueSize={11}
          />
          <MetricTile
            accent
            mono
            label="Config"
            value={configLabel}
            valueSize={11}
          />
        </div>
      </div>
    </Card>
  );
}

function BannerTile({
  label,
  title,
  testId,
  value,
  suffix,
  percent,
}: {
  label: string;
  title?: string;
  testId: string;
  value: string;
  suffix: string;
  percent: number;
}) {
  return (
    <div
      data-accent-el=""
      style={{
        border: "1px solid var(--accent-tint-40)",
        background: "var(--accent-tint-10)",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 8,
      }}
    >
      <div style={LABEL_STYLE}>{label}</div>
      <div
        data-testid={testId}
        title={title}
        style={{ font: `700 24px ${MONO}` }}
      >
        {value}{" "}
        <span style={{ font: `600 11px ${MONO}`, color: "var(--text-muted)" }}>
          {suffix}
        </span>
      </div>
      <ProgressBar percent={percent} variant="compact" />
    </div>
  );
}

function ScoreCard({ detail }: { detail: BenchRunDetail | null }) {
  const records = useMemo(() => detail?.records ?? [], [detail]);
  const taskAvg = useMemo(() => runTaskAvg(records), [records]);
  const flaky = useMemo(() => flakyTasks(records), [records]);
  const graded = useMemo(() => gradedRecords(records), [records]);
  const serverExcluded = serverExcludedCount(records);
  const maxPoints =
    detail?.summary?.max_points ?? detail?.config?.attempts ?? 3;
  const solvedSamples = graded.filter((r) => r.solved).length;
  const firstTrySamples = graded.filter((r) => r.first_try).length;

  return (
    <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
      <CardHeader
        compact
        icon={<Target size={13} />}
        title="Score"
        titleAccentBar
        right={<CornerIndex n="02" />}
      />
      <div style={BODY_STYLE}>
        <BannerTile
          label="Task-avg — the number to rank on"
          title="Mean over tasks of each task's mean over samples. Task-weighted, so every task counts equally regardless of how many samples it got — unlike summary.mean_points, which is sample-weighted and diverges when sample counts are unbalanced."
          testId="bench-task-avg"
          value={taskAvg === null ? "—" : taskAvg.toFixed(2)}
          suffix={`/ ${maxPoints}`}
          percent={taskAvg === null ? 0 : (taskAvg / maxPoints) * 100}
        />
        <BannerTile
          label="Solved — samples"
          title="Server samples are excluded from the denominator: the endpoint never answered, so there is no verdict to count."
          testId="bench-solved"
          value={String(solvedSamples)}
          suffix={`/ ${graded.length} graded`}
          percent={
            graded.length === 0 ? 0 : (solvedSamples / graded.length) * 100
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            marginTop: "auto",
          }}
        >
          <MetricTile
            accent
            mono
            label="First try"
            value={firstTrySamples}
            valueSize={15}
          />
          <MetricTile
            mono
            label="Raw assertions"
            value={`${fmtNum(detail?.summary?.tests_passed ?? 0)}/${fmtNum(detail?.summary?.tests_expected ?? 0)}`}
            valueSize={12}
            style={{ opacity: 0.85 }}
          />
          <MetricTile
            accent
            mono
            testId="bench-flaky"
            label="Flaky solves"
            value={flaky.tasks.length}
            valueSize={15}
          />
          <MetricTile
            accent
            mono
            testId="bench-server-excluded"
            label="Server excl."
            value={serverExcluded}
            valueSize={15}
          />
        </div>

        {flaky.detail.length > 0 && (
          <div
            data-testid="bench-flaky-detail"
            style={{
              font: `9.5px ${MONO}`,
              color: "var(--text-muted)",
              marginTop: 5,
            }}
          >
            solved in some samples but not all:{" "}
            {flaky.detail
              .map((d) => `${d.task} ${d.solved}/${d.of}`)
              .join(", ")}
            {` · solid: ${flaky.solidCount}`}
          </div>
        )}
      </div>
    </Card>
  );
}

function ProgressCard({
  detail,
  live,
  running,
  donePct,
  median,
}: {
  detail: BenchRunDetail | null;
  live: BenchLive;
  running: boolean;
  donePct: number | null;
  median: number | null;
}) {
  const samplesValue = live.total
    ? `${live.done ?? 0}/${live.total}`
    : (detail?.summary?.samples ?? null);
  const attemptValue = live.current_attempt
    ? `${live.current_attempt}/${detail?.config?.attempts ?? "?"}`
    : "—";

  return (
    <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
      <CardHeader
        compact
        icon={<GaugeIcon size={13} />}
        title="Progress"
        titleAccentBar
        right={<CornerIndex n="03" />}
      />
      <div style={BODY_STYLE}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Wrapper class, not an inline filter: the glow on the progress
              arc has to be reachable by [data-glow] and reduced-motion. */}
          <span className="bench-gauge" data-testid="bench-gauge">
            <RadialGauge pct={donePct} size={110}>
              <span
                data-testid="bench-gauge-label"
                style={{ font: `700 24px ${MONO}`, lineHeight: 1 }}
              >
                {donePct === null ? "—" : donePct}
              </span>
              <span style={LABEL_STYLE}>% done</span>
            </RadialGauge>
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 7,
              flex: 1,
            }}
          >
            <MetricTile
              accent
              mono
              label="Samples"
              value={samplesValue}
              valueSize={14}
            />
            <MetricTile
              accent
              mono
              label="Elapsed"
              value={fmtUptime(
                live.run_elapsed ?? detail?.summary?.seconds ?? null,
              )}
              valueSize={14}
            />
            <MetricTile
              accent
              mono
              label="On task"
              value={live.current_task ?? "—"}
              valueSize={11}
            />
            <MetricTile
              accent
              mono
              label="Attempt"
              value={attemptValue}
              valueSize={14}
            />
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          <div
            style={{
              ...LABEL_STYLE,
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span>Task progress</span>
            {running && live.task_elapsed != null && (
              <span style={{ color: "var(--success)" }}>
                ● {fmtUptime(live.task_elapsed)} on task
              </span>
            )}
          </div>
          <ProgressBar percent={donePct ?? 0} variant="compact" />
          <div
            data-testid="bench-pacing"
            style={{
              font: `10px ${MONO}`,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {pacingText(median, live.task_elapsed)}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Row 2 left ──────────────────────────────────────────────────────────────

function ActionButton({
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  tone?: "primary" | "danger";
}) {
  let color = "var(--text-secondary)";
  if (tone === "danger") color = "var(--danger)";
  else if (tone === "primary") color = "#fff";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={`bench-action-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      style={{
        font: "600 11px Inter, system-ui, sans-serif",
        letterSpacing: "0.4px",
        borderRadius: "var(--radius-sm)",
        padding: "6px 13px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        border:
          tone === "danger"
            ? "1px solid color-mix(in srgb, var(--danger) 45%, transparent)"
            : "1px solid var(--border-light)",
        background:
          tone === "primary" ? "var(--accent-primary)" : "var(--bg-secondary)",
        color,
      }}
    >
      {label}
    </button>
  );
}

interface RunForm {
  model: string;
  langs: string;
  attempts: number;
  n: number;
  temperature: number;
}

function Field({
  label,
  hint,
  hintAccent,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  hintAccent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={LABEL_STYLE}>{label}</span>
      {children}
      {hint && (
        <span
          style={{
            fontSize: 9.5,
            color: hintAccent ? "var(--accent-primary)" : "var(--text-muted)",
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

const FIELD_INPUT: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "6px 8px",
  color: "var(--text-primary)",
  font: `12px ${MONO}`,
  width: "100%",
  minWidth: 0,
};

/**
 * Run Setup is a FORM, not a summary of the last run.
 *
 * Values are overrides layered over live defaults, so the fields track
 * incoming data (the selected run, the active model's temperature) until the
 * user actually types — rather than being snapshotted once and going stale,
 * or stomping an edit when a poll lands.
 */
function RunSetupCard({
  detail,
  check,
  running,
  onRefresh,
  targetUrl,
  setTargetUrl,
  defaultUrl,
  readiness,
  activeTemperature,
  storedDetails,
  taskCount,
}: {
  detail: BenchRunDetail | null;
  check: BenchCheck | null;
  running: boolean;
  onRefresh: () => void;
  targetUrl: string;
  setTargetUrl: (url: string) => void;
  defaultUrl: string;
  readiness: BenchReadiness;
  activeTemperature: number | null;
  storedDetails: BenchRunDetail[];
  taskCount: number;
}) {
  const [override, setOverride] = useState<Partial<RunForm>>({});
  const tracks = check?.tracks ?? [];

  const availableLangs = tracks
    .filter((t) => t.available)
    .map((t) => t.lang)
    .join(",");

  const form: RunForm = {
    model: override.model ?? detail?.config?.model ?? "",
    langs: override.langs ?? detail?.config?.langs?.join(",") ?? availableLangs,
    attempts: override.attempts ?? detail?.config?.attempts ?? 3,
    n: override.n ?? detail?.config?.n ?? 1,
    // Temperature follows the ACTIVE model unless overridden, so bench
    // measures the model as it is actually configured rather than a value
    // copied from some earlier run.
    temperature: override.temperature ?? activeTemperature ?? 0,
  };
  const temperatureInherited =
    override.temperature === undefined && activeTemperature !== null;
  let temperatureHint = "overriding the active model";
  if (temperatureInherited)
    temperatureHint = "inherited from active model · click to override";
  else if (activeTemperature === null)
    temperatureHint = "no active model to inherit from — sent explicitly";

  const set = <K extends keyof RunForm>(key: K, value: RunForm[K]) =>
    setOverride((o) => ({ ...o, [key]: value }));

  const post = (path: string, body?: unknown) => {
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
      .then(() => setTimeout(onRefresh, 900))
      // A failed control action must not take the page down with it.
      .catch(() => setTimeout(onRefresh, 900));
  };

  // Started from the form's own values against the CURRENTLY configured url
  // — not the url an older run happened to use, which is how a stale mock
  // target outlives the run that introduced it. temperature is always sent:
  // the backend refuses a missing one because bench.py would fall back to
  // greedy silently.
  const startRun = () =>
    post("/api/bench/start", {
      model: form.model || undefined,
      langs: form.langs || undefined,
      attempts: form.attempts,
      n: form.n,
      temperature: form.temperature,
      url: targetUrl,
    });

  const greedy = greedyInterlock(form.n, form.temperature);
  const estimate = estimatedRunSeconds(storedDetails, taskCount * form.n);
  const blockedReason = startDisabledReason({
    running,
    serverReady: readiness.ready,
    serverReason: readiness.reason,
    haveFlags: true,
  });

  return (
    <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
      <CardHeader
        compact
        icon={<SlidersHorizontal size={13} />}
        title="Run Setup"
        titleAccentBar
        right={<CornerIndex n="04" />}
      />
      <div style={{ padding: "10px 15px 13px", minWidth: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 10px",
          }}
        >
          <Field label="Model" hint="defaults to the selected run's model">
            <input
              data-testid="bench-field-model"
              style={FIELD_INPUT}
              value={form.model}
              spellCheck={false}
              placeholder="auto-detect from the server"
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>

          <Field
            label="URL"
            hint={
              isNonDefaultTarget(targetUrl, defaultUrl)
                ? "not the configured llama-server"
                : "defaults to the configured llama-server"
            }
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                data-testid="bench-url-field"
                style={{
                  ...FIELD_INPUT,
                  borderColor: readiness.ready
                    ? "var(--border-color)"
                    : "color-mix(in srgb, var(--warning) 45%, transparent)",
                }}
                value={targetUrl}
                spellCheck={false}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
              {isNonDefaultTarget(targetUrl, defaultUrl) && (
                <TargetBadge url={targetUrl} />
              )}
            </div>
          </Field>

          <Field
            label="Languages"
            hint={
              tracks.some((t) => !t.available)
                ? `${tracks
                    .filter((t) => !t.available)
                    .map((t) => t.lang)
                    .join(", ")}: toolchain missing`
                : "comma-separated subset"
            }
          >
            <input
              data-testid="bench-field-langs"
              style={FIELD_INPUT}
              value={form.langs}
              spellCheck={false}
              onChange={(e) => set("langs", e.target.value)}
            />
          </Field>

          <Field label="Attempts">
            <input
              data-testid="bench-field-attempts"
              type="number"
              min={1}
              style={FIELD_INPUT}
              value={form.attempts}
              onChange={(e) => set("attempts", Number(e.target.value))}
            />
          </Field>

          <Field label="Samples --n">
            <input
              data-testid="bench-field-n"
              type="number"
              min={1}
              style={FIELD_INPUT}
              value={form.n}
              onChange={(e) => set("n", Number(e.target.value))}
            />
          </Field>

          <Field
            label="Temperature"
            hintAccent={temperatureInherited}
            hint={temperatureHint}
          >
            <input
              data-testid="bench-field-temperature"
              type="number"
              step="0.05"
              min={0}
              title="Defaults to the active model's own sampling temperature, so bench measures it as configured. Override only to test a different setting than the one running."
              style={{
                ...FIELD_INPUT,
                borderStyle: temperatureInherited ? "dashed" : "solid",
                color: temperatureInherited
                  ? "var(--text-secondary)"
                  : "var(--text-primary)",
              }}
              value={form.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
            />
          </Field>
        </div>

        {greedy && (
          <div
            data-testid="bench-greedy-warning"
            style={{
              font: "11px Inter, system-ui, sans-serif",
              color: "var(--warning)",
              marginTop: 8,
            }}
          >
            Temperature 0 with --n {form.n}: greedy decoding makes every sample
            identical — {form.n} times the wait for one sample of information.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <span style={LABEL_STYLE}>Toolchains</span>
          {tracks.map((t) => (
            <span
              key={t.lang}
              data-testid={`bench-track-${t.lang}`}
              title={
                t.available
                  ? `${t.lang}: ${t.tasks} tasks available`
                  : `${t.lang} unavailable — ${t.tasks} tasks skipped. ${t.reason}`
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                font: `10.5px ${MONO}`,
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "2px 8px",
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  color: t.available ? "var(--success)" : "var(--danger)",
                }}
              >
                ●
              </span>
              {t.lang}
              {t.available ? "" : ` · ${t.tasks} skipped`}
            </span>
          ))}
        </div>

        <div
          style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}
        >
          <ActionButton
            label="Start run"
            tone="primary"
            disabled={blockedReason !== null}
            onClick={startRun}
            title={
              blockedReason ??
              `Spawn bench.py with the flags above, against ${targetUrl}.`
            }
          />
          <ActionButton
            label="Skip task"
            disabled={!running}
            onClick={() => post("/api/bench/skip")}
            title="Writes a skip marker in the run folder. It is read between attempts and at each task boundary, then deleted, so it fires exactly once against the running task."
          />
          <ActionButton
            label="Stop run"
            tone="danger"
            disabled={!running}
            onClick={() => post("/api/bench/stop")}
            title="Stop is SIGTERM — bench.py unwinds like Ctrl-C, results.json is saved and the run stays resumable. Never SIGKILL."
          />
          <ActionButton
            label="Re-check"
            onClick={onRefresh}
            title="Re-probe the target server, re-run bench.py --check and reload the stored runs."
          />
          <span
            data-testid="bench-est-duration"
            title="Mean seconds per graded sample across stored runs, times the samples this configuration would run. Server samples are excluded — they cost no model time."
            style={{
              marginLeft: "auto",
              alignSelf: "center",
              font: "11px Inter, system-ui, sans-serif",
              color: "var(--text-muted)",
            }}
          >
            {estimate === null
              ? "est. — (no history yet)"
              : `est. ${fmtUptime(estimate)}`}
          </span>
        </div>

        {blockedReason && !running && (
          <div
            data-testid="bench-start-blocked"
            style={{
              font: "11px Inter, system-ui, sans-serif",
              color: "var(--warning)",
              marginTop: 6,
            }}
          >
            {blockedReason}
            {!readiness.ready && (
              <>
                {" "}
                Start a model on the llama.cpp page, or point --url at a
                mockserver.
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function BenchPage() {
  const bench = useBenchData();
  const { detail, check, runs, storedDetails } = bench;
  const { addAlert } = useAlertsContext();
  // Same source as the llama.cpp page's Sampling tile, so Run Setup's
  // temperature follows the model that is actually loaded.
  const { aiCurrentMetrics } = useMetricsContext();
  const activeTemperature = aiCurrentMetrics?.temperature ?? null;
  const [now, setNow] = useState(() => Date.now());

  const records = useMemo(() => detail?.records ?? [], [detail]);
  // Either source proves a run is live: the spawned child, or a results.json
  // that still carries a non-empty `live` (a CLI-started run).
  const running = isRunning(detail) || bench.current.running;
  const live = detail?.live ?? {};
  const truncation = useMemo(() => truncationState(records), [records]);

  // The heartbeat is only meaningful against the current clock, so staleness
  // is re-evaluated on a timer even when no new sample has landed.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [running]);

  const donePct = computeDonePct(live, detail);
  const median = useMemo(
    () =>
      live.current_task
        ? historicalTaskMedian(storedDetails, live.current_task)
        : null,
    [storedDetails, live.current_task],
  );

  // A multi-hour run nobody is watching is the point of this page, so the end
  // of a run rings the header bell exactly once.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail || running) return;
    if (announcedRef.current === detail.run_id) return;
    announcedRef.current = detail.run_id;
    const samples = detail.summary?.samples ?? 0;
    const models = detail.models.join(", ");
    const message =
      samples === 0
        ? `Bench run ${detail.run_id} ended without recording a sample`
        : `Bench run finished — ${models}, ${samples} samples`;
    addAlert(
      samples === 0 ? AlertSeverity.Error : AlertSeverity.Info,
      "bench",
      message,
    );
  }, [detail, running, addAlert]);

  return (
    <main
      className="bench-page"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          padding: "11px 13px",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "12fr 8fr 10fr",
            gap: 9,
            flexShrink: 0,
          }}
        >
          <PanelErrorBoundary panelName="Bench Run">
            <HeroCard
              detail={detail}
              check={check}
              runs={runs}
              live={live}
              running={running}
              stale={isHeartbeatStale(live.heartbeat, now)}
              beatAge={heartbeatAgeMs(live.heartbeat, now)}
              truncationWarned={truncation.warned}
              current={bench.current}
              defaultUrl={bench.defaultUrl}
              targetUrl={bench.targetUrl}
              taskList={bench.taskList}
            />
          </PanelErrorBoundary>

          <PanelErrorBoundary panelName="Bench Score">
            <ScoreCard detail={detail} />
          </PanelErrorBoundary>

          <PanelErrorBoundary panelName="Bench Progress">
            <ProgressCard
              detail={detail}
              live={live}
              running={running}
              donePct={donePct}
              median={median}
            />
          </PanelErrorBoundary>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(250px, 390px) minmax(0, 1fr)",
            gap: 9,
            flex: 1,
            minHeight: 0,
            alignItems: "stretch",
          }}
        >
          {/* Flex children default to min-height:auto ("at least as tall as
              my content"), which is the opposite of "shrink and scroll
              yourself". Every link in this chain needs min-height:0 or the
              page grows past the viewport again the next time a card is
              added here. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              minWidth: 0,
              minHeight: 0,
              overflow: "auto",
            }}
          >
            <PanelErrorBoundary panelName="Bench Run Setup">
              <RunSetupCard
                detail={detail}
                check={check}
                running={running}
                onRefresh={bench.refresh}
                targetUrl={bench.targetUrl}
                setTargetUrl={bench.setTargetUrl}
                defaultUrl={bench.defaultUrl}
                readiness={bench.readiness}
                activeTemperature={activeTemperature}
                storedDetails={storedDetails}
                taskCount={
                  check?.tracks
                    .filter((t) => t.available)
                    .reduce((a, t) => a + t.tasks, 0) ?? 0
                }
              />
            </PanelErrorBoundary>
          </div>

          <PanelErrorBoundary panelName="Bench Tasks and Runs">
            <TasksAndRuns bench={bench} now={now} running={running} />
          </PanelErrorBoundary>
        </div>
      </div>
      <BenchFooter detail={detail} />
    </main>
  );
}
