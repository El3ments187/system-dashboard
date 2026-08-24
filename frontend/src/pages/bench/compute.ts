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
  BenchAttempt,
  BenchConfig,
  BenchLive,
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
  if (record.status === "timeout") return "timeout";
  if (record.status === "format") return "format";
  // `error` is the code never running — a crash, or a missing export. `fail`
  // is code that ran and got answers wrong. Different problems, different
  // fixes; the first real run was 12 of the former and 10 of the latter.
  if (record.status === "error") return "error";
  return "miss";
}

/**
 * Maps a single per-attempt log entry (bench.py STATUSES) to a CellState.
 *
 * Extracted from the inline T222 branch so the mapping can be unit-tested
 * without rendering. The switch covers every member of BenchAttempt["status"];
 * the default branch is a compile-time exhaustiveness check — adding a new
 * status to BenchAttempt without handling it here is a type error, not a
 * silent blank cell.
 */
export function attemptStatusToCell(att: {
  attempt: number;
  status: BenchAttempt["status"];
}): CellState {
  switch (att.status) {
    case "pass":    return att.attempt === 1 ? "solved" : "solved-late";
    case "fail":    return "miss";
    case "error":   return "error";
    case "timeout": return "timeout";
    case "format":  return "format";
    case "server":  return "server";
    default: {
      const _exhaustive: never = att.status;
      void _exhaustive;
      // Runtime fallback: render a visible cell rather than blank if bench.py
      // gains a new status before the frontend is updated.
      return "error";
    }
  }
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
function solvedInAtLeastOne(
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
  /**
   * How many samples bench.py cut off ITSELF, at `--nudge-at` tokens.
   *
   * A DIFFERENT mechanism from `truncated`, not a second name for it:
   * `truncated` is the server reporting finish_reason "length" (capped by
   * --max-tokens or its own context), while `stopped_at_budget` is bench
   * giving up on reading further from a reply the server was still happy to
   * continue. Raising --max-tokens does nothing for this one.
   *
   * No three-in-a-row rule here, deliberately. That rule mirrors bench.py's
   * own warn-once-on-three-consecutive for truncation; nothing upstream
   * applies it to the budget cutoff, and the first real run put its three
   * hits at records 3, 9 and 17 — a streak rule would have stayed silent
   * through all of them. Every cut-off sample scored the budget, not the
   * model, so each one counts.
   */
  budgetStops: number;
  /** Index of the first budget cutoff, for marking samples from there on. */
  budgetTriggerIndex: number | null;
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
  let budgetStops = 0;
  let budgetTriggerIndex: number | null = null;
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
    if (r.stopped_at_budget) {
      budgetStops += 1;
      if (budgetTriggerIndex === null) budgetTriggerIndex = i;
    }
  });
  return {
    warned,
    triggerIndex,
    currentStreak: streak,
    budgetStops,
    budgetTriggerIndex,
  };
}

/**
 * Which cutoff a sample's score is measuring, if any.
 *
 * Two different mechanisms with two different remedies, and they were both
 * being labelled BUDGET:
 *   - `budget` — bench.py's OWN client-side stop at `--nudge-at`. Raising
 *     `--max-tokens` does nothing for it; `--nudge-at`/`--max-nudges` is the
 *     remedy.
 *   - `truncation` — the SERVER cutting the reply short
 *     (`finish_reason: "length"`) three times running. `--max-tokens` is the
 *     remedy; `--nudge-at` is not.
 *
 * A reader shown BUDGET on a truncation-tainted sample reaches for the wrong
 * flag, and the banner above the table tells them to.
 *
 * Taint is contagious forward by design: from the first trigger on, every
 * sample is scored under that cap. Budget takes precedence when both are in
 * play, because it stops generation outright.
 */
export type TaintKind = "budget" | "truncation" | null;

export function taintKind(index: number, state: TruncationState): TaintKind {
  if (state.budgetTriggerIndex !== null && index >= state.budgetTriggerIndex)
    return "budget";
  if (state.triggerIndex !== null && index >= state.triggerIndex)
    return "truncation";
  return null;
}

/** The kind for a whole task row, which holds several samples. */
export function rowTaint(indexes: number[], state: TruncationState): TaintKind {
  let sawTruncation = false;
  for (const i of indexes) {
    const kind = taintKind(i, state);
    if (kind === "budget") return "budget";
    if (kind === "truncation") sawTruncation = true;
  }
  return sawTruncation ? "truncation" : null;
}

/**
 * Whether a budget-tainted task row warrants the stronger tooltip.
 *
 * The weak tooltip ("scored full marks") applies only when the cap was in
 * effect but left no measurable trace: every sample solved, all expected
 * assertions ran, and nothing was cut mid-block.  Any of the three
 * conditions below means the cap likely harmed the score.
 *
 * `cut_mid_block` accumulates across attempts (bench.py:1691-1692), so it
 * means *an* attempt was cut, not necessarily the final one.
 */
export function budgetHarmed(
  tainted: TaintKind,
  graded: BenchRecord[],
): boolean {
  return (
    tainted === "budget" &&
    (graded.some((r) => !r.solved) ||
      graded.some((r) => r.tests_total < r.tests_expected) ||
      graded.some((r) => r.cut_mid_block))
  );
}

export interface FailureExplanation {
  /** Null when the assertion list already tells the story. */
  reason: string | null;
  /** Assertions that never executed. bench.py: expected − passed − failed. */
  unreached: number;
  /** The flag that actually helps, for the mode that actually happened. */
  remedy: string | null;
  /**
   * Derived from the STICKY flags, so it is phrased as history. bench.py
   * accumulates `stopped_at_budget`/`truncated` across attempts
   * (`bench.py:1691-1692`), deliberately: taking the last attempt's value
   * made a run report 2 stopped replies when 9 had been stopped. So the flag
   * means "some attempt was cut off", never "this result was".
   */
  history: string | null;
}

