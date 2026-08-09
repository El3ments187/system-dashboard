/**
 * Pure derivations for the Bench page.
 *
 * Everything here is a function of results.json and nothing else, so the
 * semantics that are easy to get wrong — server exclusion, task-weighted
 * averaging, warn-once truncation — can be unit-tested without rendering.
 *
 * The one rule that runs through all of it: a `server` record means the
 * endpoint never answered. It is excluded from every rate and never
 * rendered as a zero.
 */
import type {
  BenchConfig,
  BenchRecord,
  BenchRunDetail,
  BenchRunRow,
  CellState,
} from "./types";

/** Samples that actually reached the model and can carry a verdict. */
export function gradedRecords(records: BenchRecord[]): BenchRecord[] {
  return records.filter((r) => r.status !== "server");
}

/**
 * One strip square. Opacity encodes the point loss on a retry, so
 * solved-first-try and solved-on-retry are separate states.
 */
export function cellState(record: BenchRecord): CellState {
  if (record.status === "server") return "server";
  if (record.solved) return record.first_try ? "solved" : "solved-late";
  if (record.status === "timeout" || record.status === "format")
    return "timeout";
  return "miss";
}

/**
 * Mean points for one task across its samples.
 *
 * Server samples are excluded. A task with nothing graded returns null —
 * NOT 0, which would be a verdict the run never reached.
 */
export function taskMean(records: BenchRecord[]): number | null {
  const graded = gradedRecords(records);
  if (graded.length === 0) return null;
  return graded.reduce((sum, r) => sum + r.points, 0) / graded.length;
}

export function groupByTask(
  records: BenchRecord[],
): Map<string, BenchRecord[]> {
  const out = new Map<string, BenchRecord[]>();
  for (const r of records) {
    const list = out.get(r.task);
    if (list) list.push(r);
    else out.set(r.task, [r]);
  }
  return out;
}

/**
 * The ranking number: mean over TASKS of each task's mean over samples.
 *
 * Task-weighted on purpose. `summary.mean_points` is sample-weighted and
 * diverges as soon as sample counts are unbalanced (a mid-run skip, a
 * stopped sweep), which is exactly when the two must not be confused.
 */
export function runTaskAvg(records: BenchRecord[]): number | null {
  const means: number[] = [];
  for (const [, rs] of groupByTask(records)) {
    const m = taskMean(rs);
    if (m !== null) means.push(m);
  }
  if (means.length === 0) return null;
  return means.reduce((a, b) => a + b, 0) / means.length;
}

/** Solved in at least one graded sample — the unit history diffs on. */
export function solvedInAtLeastOne(
  records: BenchRecord[],
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const [task, rs] of groupByTask(records)) {
    const graded = gradedRecords(rs);
    if (graded.length === 0) continue;
    out.set(
      task,
      graded.some((r) => r.solved),
    );
  }
  return out;
}

export interface FlakyResult {
  /** Tasks solved in ≥1 sample but not all of them. */
  tasks: string[];
  /** Tasks solved in every graded sample. */
  solidCount: number;
  /** Tasks solved in ≥1 sample. */
  solvedCount: number;
  detail: Array<{ task: string; solved: number; of: number }>;
}

/**
 * Flaky = solved sometimes but not always: the trust question `--n` exists
 * to answer. Reported as named exceptions rather than a bare count.
 */
export function flakyTasks(records: BenchRecord[]): FlakyResult {
  const detail: FlakyResult["detail"] = [];
  const tasks: string[] = [];
  let solidCount = 0;
  let solvedCount = 0;
  for (const [task, rs] of groupByTask(records)) {
    const graded = gradedRecords(rs);
    if (graded.length === 0) continue;
    const solved = graded.filter((r) => r.solved).length;
    if (solved === 0) continue;
    solvedCount += 1;
    if (solved === graded.length) {
      solidCount += 1;
    } else {
      tasks.push(task);
      detail.push({ task, solved, of: graded.length });
    }
  }
  return { tasks, solidCount, solvedCount, detail };
}

export interface TruncationState {
  /**
   * True once three consecutive truncated replies have occurred. Stays true
   * for the rest of the run: bench.py warns ONCE and keeps going, so a later
   * clean sample does not mean the budget stopped distorting the results.
   */
  warned: boolean;
  /** Index of the record that completed the first three-in-a-row. */
  triggerIndex: number | null;
  /** The streak as it stands at the end of the record list. */
  currentStreak: number;
}

/**
 * Derive the repeated-truncation warning from the ordered records.
 *
 * This is NOT an abort: `_warn_repeated_truncation` prints once and the run
 * continues. It never reaches `live`, so the page has to derive it. Record
 * order is execution order (bench.py appends as it goes), which is the
 * assumption this function rests on.
 */
