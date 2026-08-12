/**
 * Shapes returned by the /api/bench endpoints, which pass localbench's
 * results.json through unchanged. Field names are localbench's, verified
 * against a real file — do not rename them here.
 */

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
  unsolved: string[];
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
  live: BenchLive;
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
  | "server"
  | "live"
  | "pending";
