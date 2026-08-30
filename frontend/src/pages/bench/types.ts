/**
 * Shapes returned by the /api/bench endpoints, which pass localbench's
 * results.json through unchanged. Field names are localbench's, verified
 * against a real file — do not rename them here.
 */

/** One entry in a sample's `attempts[]` log. Present from localbench -277+. */
export interface BenchAttempt {
  attempt: number;
  status: "pass" | "fail" | "error" | "timeout" | "format" | "server";
  /** How the attempt terminated: "cut" | "context_limit" | "no_reply" | absent for normal stop. */
  ended?: string;
  /** True when the attempt ran out of context while still inside a reasoning block. */
  still_thinking?: boolean;
  gen_seconds?: number;
  test_seconds?: number;
  tests_passed?: number;
  tests_failed?: number;
  /** Total tokens in this attempt's generation call. */
  tokens?: number;
  prompt_tokens?: number;
  thinking_tokens?: number;
  answer_tokens?: number;
  tokens_estimated?: boolean;
  finish_reason?: string;
  code_blocks?: number;
  nudges?: number;
  cut_mid_block?: boolean;
  /**
   * Assertion names this attempt failed. schema_version 4+.
   *
   * T249 forbade showing labels on attempts 2 and 3 because only the record's
   * `first_failed` existed and it describes attempt 1 alone. This is the
   * per-attempt list that makes it correct — prefer it, and never substitute
   * `first_failed` for an attempt after the first.
   */
  failed?: string[];
  /**
   * The drowned-draft rescue, schema_version 4+. A draft that ran out of room
   * was either finished in place (`draft_continued`) or used to seed the next
   * attempt (`draft_seeded`). An attempt seeded from a draft did not start
   * cold, so it is not comparable with one that did.
   */
  draft_continued?: boolean;
  draft_seeded?: boolean;
}

/** One sample. localbench writes 41 fields; these are the ones the page uses. */
export interface BenchRecord {
  task: string;
  lang: string;
  number: number;
  sample: number;
  difficulty?: string;
  kind?: string;
  model?: string;
  /**
   * `server` is NOT a verdict on the model — the endpoint never answered.
   * It is excluded from every rate and must never render as a zero.
   */
  status: "pass" | "fail" | "error" | "timeout" | "format" | "server";
  points: number;
  max_points: number;
  solved: boolean;
  first_try: boolean;
  attempts_used: number;
  tests_passed: number;
  tests_failed: number;
  tests_total: number;
  tests_expected: number;
  first_tests_passed: number;
  first_tests_total: number;
  first_failed: string[];
  failed_assertions: string[];
  seconds: number;
  gen_seconds: number;
  test_seconds: number;
  /** Summed over a sample's attempts. */
  completion_tokens: number;
  prompt_tokens: number;
  /** The LARGEST SINGLE request — a different unit from completion_tokens. */
  total_tokens: number;
  tokens_estimated: boolean;
  /**
   * A COUNT of continuation prompts, not a flag: bench.py writes
   * `"nudged": sam.nudges_total` (`:1760`). Declared boolean, it was rendered
   * with a bare `&&`, and `0 && …` evaluates to `0` — which React prints, so
   * an unlabelled digit appeared in the drilldown's flag row.
   */
  nudged: number;
  truncated: boolean;
  cut_mid_block: boolean;
  stopped_at_budget: boolean;
  detail: string;
  /** Per-attempt log. Present from localbench -277+. Absent on older files. */
  attempts?: BenchAttempt[];
  /**
   * Why the sample was not solved, as ONE WORD, from localbench itself.
   * schema_version 4+.
   *
   * `no_reply` · `cut` · `context_limit` · `no_code` · `did_not_compile` ·
   * `ran_and_failed`, and `""` when solved.
   *
   * This replaces the dashboard reconstructing a precedence over `status` and
   * each attempt's `ended` — bench.py's own docstring records that at least one
   * consumer got that precedence wrong, and this was that consumer. It does NOT
   * replace `status`, which still decides the cell colour via `cellState`.
   */
  failure_kind?: string;
  /**
   * localbench's own sentence for the reader. schema_version 4+.
   *
   * Rendered VERBATIM — the cascade that produces it deliberately stays
   * upstream. Empty when nothing was graded (an all-server run leaves it ""
   * while still setting `failure_kind`), so it can never be the only source.
   */
  unsolved_reason?: string;
  /**
   * How many drowned drafts this sample carried forward. schema_version 4+.
   * The rescue is limited to two per task, so this reads against that limit:
   * a sample at 2 had no rescue left.
   */
  carries_used?: number;
}

/** Present only while a run is in flight. `{}` means FINISHED. */
export interface BenchLive {
  current_task?: string;
  current_attempt?: number;
  task_elapsed?: number;
  run_elapsed?: number;
  done?: number;
  total?: number;
  consecutive_server_errors?: number;
  heartbeat?: string;
}

export interface ByLanguageEntry {
  score: number;
  /** Absent on -185+ runs (replaced by passes/tests split). */
  correctness?: number;
  speed: number | null;
  passes?: number;
  tests?: number;
}