export function truncationState(records: BenchRecord[]): TruncationState {
  let streak = 0;
  let warned = false;
  let triggerIndex: number | null = null;
  records.forEach((r, i) => {
    if (r.truncated) {
      streak += 1;
      if (streak >= 3 && !warned) {
        warned = true;
        triggerIndex = i;
      }
    } else {
      streak = 0;
    }
  });
  return { warned, triggerIndex, currentStreak: streak };
}

/** Samples at or after the trigger are measuring the cap, not the model. */
export function isBudgetTainted(
  index: number,
  state: TruncationState,
): boolean {
  return state.triggerIndex !== null && index >= state.triggerIndex;
}

export interface RegressionChips {
  up: string[];
  down: string[];
  /** False when the two runs are not a legitimate comparison. */
  comparable: boolean;
  reason?: string;
}

/**
 * Solved→unsolved flips between two runs, and only where that means
 * something: the same model list inside one suite edition. Across editions
 * the benchmark itself changed, so a flip would be reported as a model
 * change, confidently and wrongly.
 */
export function regressionChips(
  previous: { models: string[]; suite_hash: string; records: BenchRecord[] },
  next: { models: string[]; suite_hash: string; records: BenchRecord[] },
): RegressionChips {
  const sameModels =
    previous.models.length === next.models.length &&
    previous.models.every((m, i) => m === next.models[i]);
  if (!sameModels)
    return {
      up: [],
      down: [],
      comparable: false,
      reason: "different model list",
    };
  if (previous.suite_hash !== next.suite_hash)
    return {
      up: [],
      down: [],
      comparable: false,
      reason: "different suite edition",
    };
  const before = solvedInAtLeastOne(previous.records);
  const after = solvedInAtLeastOne(next.records);
  const up: string[] = [];
  const down: string[] = [];
  for (const [task, solvedNow] of after) {
    const solvedBefore = before.get(task);
    if (solvedBefore === undefined) continue;
    if (solvedNow && !solvedBefore) up.push(task);
    if (!solvedNow && solvedBefore) down.push(task);
  }
  return { up, down, comparable: true };
}

export interface EditionGroup {
  suiteHash: string;
  runs: BenchRunRow[];
}

/**
 * History is grouped by edition, newest first, so the cut line can be drawn
 * between groups. Scores either side of it measure different benchmarks.
 */
export function groupByEdition(runs: BenchRunRow[]): EditionGroup[] {
  const sorted = [...runs].sort((a, b) => b.created.localeCompare(a.created));
  const groups: EditionGroup[] = [];
  for (const run of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.suiteHash === run.suite_hash) last.runs.push(run);
    else groups.push({ suiteHash: run.suite_hash, runs: [run] });
  }
  return groups;
}

/** Provenance is a rule, not decoration: every averaged figure says its --n. */
export function sampleLabel(config: BenchConfig | null): string {
  const n = config?.n ?? 1;
  return n > 1 ? `x̄ over --n ${n}` : "--n 1";
}

export interface CompareEligibility {
  eligible: boolean;
  /** Shown to the user verbatim. Mismatches are refused, never normalized. */
  message?: string;
}

/**
 * Points are denominated in attempts, so runs with different `--attempts`
 * are not on the same scale, and runs from different editions are not the
 * same benchmark. Both are refused rather than silently normalized.
 */
export function compareEligibility(runs: BenchRunRow[]): CompareEligibility {
  if (runs.length < 2)
    return { eligible: false, message: "Select at least two runs to compare." };
  const editions = new Set(runs.map((r) => r.suite_hash));
  if (editions.size > 1)
    return {
      eligible: false,
      message: `Refused: these runs span ${editions.size} suite editions (${[...editions].join(", ")}). Cross-edition scores are not comparable — the benchmark itself changed.`,
    };
  const attempts = new Set(runs.map((r) => r.config?.attempts ?? 0));
  if (attempts.size > 1)
    return {
      eligible: false,
      message: `Refused: --attempts differs across these runs (${[...attempts].join(", ")}). Points are denominated in attempts, so these are not the same scale.`,
    };
  return { eligible: true };
}

/** Δ = max − min of the per-run task means; the tasks that discriminate. */
export function deltaSpread(means: Array<number | null>): number | null {
  const present = means.filter((m): m is number => m !== null);
  if (present.length < 2) return null;
  return Math.max(...present) - Math.min(...present);
}

export interface CompareRow {
  task: string;
  means: Array<number | null>;
  cells: CellState[][];
  delta: number | null;
}