/**
 * Why a sample scored nothing, when the assertion list cannot say.
 *
 * `first_failed` is bench.py's `fail_labels()`, which excludes "the test
 * stopped before finishing" — so a sample that was cut off has NO failed
 * assertions, correctly, and the panel fell through to a head-window excerpt
 * of the log. Test runners print passes first, so that excerpt showed twelve
 * PASS lines under the heading "why it failed".
 *
 * The mode names mirror bench.py's own `explain()` (`:556`) and
 * `_failure_headline()` (`:621`) rather than inventing a third vocabulary.
 */
export function failureExplanation(
  r: BenchRecord,
  timeoutSeconds?: number,
): FailureExplanation {
  const expected = r.tests_expected || r.tests_total || 0;
  // A `server` sample never reached the model, so "0/35 passed" would read as
  // a score for work that never started.
  const unreached =
    r.status === "server"
      ? 0
      : Math.max(0, expected - (r.tests_passed ?? 0) - (r.tests_failed ?? 0));

  const hasLabels = (r.first_failed ?? []).length > 0;
  if (hasLabels || r.status === "pass")
    return { reason: null, unreached, remedy: null, history: null };

  let reason: string;
  if (r.status === "format") {
    reason = "No fenced code block in the reply, so nothing could be tested.";
  } else if (r.status === "timeout") {
    reason = timeoutSeconds
      ? `Did not finish within ${timeoutSeconds}s, usually an endless loop.`
      : "Did not finish in time, usually an endless loop.";
  } else if (r.status === "server") {
    reason = "Could not reach the model.";
  } else if (r.status === "error") {
    reason = (r.detail ?? "").trimStart().startsWith("compile:")
      ? "Did not compile, so the tests never ran."
      : "Crashed before the tests finished.";
  } else {
    reason = "Compiled and ran, but some tests failed.";
  }

  // The remedies are not interchangeable, which is the whole point: raising
  // --max-tokens does nothing for a bench.py budget stop.
  let remedy: string | null = null;
  let history: string | null = null;
  if (r.stopped_at_budget && r.cut_mid_block) {
    // bench.py:2669 — `cut_mid_block` accumulates `aborted_mid_block`
    // (`:1691`), which is set ONLY when the cut landed inside an unclosed
    // block (`:1508`). More room buys more of the same.
    history =
      "An attempt was cut at the --nudge-at budget while still inside an unclosed code block (the flag is set if any attempt was, not only the last).";
    remedy =
      "That is the model never finishing the block, not the budget being too small — raising it will not help.";
  } else if (r.stopped_at_budget) {
    // bench.py:2652 and its comment at :2644 — "Not a failure: the answer
    // was complete before the cut, so the score stands." What the stop cost
    // was the chance to REVISE, not the answer. Reporting it as a
    // truncation, next to a crash, argued the cut caused the failure.
    history =
      "An attempt was stopped at the --nudge-at budget while holding a complete code block, so no answer was lost mid-write — the code in it may simply have been wrong (the flag is set if any attempt was, not only the last).";
    remedy =
      "Raise --nudge-at only to give the model room to revise; --max-tokens does not affect this.";
  } else if (r.truncated) {
    history =
      "An attempt hit the server's token limit (the flag is set if any attempt did, not only the last).";
    remedy = "Raise --max-tokens.";
  }

  return { reason, unreached, remedy, history };
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
type ChipRun = {
  models: string[];
  suite_hash: string;
  records: BenchRecord[];
  config?: { model?: string };
};

function sameModelIdentity(a: ChipRun, b: ChipRun): boolean {
  const am = a.config?.model;
  const bm = b.config?.model;
  // config.model is the ground truth; models[] may be overridden by --label.
  if (am && bm) return am === bm;
  const sa = [...a.models].sort();
  const sb = [...b.models].sort();
  return sa.length === sb.length && sa.every((m, i) => m === sb[i]);
}

export function regressionChips(previous: ChipRun, next: ChipRun): RegressionChips {
  if (!sameModelIdentity(previous, next))
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
  const sorted = [...runs].sort((a, b) =>
    +(b.created > a.created) - +(b.created < a.created),
  );
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
export function compareEligibility(
  runs: BenchRunRow[],
  /**
   * Every stored run, not just the chosen ones. Without it this branch asked
   * for a second run even when history held exactly one — the only branch
   * that did not tell the reader what it knew, and the empty state, so the
   * one that fires most often.
   */
  population?: BenchRunRow[],
): CompareEligibility {
  if (runs.length < 2) {
    const total = population?.length ?? null;
    if (total !== null && total < 2)
      return {
        eligible: false,
        message:
          total === 0
            ? "No stored runs yet — Compare needs two, so run the benchmark twice."
            : "Only one stored run — Compare needs two, so there is nothing to compare it with yet.",
      };
    return { eligible: false, message: "Select at least two runs to compare." };
  }
  const editions = new Set(runs.map((r) => r.suite_hash));
  if (editions.size > 1)
    return {
      eligible: false,
      message: `Refused: these runs span ${editions.size} suite editions (${[...editions].join(", ")}). Cross-edition scores are not comparable — the benchmark itself changed.`,
    };
  const attempts = new Set(runs.map((r) => r.config?.attempts ?? 0));
  if (attempts.size > 1) {
    // Same `aN` notation the dropdown and the column header use.
    const listed = [...attempts].map((a) => `a${a}`).join(", ");
    return {
      eligible: false,
      message: `Refused: --attempts differs across these runs (${listed}). Points are denominated in attempts, so these are not the same scale.`,
    };
  }
  return { eligible: true };
}

/**
 * Condenses partial-coverage tasks for the banner.
 * Languages with ≥2 partial tasks fold to "all N lang"; single-task
 * languages are listed individually.
 */
export function groupCoverage(partial: string[]): string {
  const byLang = new Map<string, string[]>();
  for (const task of partial) {
    const lang = task.split("/")[0];
    const list = byLang.get(lang);
    if (list) list.push(task);
    else byLang.set(lang, [task]);
  }
  const parts: string[] = [];
  for (const [lang, tasks] of byLang) {
    if (tasks.length >= 2) parts.push(`all ${tasks.length} ${lang}`);
    else parts.push(tasks[0]);
  }
  return parts.join(", ");
}

/**
 * bench.py's execution order for the standard tracks, used to sort
 * `by_language` keys into the same order the page uses everywhere else.
 * Unknown languages sort after these, alphabetically.
 */
const LANG_ORDER = ["js", "ts", "java", "gdscript"];

export function sortByLangOrder(langs: string[], order?: string[]): string[] {
  const effectiveOrder = order ?? LANG_ORDER;
  return [...langs].sort((a, b) => {
    const ai = effectiveOrder.indexOf(a);
    const bi = effectiveOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * bench.py writes `datetime.now().isoformat(timespec="seconds")` — local time
 * with no timezone offset. `new Date(s).toISOString()` converts that to UTC,
 * so the displayed hour is wrong in any non-UTC timezone. Slice the original
 * string instead; both helpers share this invariant.
 */
export function benchLocalTime(isoLocal: string): string {
  return isoLocal.slice(11, 19);
}

export function benchLocalDate(isoLocal: string): string {
  return isoLocal.slice(0, 10);
}

/**
 * localbench's own defaults, read from bench.py's argparse table in
 * `2026.08.13-157` and verified against the checkout:
 *
 *   --attempts 3 (:3271) · -n/--n 1 (:3246) · --max-tokens 0 (:3282)
 *   --nudge-at 0 (:3256; -277 changed default from 32768 to 0 — 0 = nudging off)
 *   --label "" (:3355)
 *
 * Named once so four literals cannot drift from upstream independently. The
 * three fields NOT here are deliberate: the model comes from the loaded
 * server (T65 — every profile aliases to "coder", and a blank model filed a
 * 35-minute run under the wrong name), the URL from the dashboard's own
 * configuration rather than bench.py's guess, and the temperature from the
 * active model because the backend requires an explicit value (T96).
 *
 * `--langs ""` is NOT reproduced: an empty value means EVERY language to
 * bench.py (`:244`), so the dashboard's default is the languages whose
 * toolchain is actually present.
 */
export const LOCALBENCH_DEFAULTS = {
  label: "",
  attempts: 3,
  n: 1,
  maxTokens: 0,
  nudgeAt: 0,
} as const;

/**
 * One notation for how a run was sampled. Compare used to state this three
 * ways in a single view — `a3 n1` on the chips, `x̄ over --n 3` in the column
 * header, `--attempts` in the refusal — so a reader could not tell whether
 * they described the same thing. The dropdown, the header and the refusal
 * all use this.
 */
export function compareNotation(
  config: BenchConfig | null | undefined,
): string {
  return `a${config?.attempts ?? "?"} n${config?.n ?? 1}`;
}

export interface CompareSlotOption {
  runId: string;
  label: string;
  disabled: boolean;
  /** Why it cannot join the current selection. Shown, never silent. */
  reason: string | null;
}

/**
 * The options for ONE comparison slot.
 *
 * Eligibility is computed against the OTHER slots only. Judging a candidate
 * against a selection that includes itself is what produced the dead end:
 * every option went ineligible and nothing could be changed back.
 */
export function compareSlotOptions(
  candidates: BenchRunRow[],
  selected: Array<string | null>,
  slotIndex: number,
  defaultUrl: string | null | undefined,
): CompareSlotOption[] {
  const others = selected
    .filter((_, i) => i !== slotIndex)
    .map((id) => candidates.find((r) => r.run_id === id))
    .filter((r): r is BenchRunRow => Boolean(r));
  const anchor = others[0] ?? null;

  // First pass: compute core labels (date+time+model+notation) before reason suffix.
  const items = candidates.map((r) => {
    let reason: string | null = null;
    // The value this slot already holds is never judged: disabling it
    // prevents nothing (the pair exists already) and leaves the control
    // displaying its own selection as forbidden.
    if (r.run_id !== selected[slotIndex]) {
      if (others.some((o) => o.run_id === r.run_id)) {
        reason = "already in another slot";
      } else if (anchor) {
        if (r.suite_hash !== anchor.suite_hash) {
          reason = `different suite edition (${r.suite_hash})`;
        } else if (
          (r.config?.attempts ?? 0) !== (anchor.config?.attempts ?? 0)
        ) {
          reason = "different --attempts";
        }
      }
    }

    const naming = runNaming(r.models, r.config);
    const name = naming.alias
      ? `${naming.primary} (alias ${naming.alias})`
      : naming.primary;
    // Slice the stored local-time string so timezone matches benchLocalDate.
    const dateStr = r.created.slice(5, 10).replace("-", "/"); // MM/DD
    const timeStr = r.created.slice(11, 19); // HH:MM:SS
    // A <select> option cannot host the TargetBadge element, so it carries
    // the badge's own wording rather than inventing a second vocabulary.
    const mock = isNonDefaultTarget(r.config?.url, defaultUrl)
      ? " · mock / other server"
      : "";

    const core = `${dateStr} ${timeStr}  ${name}  ·  ${compareNotation(r.config)}${mock}`;
    return { r, core, reason };
  });

  // Append run-id suffix when two entries share the same core label (same-second collision).
  const coreCounts = new Map<string, number>();
  items.forEach(({ core }) => coreCounts.set(core, (coreCounts.get(core) ?? 0) + 1));

  return items.map(({ r, core, reason }) => {
    const suffix = (coreCounts.get(core) ?? 0) > 1 ? `  [${r.run_id.slice(0, 8)}]` : "";
    return {
      runId: r.run_id,
      label: `${core}${suffix}` + (reason ? `  (${reason})` : ""),
      disabled: reason !== null,
      reason,
    };
  });
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
  genMeans: Array<number | null>;
  cells: CellState[][];
  delta: number | null;
}

/** Mean generation time (seconds) across graded records for one task/run. */
function taskGenMean(rs: BenchRecord[]): number | null {
  const graded = gradedRecords(rs);
  if (graded.length === 0) return null;
  return graded.reduce((s, r) => s + r.gen_seconds, 0) / graded.length;
}

/**
 * Sorts by suite task order when provided, Δ descending otherwise.
 *
 * A null entry is a chosen run whose detail could not be read. It keeps its
 * column and scores blank — dropping the column instead would make the table
 * disagree with the selection that produced it.
 */
export function compareRows(
  details: Array<BenchRunDetail | null>,
  taskOrder?: Array<{ id: string }>,
): CompareRow[] {
  const tasks = new Set<string>();
  for (const d of details) if (d) for (const r of d.records) tasks.add(r.task);
  const rows: CompareRow[] = [];
  for (const task of tasks) {
    const means: Array<number | null> = [];
    const genMeans: Array<number | null> = [];
    const cells: CellState[][] = [];
    for (const d of details) {
      if (!d) {
        means.push(null);
        genMeans.push(null);
        cells.push([]);
        continue;
      }
      const rs = d.records
        .filter((r) => r.task === task)
        .sort((a, b) => a.sample - b.sample);
      means.push(taskMean(rs));
      genMeans.push(taskGenMean(rs));
      cells.push(rs.map(cellState));
    }
    rows.push({ task, means, genMeans, cells, delta: deltaSpread(means) });
  }
  if (taskOrder && taskOrder.length > 0) {
    const pos = new Map(taskOrder.map((t, i) => [t.id, i]));
    rows.sort((a, b) => {
      const pa = pos.get(a.task) ?? Infinity;
      const pb = pos.get(b.task) ?? Infinity;
      if (pa !== pb) return pa - pb;
      return a.task.localeCompare(b.task);
    });
  } else {
    rows.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1));
  }
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
export interface LanguageRatio {
  lang: string;
  solved: number;
  total: number;
}

/**
 * Solved samples per language, in the order they were run.
 *
 * The console has this and nothing aggregated it: on the observed run the
 * model was more than twice as weak in TypeScript as in gdscript, and no
 * surface said so. Grouped on the record's own `lang` rather than by parsing
 * task ids, so it cannot disagree with the runner that produced it.
 *
 * A language with no samples in the run is ABSENT, not zero — a zero would
 * read as "attempted and failed everything" for a track that never ran.
 */
export function languageBreakdown(records: BenchRecord[]): LanguageRatio[] {
  const byLang = new Map<string, { solved: number; total: number }>();
  for (const r of records) {
    // A server sample is the endpoint failing, not the model — the same
    // exclusion every other rate on this page makes.
    if (r.status === "server" || !r.lang) continue;
    const entry = byLang.get(r.lang) ?? { solved: 0, total: 0 };
    entry.total += 1;
    if (r.solved) entry.solved += 1;
    byLang.set(r.lang, entry);
  }
  return [...byLang.entries()].map(([lang, v]) => ({ lang, ...v }));
}

export interface LeadsCoverage {
  /**
   * Unsolved samples that contribute NOTHING to the lead list. `fail_labels`
   * (`bench.py:611`) filters out "the test stopped before finishing" as
   * `_NOT_AN_ASSERTION`, so a sample that was cut off has an empty
   * `first_failed` — nothing failed, the run was amputated. Leads iterates
   * exactly that array, so those failures are structurally invisible, and on
   * a run where most failures are cut-offs the list looks like one task is
   * uniquely broken when it is merely the one that failed by assertion.
   */
  skipped: number;
  /** Distinct models in this edition. Below two, nothing can be ranked. */
  models: number;
}

export function leadsCoverage(
  details: BenchRunDetail[],
  currentEdition: string,
): LeadsCoverage {
  const inEdition = details.filter((d) => d.suite_hash === currentEdition);
  const models = new Set<string>();
  let skipped = 0;
  for (const d of inEdition) {
    models.add(d.models.join(", "));
    for (const r of d.records) {
      // Same exclusion Leads itself makes: a server sample is the endpoint
      // failing, not the model.
      if (r.status === "server" || r.solved) continue;
      if ((r.first_failed ?? []).length === 0) skipped += 1;
    }
  }
  return { skipped, models: models.size };
}

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

/**
 * bench.py refreshes the heartbeat when a SAMPLE IS SAVED, not on a timer —
 * its docstring says so (`bench.py:1289`) and there is exactly one write, at
 * the end of a sample (`bench.py:1775`). The heartbeat's age is therefore the
 * elapsed time of the sample currently in flight, not evidence of ill health.
 *
 * A fixed threshold consequently reports every task slower than itself as
 * stuck. On this suite the median task runs ~200s, so a 90s constant fired on
 * essentially every task, while the Progress card on the same screen called
 * the same run merely "over median". The alarming surface was the wrong one.
 *
 * "Too long" is a property of the task, so the threshold scales off the same
 * historical median Progress compares against — one source, so the two cannot
 * disagree. The floor covers the no-history case, where a slow first run must
 * not be accused of being wedged.
 */
const STALE_HEARTBEAT_FLOOR_MS = 600_000;
const STALE_HEARTBEAT_MEDIAN_MULTIPLE = 3;

function staleHeartbeatThresholdMs(
  medianSeconds: number | null | undefined,
): number {
  if (
    medianSeconds === null ||
    medianSeconds === undefined ||
    medianSeconds <= 0
  )
    return STALE_HEARTBEAT_FLOOR_MS;
  return Math.max(
    STALE_HEARTBEAT_FLOOR_MS,
    medianSeconds * 1000 * STALE_HEARTBEAT_MEDIAN_MULTIPLE,
  );
}

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
  /**
   * Median seconds for the task in flight — the SAME value Progress shows as
   * "median for this task". Omitted only where no task is known, which falls
   * back to the floor.
   */
  medianSeconds?: number | null,
): boolean {
  const age = heartbeatAgeMs(heartbeat, now);
  return age !== null && age > staleHeartbeatThresholdMs(medianSeconds);
}

/** Median seconds for a task across stored runs — the pacing comparison. */
export function historicalTaskMedian(
  details: BenchRunDetail[],
  task: string,
  /** Scoped like the duration estimate: a mock median is not a real one. */
  targetUrl?: string,
  defaultUrl?: string,
): number | null {
  // Same disease the estimate had: a mock run finishes a task in ~0s, so a
  // pooled median reported "0s — over median" for every task of a real run.
  // With no same-class history this returns null, and the caller says so
  // honestly rather than showing a 0 that reads as "instant".
  const values = sameTargetClass(details, targetUrl, defaultUrl)
    .flatMap((d) => d.records)
    .filter((r) => r.task === task && r.status !== "server")
    .map((r) => r.seconds);
  // Same statistic as the run estimate, deliberately: two medians computed
  // two ways over the same records is how "over median" and the remaining
  // estimate came to disagree.
  return medianOf(values);
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
  /** The --label, when one was given and differs from the model. */
  alias: string | null;
  /** What belongs in the primary position: the real model when known. */
  primary: string;
  /** True when the alias is the only name recorded anywhere. */
  aliasIsAllWeHave: boolean;
  /** The display name — models joined, or the alias when a --label was given. */
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
  // `--label` replaces the model everywhere in results.json EXCEPT
  // config.model, so models[] is the alias whenever a label was given.
  const recorded = models.join(", ");
  const actual = config?.model?.trim();

  // No label, or one that matches the model: a single name.
  if (!actual || actual === recorded)
    return {
      name: recorded,
      model: null,
      alias: null,
      primary: recorded,
      aliasIsAllWeHave: false,
    };

  // Labelled. The REAL model leads, the alias follows and is labelled as
  // one — the same order the hero uses. Two surfaces showing these two
  // facts in opposite orders is worse than either order chosen once.
  return {
    name: recorded,
    model: actual,
    alias: recorded,
    primary: actual,
    aliasIsAllWeHave: false,
  };
}

export type BenchLogLevel = "info" | "warn" | "error";

/**
 * bench.py's stdout carries no level field, so the console derives one from
 * the line itself. Kept pure and small: the console's filters are only as
 * trustworthy as this classification, and it is the kind of rule that rots
 * silently inside a component.
 */
export function classifyBenchLine(line: string): BenchLogLevel {
  const l = line.toLowerCase();
  if (
    l.includes("stopping:") ||
    l.includes("traceback") ||
    l.includes("✗") ||
    /\berror\b/.test(l)
  )
    return "error";
  if (l.includes("!!") || l.includes("warn") || l.includes("skipped"))
    return "warn";
  return "info";
}

/**
 * Why Start is unavailable, or null when it is available.
 *
 * The two conditions compose and neither silently overrides the other: a
 * live run blocks a second start (bench refuses it anyway), and an
 * unanswering target would produce a doomed sweep that bench.py only cleans
 * up after three server errors. Returning the reason rather than a boolean
 * is what lets the UI say WHY.
 */
export function startDisabledReason(opts: {
  running: boolean;
  serverReady: boolean;
  serverReason: string;
  haveFlags: boolean;
  /** False when every language toggle is off. */
  anyLanguage?: boolean;
  /**
   * Present only when Model ID disagrees with the live server's model.
   * Omitted (undefined) when: Model ID is blank, activeModel is unknown,
   * or a --label is set (not a model claim). Undefined must never block.
   */
  modelMismatch?: { form: string; active: string };
}): string | null {
  if (opts.running)
    return "A run is active — Start enables when it finishes or is stopped";
  if (!opts.serverReady)
    // The backend composes this sentence-cased at its source.
    return opts.serverReason || "No server answering at the configured url";
  if (opts.modelMismatch !== undefined)
    return `Model ID says ${opts.modelMismatch.form}; the server has ${opts.modelMismatch.active} loaded. Runs are recorded under Model ID, so this run would be filed as ${opts.modelMismatch.form}.`;
  if (!opts.haveFlags)
    return "No previous run to take flags from — run bench.py once from the CLI first";
  // bench.py cannot be told "no languages": an empty `--langs` is an empty
  // set, which is falsy, so the filter is skipped and the FULL suite runs
  // (`bench.py:233`). Starting with nothing selected would therefore run
  // everything while the form claimed otherwise, so it is refused here.
  if (opts.anyLanguage === false)
    return "No languages selected — an empty filter would run the whole suite, so pick at least one";
  return null;
}

/**
 * The model the target server actually has loaded, named the way the
 * llama.cpp page names it (basename of the path, `.gguf` dropped, alias as
 * the fallback). Same derivation, so the two pages cannot disagree about
 * what is running.
 *
 * This is the truest answer available for a LIVE run: bench.py's `--model`
 * only states an expectation, and `--label` overwrites the recorded name
 * outright.
 */
export function activeModelName(
  modelPath: string | null | undefined,
  modelAlias: string | null | undefined,
): string | null {
  const full = modelPath || modelAlias || "";
  if (!full) return null;
  const file = full.includes("/") ? (full.split("/").pop() ?? "") : full;
  return file.replace(/\.gguf$/i, "") || null;
}

/**
 * Four states, not a boolean. The hero pill used `running ? "running" :
 * "stopped"`, which collapsed two distinctions: a completed 27/27 run and a
 * page with no run selected both read "Stopped".
 *
 * There is deliberately no "aborted" kind. `isRunning` treats any populated
 * live block as running (T35: a CLI-started run known only through
 * results.json must read as running), and bench.py empties that block on a
 * clean finish — so a run either looks live or looks finished, and the page
 * has no signal that separates "still going" from "died leaving its live
 * block behind". History draws that distinction, where a stored row can be
 * compared against the run actually in flight.
 */
export type RunStatusKind = "running" | "stalled" | "idle" | "finished";

export interface RunStatus {
  kind: RunStatusKind;
  /** Always states the state in words: colour is never the only signal. */
  label: string;
}

/**
 * The run's status in plain language.
 *
 * "Heartbeat" describes HOW the page knows something, not WHAT is happening —
 * it is polling vocabulary and means nothing outside this codebase. The
 * underlying field keeps its name everywhere it is data (results.json, the
 * data contract, the polling code); only what a person reads changes.
 *
 * Idle is grey, not red: nothing running is normal, not an error. Amber is
 * reserved for "should be progressing and isn't".
 */
export function runStatus(opts: {
  running: boolean;
  stale: boolean;
  ageMs: number | null;
  finishedSamples: number | null;
  finishedSeconds: number | null;
  fmtDuration: (s: number | null) => string;
}): RunStatus {
  if (opts.running) {
    if (opts.stale && opts.ageMs !== null)
      return {
        kind: "stalled",
        label: `No update for ${Math.round(opts.ageMs / 1000)}s — the run may be stuck`,
      };
    return {
      kind: "running",
      label:
        opts.ageMs === null
          ? "Running · waiting for the first result"
          : `Running · updated ${Math.round(opts.ageMs / 1000)}s ago`,
    };
  }
  if (opts.finishedSamples !== null && opts.finishedSamples > 0) {
    return {
      kind: "finished",
      label: `Run finished · ${opts.finishedSamples} samples in ${opts.fmtDuration(opts.finishedSeconds)}`,
    };
  }
  return { kind: "idle", label: "Not running" };
}

/**
 * What the run is actually working on, if anything.
 *
 * `live.current_task` is set when a sample STARTS (`bench.py:1808` in -129)
 * and results.json is written when that sample ENDS — a single write, at
 * `bench.py:1775`. So at save time the field names the sample that just
 * finished. Reading it as "running now" is true only in the instant after a
 * save; for the rest of each sample it names the previous one — which is how
 * a task appeared as in-flight while the table already showed its score.
 *
 * NOTHING in the live blob moves between saves. Verified against a running
 * benchmark: over 90 seconds `current_task`, `task_elapsed`, `done`,
 * `current_attempt` and `heartbeat` were all unchanged. So no surface may
 * claim live knowledge of the sample in progress — the honest statement is
 * what last completed, and the tiles derive it from here so they cannot tell
 * two different stories.
 *
 * The test is per-task completeness, not "is it the newest record": with
 * `--n 3`, a task with 1 of 3 samples saved genuinely IS still in flight.
 */
export interface OnTask {
  task: string | null;
  /** True only where the file gives positive evidence a sample is running. */
  inFlight: boolean;
  /**
   * `live.task_elapsed` — the duration of the sample the file describes. NOT
   * a running clock: verified against a live run, it held at 104.5 for 90
   * seconds while the run generated, because the whole blob is rewritten only
   * when a sample is saved.
   */
  tookSeconds: number | null;
}

export function onTaskDisplay(
  live: BenchLive,
  records: BenchRecord[],
  samplesPerTask: number,
): OnTask {
  // `||`, not `??`: an empty `current_task` means unset here, not a value.
  const task = live.current_task || null;
  const tookSeconds = live.task_elapsed ?? null;
  const last = records.length > 0 ? records[records.length - 1] : null;
  if (!task) {
    // A finished run's live block is `{}`, which blanked these tiles exactly
    // when the answer became MOST certain: the last completed task is simply
    // the final record, and its duration is recorded rather than inferred.
    return {
      task: last?.task ?? null,
      inFlight: false,
      tookSeconds: tookSeconds ?? last?.seconds ?? null,
    };
  }
  const done = records.filter((r) => r.task === task).length;
  return {
    task,
    inFlight: done < Math.max(1, samplesPerTask),
    tookSeconds,
  };
}

/**
 * The Progress card's health line, which has THREE states, not two.
 *
 * Only "healthy heartbeat" and "stale heartbeat" were ever specified, so a
 * finished run fell through to the live pacing copy and told the reader the
 * heartbeat was its only health signal — with no heartbeat and nothing
 * running. Pacing itself stays update-and-median: some tasks legitimately
 * run over an hour, so elapsed time alone proves nothing.
 */
export function healthStripText(opts: {
  running: boolean;
  /** From the one `runStatus` the page computes, not a second derivation. */
  kind: RunStatusKind;
  warming: boolean;
  median: number | null;
  taskElapsed: number | undefined;
  elapsed: number | null;
  samples: number | null;
  fmtDuration: (s: number | null) => string;
}): string {
  if (!opts.running) {
    if (opts.elapsed === null && opts.samples === null)
      return "No run selected — pick one from History to see its result.";
    const samples = opts.samples ?? 0;
    const plural = samples === 1 ? "sample" : "samples";
    // The same kind the hero pill and the status line use, so a completed run
    // cannot read "finished" in one place and "stopped" in another.
    return `Run finished — ${opts.fmtDuration(opts.elapsed)} elapsed, ${samples} ${plural} recorded. Nothing is running now.`;
  }
  if (opts.warming)
    return "Warming — bench.py writes results.json when the first sample completes, so there is no progress to pace yet.";
  if (opts.median === null)
    return "No comparable history for this task yet — progress updates are the only health signal so far";
  return "";
}

/**
 * A temperature at the Sampling tile's 2dp convention.
 *
 * llama-server reports float32, so 0.3 comes back as 0.30000001192092896.
 * Rounding here — rather than only at the point of display — keeps the value
 * shown and the value benchmarked identical.
 */
export function roundTemperature(t: number | null): number | null {
  if (t === null || !Number.isFinite(t)) return null;
  return Number(t.toFixed(2));
}

/**
 * Is this run pointed somewhere other than the configured llama-server?
 *
 * A dry run against tools/mockserver.py and a real benchmark are otherwise
 * visually identical — including in History, where seeded mock runs sit
 * looking like real scores. Kept pure so the rule is testable and can be
 * adjusted in one place.
 */
export function isNonDefaultTarget(
  url: string | null | undefined,
  defaultUrl: string | null | undefined,
): boolean {
  const a = normalizeTarget(url);
  const b = normalizeTarget(defaultUrl);
  // Unknown target, or no configured default to compare against: say
  // nothing rather than badge something that may be correct.
  if (!a || !b) return false;
  return a !== b;
}

function normalizeTarget(url: string | null | undefined): string {
  if (!url) return "";
  // Written without a regex on purpose: /\/+$/ backtracks super-linearly on
  // a pathological input, and this runs on every render that shows a badge.
  let out = url.trim().toLowerCase();
  while (out.endsWith("/")) out = out.slice(0, -1);
  if (out.endsWith("/v1")) out = out.slice(0, -3);
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/**
 * Runs whose target is the same CLASS as this one — mock or real.
 *
 * A mockserver run answers in milliseconds and a real model in minutes, so
 * any figure averaged across both describes neither. Shared by the duration
 * estimate and the pacing median so the two cannot drift apart.
 */
function sameTargetClass(
  details: BenchRunDetail[],
  targetUrl: string | undefined,
  defaultUrl: string | undefined,
): BenchRunDetail[] {
  if (targetUrl === undefined) return details;
  const wantMock = isNonDefaultTarget(targetUrl, defaultUrl ?? "");
  return details.filter(
    (d) =>
      isNonDefaultTarget(d.config?.url ?? "", defaultUrl ?? "") === wantMock,
  );
}

export function estimatedRunSeconds(
  details: BenchRunDetail[],
  plannedSamples: number,
  /** The target this estimate is for, and the default to judge it against. */
  targetUrl?: string,
  defaultUrl?: string,
  opts?: {
    remainingTasks?: string[];
    samplesPerTask?: number;
    liveRecords?: BenchRecord[];
  },
): number | null {
  // Pooling mock and real history makes the figure meaningless: the first
  // real run was estimated at 3m 17s against a history of mockserver runs
  // and took 35m 46s. Same-class runs only.
  return runEstimate(details, plannedSamples, targetUrl, defaultUrl, opts)
    .seconds;
}

/** Median of a list, or null when empty. One statistic for every surface. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export interface RunEstimate {
  seconds: number | null;
  /** "per-task" when the remaining ids were priced individually. */
  basis: "per-task" | "pooled" | "none";
  /** Distinct runs the figure rests on, the live one included. */
  runsUsed: number;
}

/**
 * What the work that REMAINS is worth, not what the work already done was.
 *
 * Three faults lived in the old one-line mean, and they compounded:
 *
 *  1. The live run's own completed samples were discarded in favour of
 *     history, though they are the best evidence of this run's pace.
 *  2. A flat mean ignores WHICH samples remain. Tasks run in ladder order
 *     (`bench.py:60`), easy first, and gdscript sorts last (`:55`), so the
 *     remaining set is systematically slower than the run's own average —
 *     and the error grows the further the run gets.
 *  3. Mean, where Progress reports a median, so the same data gave two
 *     answers and the mean was the one skewed by budget-cut outliers.
 *
 * `sameTargetClass` fixed WHICH runs are pooled after a 3m-17s estimate took
 * 35m 46s. It did not fix how they are combined; this does.
 */
export function runEstimate(
  details: BenchRunDetail[],
  plannedSamples: number,
  targetUrl?: string,
  defaultUrl?: string,
  opts?: {
    /** Remaining task ids, in execution order. */
    remainingTasks?: string[];
    /** `--n`: how many samples each remaining task still costs. */
    samplesPerTask?: number;
    /** The in-flight run's own completed records. */
    liveRecords?: BenchRecord[];
  },
): RunEstimate {
  const pool = sameTargetClass(details, targetUrl, defaultUrl);
  const liveGraded = gradedRecords(opts?.liveRecords ?? []);
  const graded = [
    ...pool.flatMap((d) => gradedRecords(d.records)),
    ...liveGraded,
  ];
  const runsUsed = pool.length + (liveGraded.length > 0 ? 1 : 0);

  if (graded.length === 0 || plannedSamples <= 0)
    return { seconds: null, basis: "none", runsUsed };

  const pooled = medianOf(graded.map((r) => r.seconds))!;
  const remaining = opts?.remainingTasks ?? [];
  if (remaining.length === 0)
    return { seconds: pooled * plannedSamples, basis: "pooled", runsUsed };

  const byTask = new Map<string, number[]>();
  for (const r of graded) {
    const xs = byTask.get(r.task);
    if (xs) xs.push(r.seconds);
    else byTask.set(r.task, [r.seconds]);
  }
  // A task with no history of its own falls back to the pooled figure rather
  // than being priced at zero.
  const perSample = Math.max(1, opts?.samplesPerTask ?? 1);
  let total = 0;
  for (const id of remaining) {
    total += (medianOf(byTask.get(id) ?? []) ?? pooled) * perSample;
  }
  return { seconds: total, basis: "per-task", runsUsed };
}

export interface TaskScope {
  /** Tasks this run's configuration actually covers. */
  count: number;
  /** The whole suite, for context. */
  total: number;
  /** e.g. "js only" — omitted when the run covers every language. */
  langsLabel: string | null;
}

/**
 * The task ids a run covers, IN EXECUTION ORDER.
 *
 * Order matters: rows are rendered before any of them have results, so a
 * roster in the wrong order makes the "on task" position appear to jump
 * around. Verified by comparing `bench.py --list --json` against a completed
 * run's record order — they match exactly. Note that results.json's own
 * `tasks[]` field does NOT: it is sorted alphabetically (gdscript first),
 * so it is the wrong source for this.
 */
export function runTaskRoster(
  tasks: Array<{ id: string; lang: string }> | null | undefined,
  langs: string[] | null | undefined,
): Array<{ id: string; lang: string }> {
  if (!tasks || tasks.length === 0) return [];
  const selected = (langs ?? []).filter(Boolean);
  if (selected.length === 0) return tasks;
  const set = new Set(selected);
  return tasks.filter((t) => set.has(t.lang));
}

/**
 * How many tasks THIS run covers.
 *
 * Derived from the language filter over the full task list, NOT from
 * `results.json.tasks` — that array holds only the tasks that actually ran,
 * so an interrupted run would under-report its own scope. The suite-wide
 * availability count belongs to Run Setup's language toggles; the hero reports
 * scope, which is a different question.
 */
export function runTaskScope(
  tasks: Array<{ id: string; lang: string }> | null | undefined,
  langs: string[] | null | undefined,
): TaskScope {
  const total = tasks?.length ?? 0;
  if (!tasks || tasks.length === 0)
    return { count: 0, total: 0, langsLabel: null };
  const selected = (langs ?? []).filter(Boolean);
  if (selected.length === 0) return { count: total, total, langsLabel: null };
  const set = new Set(selected);
  const count = tasks.filter((t) => set.has(t.lang)).length;
  const coversEverything = count === total;
  return {
    count,
    total,
    langsLabel: coversEverything ? null : `${selected.join(", ")} only`,
  };
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
  /** False when the record crashed, so the count proves nothing either way. */
  applicable: boolean;
} {
  // Only a record that RAN TO COMPLETION can say anything about the suite.
  // A crash stops the grader part way, so a low count is the expected
  // consequence of the crash — the first real run had 4 of its 5 mismatches
  // on errored records, which made the loudest warning on the drilldown the
  // wrong one almost every time.
  const completed = record.status === "pass" || record.status === "fail";
  return {
    ok: !completed || record.tests_total === record.tests_expected,
    ran: record.tests_total,
    expected: record.tests_expected,
    applicable: completed,
  };
}

/** Running totals, without mutating anything during render. */
function cumulative(values: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of values) {
    sum += v;
    out.push(sum);
  }
  return out;
}

/**
 * Tokens per second for one sample. `completion_tokens` is the sum over the
 * sample's attempts and `gen_seconds` is the matching generation time.
 */
function genRate(r: BenchRecord): number | null {
  if (r.gen_seconds <= 0) return null;
  return r.completion_tokens / r.gen_seconds;
}

/**
 * Every figure the Progress card's relocated stats need, derived in one place.
 * All are null/empty when idle rather than carrying the previous run's numbers.
 *
 * Note: elapsedSeries is a local intermediate used only to derive
 * ratePerHourSeries — it is not included in the return value.
 */
export function heroStatFigures(
  records: BenchRunDetail["records"],
  elapsedSeconds: number | null,
  running: boolean,
) {
  const graded = gradedRecords(records);

  const rates = graded.map(genRate);
  const known = rates.filter((r): r is number => r !== null);
  const meanRate =
    known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : null;

  // Cumulative pass rate, so the line shows how the run trended rather than
  // repeating the headline figure.
  const passSeries = cumulative(graded.map((r) => (r.solved ? 1 : 0))).map(
    (solvedSoFar, i) => (solvedSoFar / (i + 1)) * 100,
  );
  const passRate =
    graded.length > 0
      ? (graded.filter((r) => r.solved).length / graded.length) * 100
      : null;

  const elapsedSeries = cumulative(graded.map((r) => r.seconds));
  const totalSeconds = elapsedSeconds ?? 0;

  return {
    // Nothing running and nothing selected means there is nothing to report.
    idle: !running && graded.length === 0,
    totalSeconds,
    rates,
    meanRate,
    passSeries,
    passRate,
    samplesPerHour:
      totalSeconds > 0 ? (graded.length / totalSeconds) * 3600 : null,
    // Its OWN series: samples completed per elapsed hour, as it evolved.
    // Previously this reused elapsedSeries, so Samples/hr and Elapsed were
    // mathematically guaranteed to draw the same shape.
    ratePerHourSeries: elapsedSeries.map((cum, i) =>
      cum > 0 ? ((i + 1) / cum) * 3600 : null,
    ),
  };
}