export interface BenchSummary {
  samples: number;
  tasks: number;
  /** Sample-weighted. Cheap history only — never the ranking number. */
  mean_points: number;
  max_points: number;
  solved: number;
  first_try: number;
  tests_passed: number;
  tests_expected: number;
  seconds: number;
  /**
   * Sorted and DEDUPLICATED task names. At `--n > 1` a task unsolved in two of
   * three samples appears once, so this is a task count, never a sample count.
   */
  unsolved: string[];
  /**
   * Run totals from localbench, schema_version 4+. They include EVERY record,
   * server samples too — bench.py: "Their gen_seconds is near zero, so
   * including them changes the rate less than excluding them changes the rule."
   * A client-side sum that filters server records will not match.
   */
  total_gen_seconds?: number;
  total_completion_tokens?: number;
  // localbench -157+ scoring fields (absent on pre-157 runs — use ??, never ||)
  /** null means "no score": multi-model file or nothing graded. NOT zero. */
  score?: number | null;
  correctness_100?: number;
  /** localbench -165: replaced by passes_weighted + tests_weighted in -185. */
  correctness_weighted?: number;
  /** localbench -185+: pass-rate component, 70% of score. */
  passes_weighted?: number;
  /** localbench -185+: partial-credit test component, 10% of score. */
  tests_weighted?: number;
  speed_weighted?: number;
  passes_100?: number;
  tests_100?: number;
  speed_100?: number;
  /** localbench -165: renamed to median_minutes in -185. */
  median_solved_minutes?: number;
  median_minutes?: number;
  suite_tasks?: number;
  partial?: boolean;
  // -165+: per-language breakdown (score, correctness, speed per lang)
  by_language?: Record<string, ByLanguageEntry>;
  // multi-model shape only (score: null + models_in_file)
  models_in_file?: string[];
  // nothing-graded shape only (score: null + graded: 0)
  graded?: number;
}

export interface BenchConfig {
  attempts?: number;
  n?: number;
  /**
   * `null` is a real value since localbench -129: the flag was omitted and
   * llama-server used whatever it was started with. It is NOT 0, which is
   * greedy chosen deliberately, and bench.py refuses to resume one as the
   * other. Read it with `??`, never `||`.
   */
  temperature?: number | null;
  /** Both are compared by bench.py's resume guard, so both must round-trip. */
  time_budget?: number;
  time_step?: number;
  langs?: string[];
  model?: string;
  models?: string;
  url?: string;
  label?: string;
  nudge_at?: number;
  max_tokens?: number;
}

/** The cheap history row from GET /api/bench/runs (no `records`). */
export interface BenchRunRow {
  run_id: string;
  suite_hash: string;
  created: string;
  folder: string;
  models: string[];
  summary: BenchSummary | null;
  config: BenchConfig | null;
  /** Derived from `live == {}` by the backend, never from file existence. */
  finished: boolean;
}

/** The full file from GET /api/bench/runs/:id. */
export interface BenchRunDetail {
  version: string;
  run_id: string;
  suite_hash: string;
  created: string;
  models: string[];
  tasks: string[];
  config: BenchConfig;
  summary: BenchSummary;
  records: BenchRecord[];
  /** `{}` (empty object) means the run FINISHED. Non-empty means still live. */
  live: BenchLive;
  /**
   * "running" | "finished" | "aborted". Present from localbench -277+.
   * Absent on older files — fall back to `live == {}` when missing.
   */
  status?: "running" | "finished" | "aborted";
  /** Human-readable note set by localbench when status is "aborted". */
  status_note?: string;
  /**
   * localbench's schema generation (4 at the time of writing). Absent on older
   * files, which is why nothing in this page GATES on it: every schema-4 field
   * is read by its own presence instead, the same convention the -157/-165/-185
   * fields above already use. Kept typed because it is genuinely on the run and
   * is the fastest way to identify a file by hand.
   */
  schema_version?: number;
}

/**
 * What the backend knows the moment it spawns bench.py — available before
 * any results.json exists, which is the whole point of it.
 */
export interface CurrentRun {
  pid: number;
  folder: string | null;
  model: string | null;
  label: string | null;
  langs: string | null;
  url: string | null;
  attempts: number | null;
  n: number | null;
  temperature: number | null;
  started: string;
}

export interface BenchCurrent {
  running: boolean;
  run: CurrentRun | null;
}

export interface BenchReadiness {
  ready: boolean;
  url: string;
  /** Shown verbatim next to a disabled Start button. */
  reason: string;
  probe?: string;
  /**
   * The ids the target itself reports. bench.py passes `--model` through
   * without checking it, so this is the only thing that can catch a stale
   * Model ID before a long run records the wrong name. Optional: an older
   * backend, or a test double, simply names nothing to compare against.
   */
  models?: string[];
}

export interface BenchTrack {
  lang: string;
  tasks: number;
  available: boolean;
  reason: string;
}

export interface BenchCheck {
  version: string;
  suite_hash: string;
  endpoint: string;
  tracks: BenchTrack[];
}

export interface BenchTask {
  number: number;
  id: string;
  lang: string;
  difficulty: string;
  kind: string;
  assertions: number;
}

export interface BenchTaskList {
  suite_hash: string;
  tasks: BenchTask[];
}

/**
 * One square in an attempt strip. `server` is deliberately its own state so
 * it can be rendered as excluded rather than as a failure.
 */
export type CellState =
  | "solved"
  | "solved-late"
  | "miss"
  | "error"
  | "timeout"
  | "format"
  | "server"
  | "live"
  | "pending";