/** Default sort is Δ descending: disagreement first. */
export function compareRows(details: BenchRunDetail[]): CompareRow[] {
  const tasks = new Set<string>();
  for (const d of details) for (const r of d.records) tasks.add(r.task);
  const rows: CompareRow[] = [];
  for (const task of tasks) {
    const means: Array<number | null> = [];
    const cells: CellState[][] = [];
    for (const d of details) {
      const rs = d.records
        .filter((r) => r.task === task)
        .sort((a, b) => a.sample - b.sample);
      means.push(taskMean(rs));
      cells.push(rs.map(cellState));
    }
    rows.push({ task, means, cells, delta: deltaSpread(means) });
  }
  rows.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1));
  return rows;
}

export interface LeadRow {
  assertion: string;
  task: string;
  /** How many distinct models failed this assertion on attempt 1. */
  models: number;
  totalModels: number;
}

/**
 * Assertions that fail COLD (on attempt 1) across models. One run cannot
 * tell a genuinely discriminating test from a defective prompt, so this is
 * a lead list, not a leaderboard.
 *
 * Restricted to the current edition: a `first_failed` from another edition
 * may refer to a prompt that has since been corrected.
 */
export function leadsFromRuns(
  details: BenchRunDetail[],
  currentEdition: string,
): LeadRow[] {
  const inEdition = details.filter((d) => d.suite_hash === currentEdition);
  const modelsSeen = new Set<string>();
  const byAssertion = new Map<string, { task: string; models: Set<string> }>();
  for (const d of inEdition) {
    const model = d.models.join(", ");
    modelsSeen.add(model);
    for (const r of d.records) {
      if (r.status === "server") continue;
      for (const assertion of r.first_failed ?? []) {
        const key = `${r.task}\u0000${assertion}`;
        const entry = byAssertion.get(key);
        if (entry) entry.models.add(model);
        else byAssertion.set(key, { task: r.task, models: new Set([model]) });
      }
    }
  }
  const rows: LeadRow[] = [];
  for (const [key, { task, models }] of byAssertion) {
    rows.push({
      assertion: key.split("\u0000")[1],
      task,
      models: models.size,
      totalModels: modelsSeen.size,
    });
  }
  rows.sort((a, b) => b.models - a.models || a.task.localeCompare(b.task));
  return rows;
}

/** Heartbeat older than this means the run is not reporting health. */
export const STALE_HEARTBEAT_MS = 90_000;

export function heartbeatAgeMs(
  heartbeat: string | undefined,
  now: number,
): number | null {
  if (!heartbeat) return null;
  const t = Date.parse(heartbeat);
  if (Number.isNaN(t)) return null;
  return now - t;
}

/**
 * Stale is about the heartbeat, not the clock: `heartbeat` refreshes when a
 * sample is saved, so it cannot report health the run does not have. Elapsed
 * time alone proves nothing — some tasks legitimately take over an hour.
 */
export function isHeartbeatStale(
  heartbeat: string | undefined,
  now: number,
): boolean {
  const age = heartbeatAgeMs(heartbeat, now);
  return age !== null && age > STALE_HEARTBEAT_MS;
}

/** Median seconds for a task across stored runs — the pacing comparison. */
export function historicalTaskMedian(
  details: BenchRunDetail[],
  task: string,
): number | null {
  const values = details
    .flatMap((d) => d.records)
    .filter((r) => r.task === task && r.status !== "server")
    .map((r) => r.seconds)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Greedy decoding makes every sample identical, so `--n > 1` at temperature
 * 0 buys N times the wait for one sample of information. This must be shown
 * BEFORE the user commits, which is why it is not a tooltip.
 */
export function greedyInterlock(
  n: number | undefined,
  temperature: number | undefined,
): boolean {
  return (n ?? 1) > 1 && (temperature ?? 0) === 0;
}

export interface RunNaming {
  /** What the run is called — the label when one was given. */
  name: string;
  /**
   * The real model, present ONLY when a label is masking it. `--label`
   * REPLACES the model in `models[]`, so a labelled run otherwise displays a
   * name that says nothing about what was actually benchmarked.
   */
  model: string | null;
}

export function runNaming(
  models: string[],
  config: BenchConfig | null | undefined,
): RunNaming {
  const name = models.join(", ");
  const actual = config?.model?.trim();
  // No label, or a label that matches the model: one name, as before.
  if (!actual || actual === name) return { name, model: null };
  return { name, model: actual };
}

/** Server samples are counted, but only so they can be shown as excluded. */
export function serverExcludedCount(records: BenchRecord[]): number {
  return records.filter((r) => r.status === "server").length;
}

/**
 * A run whose assertion count disagrees with the suite's declared count is
 * suite drift, not a model result — a first-class error, not a footnote.
 */
export function assertionCanary(record: BenchRecord): {
  ok: boolean;
  ran: number;
  expected: number;
} {
  return {
    ok: record.tests_total === record.tests_expected,
    ran: record.tests_total,
    expected: record.tests_expected,
  };
}
