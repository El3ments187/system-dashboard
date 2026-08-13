import { describe, it, expect } from "vitest";
import benchRun from "./fixtures/benchRun.json";
import benchTruncated from "./fixtures/benchTruncated.json";
import benchAllServer from "./fixtures/benchAllServer.json";
import {
  cellState,
  LOCALBENCH_DEFAULTS,
  compareEligibility,
  failureExplanation,
  compareNotation,
  compareRows,
  compareSlotOptions,
  deltaSpread,
  flakyTasks,
  greedyInterlock,
  groupByEdition,
  historicalTaskMedian,
  taintKind,
  rowTaint,
  isHeartbeatStale,
  languageBreakdown,
  leadsCoverage,
  leadsFromRuns,
  regressionChips,
  runTaskAvg,
  sampleLabel,
  serverExcludedCount,
  taskMean,
  truncationState,
  estimatedRunSeconds,
  runEstimate,
  assertionCanary,
} from "../pages/bench/compute";
import type {
  BenchRecord,
  BenchRunDetail,
  BenchRunRow,
} from "../pages/bench/types";

/** Constructed input is the right tool for a pure predicate: it lets a case
 *  exist that no seeded run happens to contain. */
function rec(over: Partial<BenchRecord> = {}): BenchRecord {
  return {
    task: "js/a",
    lang: "js",
    number: 1,
    sample: 0,
    status: "pass",
    points: 3,
    max_points: 3,
    solved: true,
    first_try: true,
    attempts_used: 1,
    tests_passed: 10,
    tests_failed: 0,
    tests_total: 10,
    tests_expected: 10,
    first_tests_passed: 10,
    first_tests_total: 10,
    first_failed: [],
    failed_assertions: [],
    seconds: 1,
    gen_seconds: 0.5,
    test_seconds: 0.5,
    completion_tokens: 100,
    prompt_tokens: 50,
    total_tokens: 120,
    tokens_estimated: false,
    nudged: false,
    truncated: false,
    cut_mid_block: false,
    stopped_at_budget: false,
    detail: "",
    ...over,
  };
}

function detailOf(
  records: BenchRecord[],
  over: Partial<BenchRunDetail> = {},
): BenchRunDetail {
  return {
    version: "2026.08.07-124",
    run_id: "r1",
    suite_hash: "e293ad7",
    created: "2026-08-08T22:00:00",
    models: ["m"],
    tasks: [],
    config: { attempts: 3, n: 3 },
    summary: {
      samples: records.length,
      tasks: 1,
      mean_points: 0,
      max_points: 3,
      solved: 0,
      first_try: 0,
      tests_passed: 0,
      tests_expected: 0,
      seconds: 0,
      unsolved: [],
    },
    records,
    live: {},
    ...over,
  };
}

// T10 — strip cell mapping, one assertion per state.
describe("T10 strip cell mapping", () => {
  it("maps solved-first-try to a solid cell", () => {
    expect(cellState(rec({ solved: true, first_try: true }))).toBe("solved");
  });
  it("maps solved-on-retry to the dimmed cell — the point loss is the signal", () => {
    expect(cellState(rec({ solved: true, first_try: false, points: 2 }))).toBe(
      "solved-late",
    );
  });
  it("maps a failure to miss", () => {
    expect(cellState(rec({ status: "fail", solved: false, points: 0 }))).toBe(
      "miss",
    );
  });
  it("maps timeout and format to the amber cell", () => {
    expect(cellState(rec({ status: "timeout", solved: false }))).toBe(
      "timeout",
    );
    expect(cellState(rec({ status: "format", solved: false }))).toBe("timeout");
  });
  it("maps server to its own state, never to a failure", () => {
    const state = cellState(
      rec({ status: "server", solved: false, points: 0 }),
    );
    expect(state).toBe("server");
    expect(state).not.toBe("miss");
  });
  // T70 — this asserted `error` maps to "miss", which was true and is now
  // deliberately not. Real data made the conflation costly: the first 35B run
  // was 12 `error` (code that never ran — crashes, missing exports) against
  // 10 `fail` (code that ran and answered wrongly), shown identically. The
  // fail mapping below still guards that half of the distinction.
  it("maps an error status to its own state, distinct from miss", () => {
    expect(cellState(rec({ status: "error", solved: false }))).toBe("error");
    expect(cellState(rec({ status: "fail", solved: false }))).toBe("miss");
  });
});

// T11 — task mean.
describe("T11 task mean from records", () => {
  it("excludes server samples from the mean", () => {
    const records = [
      rec({ points: 3 }),
      rec({ points: 1 }),
      rec({ status: "server", points: 0, solved: false }),
    ];
    // (3 + 1) / 2 = 2 — the server sample is not a zero in the denominator.
    expect(taskMean(records)).toBe(2);
  });
  it("returns null, never 0, when nothing was graded", () => {
    const records = [rec({ status: "server", points: 0, solved: false })];
    expect(taskMean(records)).toBeNull();
    expect(taskMean(records)).not.toBe(0);
  });
});

// T12 — the anti-vacuity case: task-weighted must DIVERGE from sample-weighted.
describe("T12 run task-avg is task-weighted", () => {
  it("differs from the sample-weighted mean when sample counts are unbalanced", () => {
    const records = [
      rec({ task: "js/a", sample: 0, points: 3 }),
      rec({ task: "js/a", sample: 1, points: 3 }),
      rec({ task: "js/a", sample: 2, points: 3 }),
      rec({
        task: "js/b",
        sample: 0,
        points: 0,
        solved: false,
        status: "fail",
      }),
    ];
    const taskWeighted = runTaskAvg(records); // (3 + 0) / 2
    const sampleWeighted =
      records.reduce((s, r) => s + r.points, 0) / records.length; // 9 / 4
    expect(taskWeighted).toBe(1.5);
    expect(sampleWeighted).toBe(2.25);
    expect(
      taskWeighted,
      "task-avg must not silently equal the sample-weighted figure",
    ).not.toBe(sampleWeighted);
  });
});

// T13 — flaky.
describe("T13 flaky solves", () => {
  it("names tasks solved in at least one sample but not all", () => {
    const records = [
      rec({ task: "js/flaky", sample: 0, solved: true }),
      rec({ task: "js/flaky", sample: 1, solved: false, status: "fail" }),
      rec({ task: "js/solid", sample: 0, solved: true }),
      rec({ task: "js/solid", sample: 1, solved: true }),
      rec({ task: "js/never", sample: 0, solved: false, status: "fail" }),
    ];
    const flaky = flakyTasks(records);
    expect(flaky.tasks).toEqual(["js/flaky"]);
    expect(flaky.detail[0]).toEqual({ task: "js/flaky", solved: 1, of: 2 });
    expect(flaky.solidCount).toBe(1);
    expect(flaky.solvedCount).toBe(2);
  });
});

// T14 — history grouping and provenance.
describe("T14 history grouping and provenance marking", () => {
  const row = (over: Partial<BenchRunRow>): BenchRunRow => ({
    run_id: "x",
    suite_hash: "e293ad7",
    created: "2026-08-08T10:00:00",
    folder: "f",
    models: ["m"],
    summary: null,
    config: { attempts: 3, n: 3 },
    finished: true,
    ...over,
  });

  it("groups by suite_hash so a cut line can be drawn between editions", () => {
    const groups = groupByEdition([
      row({
        run_id: "a",
        created: "2026-08-08T10:00:00",
        suite_hash: "e293ad7",
      }),
      row({
        run_id: "b",
        created: "2026-08-07T10:00:00",
        suite_hash: "e293ad7",
      }),
      row({
        run_id: "c",
        created: "2026-08-01T10:00:00",
        suite_hash: "b7f04c1",
      }),
    ]);
    expect(groups.map((g) => g.suiteHash)).toEqual(["e293ad7", "b7f04c1"]);
    expect(groups[0].runs.map((r) => r.run_id)).toEqual(["a", "b"]);
  });

  // T146 — groupByEdition must use plain string comparison, not localeCompare.
  // localeCompare is locale-sensitive and can produce wrong order for ISO dates.
  it("T146 sorts by created using plain comparison (not localeCompare)", () => {
    // Provide runs already in wrong order to confirm the sort works correctly.
    const groups = groupByEdition([
      row({ run_id: "old", created: "2026-08-01T10:00:00", suite_hash: "e293ad7" }),
      row({ run_id: "new", created: "2026-08-10T10:00:00", suite_hash: "e293ad7" }),
      row({ run_id: "mid", created: "2026-08-05T10:00:00", suite_hash: "e293ad7" }),
    ]);
    expect(groups).toHaveLength(1);
    // Newest first.
    expect(groups[0].runs.map((r) => r.run_id)).toEqual(["new", "mid", "old"]);
  });

  it("marks multi-sample runs with their --n and single-sample runs as --n 1", () => {
    expect(sampleLabel({ n: 3 })).toBe("x̄ over --n 3");
    expect(sampleLabel({ n: 1 })).toBe("--n 1");
    expect(sampleLabel(null)).toBe("--n 1");
  });
});

// T15 — regression chips: positive AND both negatives.
describe("T15 regression chips", () => {
  const before = [
    rec({ task: "js/a", solved: true }),
    rec({ task: "js/b", solved: false, status: "fail" }),
    rec({ task: "js/c", solved: true }),
  ];
  const after = [
    rec({ task: "js/a", solved: true }),
    rec({ task: "js/b", solved: true }),
    rec({ task: "js/c", solved: false, status: "fail" }),
  ];

  it("reports the solved-state flips for the same model in one edition", () => {
    const chips = regressionChips(
      { models: ["m"], suite_hash: "e293ad7", records: before },
      { models: ["m"], suite_hash: "e293ad7", records: after },
    );
    expect(chips.comparable).toBe(true);
    expect(chips.up).toEqual(["js/b"]);
    expect(chips.down).toEqual(["js/c"]);
  });

  it("renders NO chip when the model list differs", () => {
    const chips = regressionChips(
      { models: ["m"], suite_hash: "e293ad7", records: before },
      { models: ["other"], suite_hash: "e293ad7", records: after },
    );
    expect(chips.comparable).toBe(false);
    expect(chips.up).toEqual([]);
    expect(chips.down).toEqual([]);
  });

  it("renders NO chip across a suite edition change", () => {
    const chips = regressionChips(
      { models: ["m"], suite_hash: "b7f04c1", records: before },
      { models: ["m"], suite_hash: "e293ad7", records: after },
    );
    expect(chips.comparable).toBe(false);
    expect(chips.reason).toContain("edition");
  });
});

// T145 — regression chips: --label must not suppress chips for the same model.
describe("T145 regression chips with --label", () => {
  const before = [rec({ task: "js/a", solved: true }), rec({ task: "js/b", solved: false, status: "fail" })];
  const after = [rec({ task: "js/a", solved: true }), rec({ task: "js/b", solved: true })];

  it("is comparable when models[] differ but config.model matches", () => {
    const chips = regressionChips(
      {
        models: ["/models/qwen.gguf"],
        suite_hash: "e293ad7",
        records: before,
        config: { model: "/models/qwen.gguf" },
      },
      {
        models: ["my-label"],
        suite_hash: "e293ad7",
        records: after,
        config: { model: "/models/qwen.gguf" },
      },
    );
    expect(chips.comparable).toBe(true);
    expect(chips.up).toEqual(["js/b"]);
  });

  it("is not comparable when config.model differs even if models[] match by label", () => {
    const chips = regressionChips(
      {
        models: ["label"],
        suite_hash: "e293ad7",
        records: before,
        config: { model: "/models/qwen.gguf" },
      },
      {
        models: ["label"],
        suite_hash: "e293ad7",
        records: after,
        config: { model: "/models/gemma.gguf" },
      },
    );
    expect(chips.comparable).toBe(false);
  });
});

// T16 — compare eligibility refuses WITH a message.
describe("T16 compare eligibility", () => {
  const row = (over: Partial<BenchRunRow>): BenchRunRow => ({
    run_id: "x",
    suite_hash: "e293ad7",
    created: "c",
    folder: "f",
    models: ["m"],
    summary: null,
    config: { attempts: 3, n: 3 },
    finished: true,
    ...over,
  });

  it("refuses an --attempts mismatch with an explanatory message", () => {
    const r = compareEligibility([
      row({ run_id: "a", config: { attempts: 3, n: 3 } }),
      row({ run_id: "b", config: { attempts: 2, n: 3 } }),
    ]);
    expect(r.eligible).toBe(false);
    expect(r.message).toMatch(/attempts/i);
    expect(r.message).toMatch(/denominated in attempts/i);
  });

  it("refuses an edition mismatch rather than normalizing it", () => {
    const r = compareEligibility([
      row({ run_id: "a", suite_hash: "e293ad7" }),
      row({ run_id: "b", suite_hash: "b7f04c1" }),
    ]);
    expect(r.eligible).toBe(false);
    expect(r.message).toMatch(/edition/i);
  });

  it("accepts runs that share edition and attempts", () => {
    expect(
      compareEligibility([row({ run_id: "a" }), row({ run_id: "b" })]).eligible,
    ).toBe(true);
  });
});

// T17 — delta spread and default sort.
describe("T17 delta spread", () => {
  it("is max minus min of the per-run means", () => {
    expect(deltaSpread([3, 0.7, 2])).toBeCloseTo(2.3, 5);
  });
  it("ignores runs with nothing graded rather than treating them as 0", () => {
    expect(deltaSpread([3, null])).toBeNull();
    expect(deltaSpread([3, null, 1])).toBe(2);
  });
  it("sorts compare rows by delta descending", () => {
    const a = detailOf(
      [
        rec({ task: "js/same", points: 3 }),
        rec({ task: "js/spread", points: 3 }),
      ],
      { run_id: "a" },
    );
    const b = detailOf(
      [
        rec({ task: "js/same", points: 3 }),
        rec({ task: "js/spread", points: 0, solved: false, status: "fail" }),
      ],
      { run_id: "b" },
    );
    const rows = compareRows([a, b]);
    expect(rows[0].task).toBe("js/spread");
    expect(rows[0].delta).toBe(3);
    expect(rows[1].delta).toBe(0);
  });
});

// T18(a) — the streak predicate. Records are in EXECUTION ORDER.
describe("T18a truncation streak predicate (records are in execution order)", () => {
  it("fires on three consecutive truncated replies", () => {
    const s = truncationState([
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: true }),
    ]);
    expect(s.warned).toBe(true);
    expect(s.triggerIndex).toBe(2);
  });

  it("does not fire when a clean reply breaks the run of three", () => {
    const s = truncationState([
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: false }),
      rec({ truncated: true }),
      rec({ truncated: true }),
    ]);
    expect(s.warned).toBe(false);
    expect(s.currentStreak).toBe(2);
  });

  it("keeps the warned state after later clean records — bench.py warns ONCE and continues", () => {
    const s = truncationState([
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: false }),
      rec({ truncated: false }),
    ]);
    expect(s.warned, "the warning must persist, not reset").toBe(true);
    expect(s.currentStreak).toBe(0);
  });

  // Renamed and re-pointed by T95. This asserted "budget-tainted" for a
  // TRUNCATION trigger — the conflation the badge exposed, where a sample the
  // SERVER cut short was labelled BUDGET and sent the reader to --max-tokens
  // when --nudge-at was the flag that mattered (or vice versa). The contagion
  // rule is unchanged; only the label is now correct.
  it("marks samples at and after a truncation trigger as truncation-tainted", () => {
    const s = truncationState([
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: true }),
      rec({ truncated: false }),
    ]);
    expect(taintKind(0, s)).toBeNull();
    expect(taintKind(2, s)).toBe("truncation");
    expect(taintKind(3, s)).toBe("truncation");
  });
});

// T18(b) — the real --nudge-at 0 fixture, end to end.
describe("T18b truncation from a real mockserver fixture", () => {
  it("derives the warning from a genuine --nudge-at 0 results.json", () => {
    const detail = benchTruncated as unknown as BenchRunDetail;
    expect(
      detail.records.filter((r) => r.truncated).length,
      "fixture must actually contain truncated records",
    ).toBeGreaterThanOrEqual(3);
    expect(truncationState(detail.records).warned).toBe(true);
  });

  it("leaves the banner off for a normal run", () => {
    const detail = benchRun as unknown as BenchRunDetail;
    expect(truncationState(detail.records).warned).toBe(false);
  });
});

// T19 — server-exclusion invariant, property-style.
describe("T19 server-exclusion invariant", () => {
  it("appending server records changes NO displayed rate", () => {
    const base = (benchRun as unknown as BenchRunDetail).records;
    const withServers = [
      ...base,
      rec({ task: base[0].task, status: "server", solved: false, points: 0 }),
      rec({ task: base[1].task, status: "server", solved: false, points: 0 }),
    ];
    expect(runTaskAvg(withServers)).toBe(runTaskAvg(base));
    expect(flakyTasks(withServers).tasks).toEqual(flakyTasks(base).tasks);
    expect(taskMean(withServers.filter((r) => r.task === base[0].task))).toBe(
      taskMean(base.filter((r) => r.task === base[0].task)),
    );
    // The only thing that may change is the count of what was excluded.
    expect(serverExcludedCount(withServers)).toBe(
      serverExcludedCount(base) + 2,
    );
  });
});

// A real run where the endpoint never answered at all. Found during seeding:
// every record is `server`, so there is no verdict anywhere in the file.
describe("T19b a run that reached nothing at all", () => {
  it("reports no score rather than a zero, on a real all-server run", () => {
    const detail = benchAllServer as unknown as BenchRunDetail;
    expect(detail.records.every((r) => r.status === "server")).toBe(true);
    const avg = runTaskAvg(detail.records);
    expect(avg, "an outage must not be rendered as a score of 0").toBeNull();
    expect(avg).not.toBe(0);
    expect(Number.isNaN(avg as unknown as number)).toBe(false);
    expect(serverExcludedCount(detail.records)).toBe(detail.records.length);
    expect(flakyTasks(detail.records).tasks).toEqual([]);
  });
});

// T20 — health.
describe("T20 health signals", () => {
  const now = Date.parse("2026-08-08T23:00:00");
  // T20, amended by T94. This asserted that a heartbeat older than 90s is
  // stale, encoding `STALE_HEARTBEAT_MS = 90_000`. The rule was wrong:
  // bench.py refreshes the heartbeat only when a sample is SAVED
  // (`bench.py:1289`, single write at `:1775`), so its age is the in-flight
  // sample's duration. With a median task around 200s the constant fired on
  // nearly every task, while Progress called the same run "over median" —
  // two surfaces, opposite verdicts, and the alarming one was wrong.
  //
  // The threshold now scales off the task's historical median with a floor.
  // Both directions are asserted here, so the warning cannot be defanged:
  // slow-but-healthy is not stale, wedged still is.
  it("does not accuse a task that is merely slower than a fixed constant", () => {
    // Two minutes since the last sample, on a task whose median is 200s.
    expect(isHeartbeatStale("2026-08-08T22:58:00", now, 200)).toBe(false);
  });
  it("still flags a run wedged far past any plausible sample", () => {
    // Forty minutes on that same 200s task is not slowness.
    expect(isHeartbeatStale("2026-08-08T22:20:00", now, 200)).toBe(true);
  });
  it("falls back to the floor when the task has no history", () => {
    expect(isHeartbeatStale("2026-08-08T22:58:00", now, null)).toBe(false);
    expect(isHeartbeatStale("2026-08-08T22:40:00", now, null)).toBe(true);
  });
  it("scales with the task: the same age is fine for a slower task", () => {
    // 12 minutes: past the floor, but ordinary for a task whose median is 6m.
    const age = "2026-08-08T22:48:00";
    expect(isHeartbeatStale(age, now, 60)).toBe(true);
    expect(isHeartbeatStale(age, now, 360)).toBe(false);
  });
  it("leaves a fresh heartbeat alone", () => {
    expect(isHeartbeatStale("2026-08-08T22:59:30", now)).toBe(false);
  });
  it("treats a missing heartbeat as not-stale rather than inventing a verdict", () => {
    expect(isHeartbeatStale(undefined, now)).toBe(false);
  });
  it("paces against the stored-runs median, not the wall clock", () => {
    const details = [
      detailOf([rec({ task: "js/x", seconds: 10 })]),
      detailOf([rec({ task: "js/x", seconds: 30 })]),
      detailOf([rec({ task: "js/x", seconds: 50 })]),
    ];
    expect(historicalTaskMedian(details, "js/x")).toBe(30);
    expect(historicalTaskMedian(details, "js/absent")).toBeNull();
  });
});

// T22 — greedy interlock.
describe("T22 greedy interlock", () => {
  it("fires only when --n > 1 AND temperature is 0", () => {
    expect(greedyInterlock(3, 0)).toBe(true);
  });
  it("stays off at a non-zero temperature", () => {
    expect(greedyInterlock(3, 0.6)).toBe(false);
  });
  it("stays off for a single sample", () => {
    expect(greedyInterlock(1, 0)).toBe(false);
  });
});

// T27 — leads.
describe("T27 leads across stored runs", () => {
  it("aggregates first_failed across models in the current edition", () => {
    const a = detailOf(
      [
        rec({
          task: "js/a",
          first_failed: ["wraps write index"],
          solved: false,
          status: "fail",
        }),
      ],
      { run_id: "a", models: ["m1"], suite_hash: "e293ad7" },
    );
    const b = detailOf(
      [
        rec({
          task: "js/a",
          first_failed: ["wraps write index"],
          solved: false,
          status: "fail",
        }),
      ],
      { run_id: "b", models: ["m2"], suite_hash: "e293ad7" },
    );
    const rows = leadsFromRuns([a, b], "e293ad7");
    expect(rows[0].task).toBe("js/a");
    expect(rows[0].models).toBe(2);
  });

  it("contributes NOTHING from another edition", () => {
    const other = detailOf(
      [
        rec({
          task: "js/z",
          first_failed: ["old prompt bug"],
          solved: false,
          status: "fail",
        }),
      ],
      { run_id: "z", models: ["m3"], suite_hash: "b7f04c1" },
    );
    const rows = leadsFromRuns([other], "e293ad7");
    expect(rows).toEqual([]);
  });
});

// The fixture is a real mockserver run, so its own arithmetic is a check on
// the reader rather than on a hand-written assumption.
describe("real fixture sanity", () => {
  it("parses the seeded run and computes a task-avg within range", () => {
    const detail = benchRun as unknown as BenchRunDetail;
    const avg = runTaskAvg(detail.records);
    expect(avg).not.toBeNull();
    expect(avg as number).toBeGreaterThanOrEqual(0);
    expect(avg as number).toBeLessThanOrEqual(detail.summary.max_points);
  });
});

// T68 — pace estimated from same-target-class history only.
describe("T68 duration estimate is not diluted by mock runs", () => {
  const runWith = (url: string, seconds: number) =>
    ({
      run_id: url + seconds,
      suite_hash: "e293ad7",
      created: "2026-08-09T00:00:00",
      models: ["m"],
      tasks: ["js/a"],
      config: { url, attempts: 1, n: 1 },
      summary: {},
      live: {},
      records: [
        {
          ...(benchRun.records[0] as unknown as BenchRecord),
          status: "pass",
          seconds,
        },
      ],
    }) as unknown as Parameters<typeof estimatedRunSeconds>[0][number];

  const REAL = "http://localhost:8081";
  const MOCK = "http://127.0.0.1:8123";

  it("draws only on real-target history when estimating a real run", () => {
    // The first real run was estimated at 3m 17s from mock history and took
    // 35m 46s — a ~10x error, entirely from pooling the two classes.
    const history = [
      runWith(MOCK, 1),
      runWith(MOCK, 1),
      runWith(MOCK, 1),
      runWith(REAL, 100),
    ];
    expect(estimatedRunSeconds(history, 10, REAL, REAL)).toBe(1000);
  });

  it("and only on mock history when estimating a mock run", () => {
    const history = [runWith(MOCK, 1), runWith(REAL, 100)];
    expect(estimatedRunSeconds(history, 10, MOCK, REAL)).toBe(10);
  });

  it("returns nothing rather than guessing when that class has no history", () => {
    expect(estimatedRunSeconds([runWith(MOCK, 1)], 10, REAL, REAL)).toBeNull();
  });
});

// T66 — two cut-off mechanisms, tracked separately.
describe("T66 budget cutoffs are counted apart from truncation", () => {
  const r = (flags: Partial<BenchRecord>) =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      truncated: false,
      stopped_at_budget: false,
      ...flags,
    }) as BenchRecord;

  it("counts non-consecutive budget stops that a streak rule would miss", () => {
    // Exactly the real run's shape: indices 3, 9 and 17, never adjacent.
    const records = Array.from({ length: 20 }, (_, i) =>
      r({ stopped_at_budget: i === 3 || i === 9 || i === 17 }),
    );
    const s = truncationState(records);
    expect(s.budgetStops).toBe(3);
    expect(s.budgetTriggerIndex).toBe(3);
    expect(
      s.warned,
      "the three-in-a-row rule belongs to truncation, and none of these were truncated",
    ).toBe(false);
  });

  it("keeps the three-in-a-row rule for server-side truncation", () => {
    expect(
      truncationState([r({ truncated: true }), r({ truncated: true })]).warned,
    ).toBe(false);
    expect(
      truncationState([
        r({ truncated: true }),
        r({ truncated: true }),
        r({ truncated: true }),
      ]).warned,
    ).toBe(true);
  });

  it("taints from whichever cutoff came first", () => {
    const records = [
      r({}),
      r({ stopped_at_budget: true }),
      r({}),
      r({ truncated: true }),
      r({ truncated: true }),
      r({ truncated: true }),
    ];
    const s = truncationState(records);
    expect(taintKind(0, s)).toBeNull();
    expect(taintKind(1, s)).toBe("budget");
    // Past the budget stop AND inside the truncation streak: budget wins,
    // because bench.py stopped generation outright.
    expect(taintKind(4, s)).toBe("budget");
  });
});

// T67 — the canary only speaks for records that finished.
describe("T67 assertion canary ignores crashed records", () => {
  const rec = (status: string, ran: number, expected: number) =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      status,
      tests_total: ran,
      tests_expected: expected,
    }) as BenchRecord;

  it("treats a crash's short count as inapplicable, not as drift", () => {
    const c = assertionCanary(rec("error", 59, 128));
    expect(c.ok).toBe(true);
    expect(c.applicable).toBe(false);
  });

  it("still reports a genuine mismatch on a completed record", () => {
    const c = assertionCanary(rec("fail", 32, 35));
    expect(c.ok).toBe(false);
    expect(c.applicable).toBe(true);
    expect(assertionCanary(rec("pass", 35, 35)).ok).toBe(true);
  });
});

// T76 — the pacing median had the same mock dilution T68 fixed for the
// estimate: a mock run finishes a task in ~0s, so a pooled median reported
// "0s — over median" for every task of a real run.
describe("T76 pacing median is scoped to the target class", () => {
  const REAL = "http://localhost:8081";
  const MOCK = "http://127.0.0.1:8123";
  const runWith = (url: string, seconds: number) =>
    ({
      run_id: url + seconds,
      suite_hash: "e293ad7",
      created: "2026-08-09T00:00:00",
      models: ["m"],
      tasks: ["js/a"],
      config: { url, attempts: 1, n: 1 },
      summary: {},
      live: {},
      records: [
        {
          ...(benchRun.records[0] as unknown as BenchRecord),
          task: "js/a",
          status: "pass",
          seconds,
        },
      ],
    }) as unknown as Parameters<typeof historicalTaskMedian>[0][number];

  it("draws only on real history for a real run", () => {
    const history = [runWith(MOCK, 0), runWith(MOCK, 0), runWith(REAL, 90)];
    expect(historicalTaskMedian(history, "js/a", REAL, REAL)).toBe(90);
  });

  it("returns null, NOT zero, when that class has no history for the task", () => {
    // 0 would render as "median 0s — over median", which reads as though the
    // task is normally instant.
    expect(
      historicalTaskMedian([runWith(MOCK, 0)], "js/a", REAL, REAL),
    ).toBeNull();
  });

  it("still pools everything when no target is supplied", () => {
    const history = [runWith(MOCK, 10), runWith(REAL, 20)];
    expect(historicalTaskMedian(history, "js/a")).toBe(15);
  });
});

// ── T92 — per-slot dropdown options ─────────────────────────────────────────
//
// The chips judged every run against the WHOLE selection including itself,
// so an ineligible pick disabled its own way out. These assert the option
// set a slot offers, which is what makes the dead end unreachable.
describe("T92 compareSlotOptions", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      run_id: "r1",
      suite_hash: "e293ad7",
      created: "2026-08-10T10:00:00Z",
      folder: "f",
      models: ["qwen"],
      summary: null,
      config: { attempts: 3, n: 1, url: "http://localhost:8081" },
      finished: true,
      ...over,
    }) as unknown as Parameters<typeof compareSlotOptions>[0][number];

  const D = "http://localhost:8081";

  it("offers every run when nothing else is selected", () => {
    const runs = [row(), row({ run_id: "r2" })];
    const opts = compareSlotOptions(runs, ["", "", ""], 0, D);
    expect(opts.map((o) => o.runId)).toEqual(["r1", "r2"]);
    expect(opts.every((o) => !o.disabled)).toBe(true);
  });

  it("disables a run whose --attempts differs, and says why", () => {
    const runs = [
      row(),
      row({ run_id: "r2", config: { attempts: 1, n: 1, url: D } }),
    ];
    const opts = compareSlotOptions(runs, ["r1", "", ""], 1, D);
    const other = opts.find((o) => o.runId === "r2")!;
    expect(other.disabled).toBe(true);
    expect(other.reason).toBe("different --attempts");
    expect(other.label).toContain("different --attempts");
  });

  it("disables a run from another suite edition, naming the edition", () => {
    const runs = [row(), row({ run_id: "r2", suite_hash: "beef123" })];
    const opts = compareSlotOptions(runs, ["r1", "", ""], 1, D);
    const other = opts.find((o) => o.runId === "r2")!;
    expect(other.disabled).toBe(true);
    expect(other.reason).toContain("beef123");
  });

  it("never disables the option this slot already holds", () => {
    // The dead end: judged against a selection containing itself, the current
    // pick went disabled and there was no way back to a valid comparison.
    const runs = [
      row(),
      row({ run_id: "r2", config: { attempts: 1, n: 1, url: D } }),
    ];
    const opts = compareSlotOptions(runs, ["r1", "r2", ""], 1, D);
    expect(opts.find((o) => o.runId === "r2")!.disabled).toBe(false);
  });

  it("disables a run already held by another slot", () => {
    const runs = [row(), row({ run_id: "r2" })];
    const opts = compareSlotOptions(runs, ["r1", "", ""], 1, D);
    expect(opts.find((o) => o.runId === "r1")!.reason).toBe(
      "already in another slot",
    );
  });

  it("marks a mock target with the badge's own wording", () => {
    const runs = [
      row({ config: { attempts: 3, n: 1, url: "http://127.0.0.1:8123" } }),
    ];
    expect(compareSlotOptions(runs, ["", "", ""], 0, D)[0].label).toContain(
      "mock / other server",
    );
  });

  it("states attempts and samples in one notation", () => {
    expect(compareNotation({ attempts: 3, n: 1 })).toBe("a3 n1");
    expect(compareSlotOptions([row()], ["", "", ""], 0, D)[0].label).toContain(
      "a3 n1",
    );
  });
});

// ── T95 — the two cutoffs are different mechanisms ─────────────────────────
describe("T95 truncation and budget taints are distinct", () => {
  const r = (over: Record<string, unknown> = {}) =>
    rec({ truncated: false, stopped_at_budget: false, ...over });

  it("a run tainted ONLY by truncation never reads as budget", () => {
    // The exact reported defect: BUDGET on a server-truncated sample.
    const s = truncationState([
      r(),
      r({ truncated: true }),
      r({ truncated: true }),
      r({ truncated: true }),
    ]);
    expect(taintKind(3, s)).toBe("truncation");
    expect(taintKind(3, s)).not.toBe("budget");
  });

  it("a budget stop reads as budget", () => {
    const s = truncationState([r(), r({ stopped_at_budget: true }), r()]);
    expect(taintKind(1, s)).toBe("budget");
    expect(taintKind(2, s)).toBe("budget");
  });

  it("a sample before any trigger carries no taint at all", () => {
    // The absence half: the badge must not become decoration on every row.
    const s = truncationState([r(), r(), r({ stopped_at_budget: true })]);
    expect(taintKind(0, s)).toBeNull();
    expect(taintKind(1, s)).toBeNull();
  });

  it("a task row takes the strongest taint among its samples", () => {
    const s = truncationState([
      r(),
      r({ truncated: true }),
      r({ truncated: true }),
      r({ truncated: true }),
      r({ stopped_at_budget: true }),
    ]);
    expect(rowTaint([0], s)).toBeNull();
    expect(rowTaint([3], s)).toBe("truncation");
    expect(rowTaint([3, 4], s)).toBe("budget");
  });
});

// ── T97 — price the work that REMAINS ──────────────────────────────────────
//
// Tasks run in ladder order and gdscript sorts last, so what is left of a run
// is systematically slower than the average of what finished. A flat mean
// therefore under-predicts every tail, and worse the further the run gets.
describe("T97 estimates weight the remaining tasks", () => {
  const REAL = "http://localhost:8081";
  const MOCK = "http://127.0.0.1:8123";
  const r = (task: string, seconds: number) =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      status: "pass",
      task,
      seconds,
    }) as BenchRecord;
  const runOf = (records: BenchRecord[], url = REAL) =>
    ({
      run_id: "r",
      suite_hash: "e293ad7",
      created: "2026-08-10T10:00:00Z",
      models: ["m"],
      config: { url, attempts: 1, n: 1 },
      summary: {},
      live: {},
      records,
    }) as unknown as Parameters<typeof estimatedRunSeconds>[0][number];

  // Fast head, slow tail — the shape of every real run.
  const history = [
    runOf([
      r("js/easy_a", 10),
      r("js/easy_b", 10),
      r("gdscript/hard_a", 100),
      r("gdscript/hard_b", 100),
    ]),
  ];

  it("exceeds the flat mean when the slow tail is what is left", () => {
    const flatMean = (10 + 10 + 100 + 100) / 4; // 55
    const remaining = ["gdscript/hard_a", "gdscript/hard_b"];
    const est = estimatedRunSeconds(history, remaining.length, REAL, REAL, {
      remainingTasks: remaining,
      samplesPerTask: 1,
    });
    expect(est).toBe(200);
    expect(
      est!,
      "averaging the fast head into the slow tail is the reported defect",
    ).toBeGreaterThan(flatMean * remaining.length);
  });

  it("is correspondingly cheaper when only the fast head remains", () => {
    // The inverse: the fix must not simply inflate every estimate.
    const est = estimatedRunSeconds(history, 2, REAL, REAL, {
      remainingTasks: ["js/easy_a", "js/easy_b"],
      samplesPerTask: 1,
    });
    expect(est).toBe(20);
  });

  it("prices a task with no history at the pooled median", () => {
    const est = estimatedRunSeconds(history, 1, REAL, REAL, {
      remainingTasks: ["java/unknown"],
      samplesPerTask: 1,
    });
    // Pooled median of 10,10,100,100 is 55 — not zero, and not a guess of 0s.
    expect(est).toBe(55);
  });

  it("counts the live run's own completed samples, not just history", () => {
    // The run in progress is the best evidence of its own pace.
    const est = estimatedRunSeconds([], 1, REAL, REAL, {
      remainingTasks: ["js/easy_a"],
      samplesPerTask: 1,
      liveRecords: [r("js/easy_a", 42)],
    });
    expect(est).toBe(42);
  });

  it("reports how thin the evidence is", () => {
    expect(runEstimate([], 1, REAL, REAL).basis).toBe("none");
    expect(runEstimate(history, 2, REAL, REAL).basis).toBe("pooled");
    expect(
      runEstimate(history, 2, REAL, REAL, { remainingTasks: ["js/easy_a"] })
        .basis,
    ).toBe("per-task");
    expect(runEstimate(history, 2, REAL, REAL).runsUsed).toBe(1);
  });

  it("still refuses to pool mock history into a real estimate", () => {
    // sameTargetClass must stay green: a 3m-17s estimate once took 35m 46s.
    const est = estimatedRunSeconds(
      [runOf([r("js/easy_a", 1)], MOCK)],
      10,
      REAL,
      REAL,
      {
        remainingTasks: ["js/easy_a"],
        samplesPerTask: 1,
      },
    );
    expect(est).toBeNull();
  });
});

// ── T100 — the failure panel must state the mode, not show the passes ──────
//
// `first_failed` is bench.py's fail_labels(), which excludes "the test
// stopped before finishing". A cut-off sample therefore has NO failed
// assertions — correctly — and the panel fell through to a head window of the
// log, which for any runner that prints passes first shows passes and only
// passes under the heading "why it failed".
describe("T100 failureExplanation", () => {
  const base = (over: Partial<BenchRecord>) =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      first_failed: [],
      tests_passed: 28,
      tests_failed: 0,
      tests_total: 28,
      tests_expected: 77,
      truncated: false,
      stopped_at_budget: false,
      detail: "PASS a\nPASS b\nPASS c",
      solved: false,
      ...over,
    }) as BenchRecord;

  it("explains an errored sample instead of leaving the excerpt to speak", () => {
    // The observed record: js/formula_engine, status error, 28/77.
    const e = failureExplanation(base({ status: "error" }));
    expect(e.reason).toBe("Crashed before the tests finished.");
  });

  it("counts the assertions that never ran", () => {
    expect(failureExplanation(base({ status: "error" })).unreached).toBe(49);
  });

  it("suppresses the count when everything ran", () => {
    // The absence half — the line must not become permanent furniture.
    const e = failureExplanation(
      base({ status: "fail", tests_passed: 40, tests_failed: 37 }),
    );
    expect(e.unreached).toBe(0);
  });

  it("STICKY FLAG: a completed attempt with real failures is not a cut-off", () => {
    // bench.py accumulates stopped_at_budget across attempts, so the flag
    // means "some attempt was stopped", never "this result was". Keying the
    // cut-off message on it would tell the reader the code was truncated when
    // it failed on merit.
    const e = failureExplanation(
      base({
        status: "fail",
        stopped_at_budget: true,
        first_failed: ["expects 2 + 2 to equal 4"],
      }),
    );
    expect(e.reason, "the assertion list already tells the story").toBeNull();
    expect(e.remedy).toBeNull();
    expect(e.history).toBeNull();
  });

  it("names each mode in bench.py's own terms", () => {
    expect(failureExplanation(base({ status: "format" })).reason).toMatch(
      /no fenced code block/i,
    );
    expect(failureExplanation(base({ status: "timeout" })).reason).toMatch(
      /endless loop/i,
    );
    expect(failureExplanation(base({ status: "server" })).reason).toMatch(
      /could not reach the model/i,
    );
    expect(
      failureExplanation(base({ status: "error", detail: "compile: boom" }))
        .reason,
    ).toMatch(/did not compile/i);
  });

  it("scores nothing for a server sample rather than 0-of-N", () => {
    expect(failureExplanation(base({ status: "server" })).unreached).toBe(0);
  });

  it("names the remedy that matches the mechanism", () => {
    const budget = failureExplanation(
      base({ status: "error", stopped_at_budget: true }),
    );
    expect(budget.remedy).toMatch(/--nudge-at/);
    expect(budget.remedy, "--max-tokens does not fix a budget stop").toMatch(
      /--max-tokens does not affect this/,
    );
    expect(
      budget.history,
      "the flag is history, not a claim about this result",
    ).toMatch(/any attempt/);

    const trunc = failureExplanation(
      base({ status: "error", truncated: true }),
    );
    expect(trunc.remedy).toBe("Raise --max-tokens.");
  });
});

// T99 — the defaults are localbench's, and this is what catches the next
// upstream bump: bench.py's argparse table is the source, not this file.
describe("T99 LOCALBENCH_DEFAULTS tracks bench.py", () => {
  it("matches the -157 argparse table", () => {
    expect(LOCALBENCH_DEFAULTS.attempts, "bench.py:3271").toBe(3);
    expect(LOCALBENCH_DEFAULTS.n, "bench.py:3246").toBe(1);
    expect(LOCALBENCH_DEFAULTS.maxTokens, "bench.py:3282").toBe(0);
    expect(LOCALBENCH_DEFAULTS.nudgeAt, "DEFAULT_NUDGE_AT bench.py:70 used at :3256").toBe(32768);
    expect(LOCALBENCH_DEFAULTS.label, "bench.py:3355").toBe("");
  });

  it("does not reproduce --langs '' , which means EVERY language", () => {
    // bench.py:233 — an empty set is falsy, so the filter is skipped. The
    // dashboard's default is the languages the machine can actually run.
    expect("langs" in LOCALBENCH_DEFAULTS).toBe(false);
  });
});

// ── T101 — a budget stop is not a truncation ───────────────────────────────
//
// bench.py's own summary (`:2652`) says a stopped sample was holding a
// COMPLETE code block when it was cut: "no answer was lost mid-write — but
// the code in it may still have been wrong". What the stop cost was the
// chance to revise (`:2648`). Reporting it beside "crashed" as though the cut
// caused the crash hands the reader the wrong remedy.
describe("T101 budget stop branches on cut_mid_block", () => {
  const rec101 = (over: Partial<BenchRecord>) =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      status: "error",
      first_failed: [],
      solved: false,
      truncated: false,
      stopped_at_budget: true,
      cut_mid_block: false,
      tests_passed: 28,
      tests_failed: 0,
      tests_total: 28,
      tests_expected: 77,
      ...over,
    }) as BenchRecord;

  it("a complete block names the revision cost, not a lost answer", () => {
    const e = failureExplanation(rec101({ cut_mid_block: false }));
    expect(e.history).toMatch(/complete code block/i);
    expect(
      e.history,
      "bench.py is explicit that nothing was lost mid-write",
    ).toMatch(/no answer was lost mid-write/i);
    expect(e.remedy).toMatch(/room to revise/i);
  });

  it("an unclosed block says more room will NOT help", () => {
    // bench.py:2669 — "That is the model never finishing the block, not the
    // context running out — raising the context size will not help."
    const e = failureExplanation(rec101({ cut_mid_block: true }));
    expect(e.history).toMatch(/unclosed code block/i);
    expect(e.remedy).toMatch(/will not help/i);
    expect(
      e.remedy,
      "the two budget cases must not share one remedy",
    ).not.toMatch(/room to revise/i);
  });

  it("neither budget case claims the reply was truncated", () => {
    // `truncated` is the SERVER's finish_reason; a budget stop is bench.py's
    // own cutoff, and the observed run reported truncated 0.
    for (const cut of [false, true]) {
      const e = failureExplanation(rec101({ cut_mid_block: cut }));
      expect(e.history).not.toMatch(/token limit/i);
      expect(e.remedy).not.toMatch(/--max-tokens\b(?! does not)/);
    }
  });

  it("still phrases both as history, per the sticky-flag rule", () => {
    for (const cut of [false, true]) {
      expect(
        failureExplanation(rec101({ cut_mid_block: cut })).history,
      ).toMatch(/any attempt/i);
    }
  });
});

// ── T104 — Compare must not ask for something impossible ───────────────────
//
// `compareEligibility` saw only the SELECTED rows, so with one stored run it
// said "Select at least two runs to compare" — asking the reader to pick a
// second run that does not exist. Every other branch names what it knows;
// this one is also the empty state, so it fires most often.
describe("T104 compareEligibility knows the population", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      run_id: "r1",
      suite_hash: "e293ad7",
      created: "2026-08-11T10:00:00Z",
      folder: "f",
      models: ["m"],
      summary: null,
      config: { attempts: 3, n: 1 },
      finished: true,
      ...over,
    }) as unknown as Parameters<typeof compareEligibility>[0][number];

  it("says there is nothing to compare with when only one run exists", () => {
    const e = compareEligibility([row()], [row()]);
    expect(e.eligible).toBe(false);
    expect(e.message).toMatch(/only one stored run/i);
    expect(
      e.message,
      "asking for a second selection is impossible here",
    ).not.toMatch(/select at least two/i);
  });

  it("says so plainly when there are no runs at all", () => {
    expect(compareEligibility([], []).message).toMatch(/no stored runs yet/i);
  });

  it("still asks for a selection when other runs DO exist", () => {
    // The absence half: with a population to choose from, the original
    // message is the right one.
    const pop = [row(), row({ run_id: "r2" }), row({ run_id: "r3" })];
    const e = compareEligibility([], pop);
    expect(e.message).toMatch(/select at least two/i);
  });

  it("is unchanged when no population is supplied", () => {
    expect(compareEligibility([row()]).message).toMatch(/select at least two/i);
  });
});

// ── T105 — what the lead list cannot see ───────────────────────────────────
describe("T105 leadsCoverage", () => {
  const det = (models: string[], records: Partial<BenchRecord>[]) =>
    ({
      run_id: "r",
      suite_hash: "e293ad7",
      created: "2026-08-11T10:00:00Z",
      models,
      config: { attempts: 3, n: 1 },
      summary: {},
      live: {},
      records: records.map((r) => ({
        ...(benchRun.records[0] as unknown as BenchRecord),
        status: "fail",
        solved: false,
        first_failed: [],
        ...r,
      })),
    }) as unknown as BenchRunDetail;

  it("counts unsolved samples with no failed assertion to report", () => {
    // Cut-off samples: fail_labels drops "the test stopped before finishing",
    // so first_failed is empty and Leads iterates nothing.
    const d = det(
      ["m"],
      [
        { first_failed: ["expects a"] },
        { first_failed: [] },
        { first_failed: [] },
        { solved: true, status: "pass" },
      ],
    );
    expect(leadsCoverage([d], "e293ad7").skipped).toBe(2);
  });

  it("does not count solved samples or server failures", () => {
    // The absence half: a passing sample has nothing to report, and a server
    // sample is the endpoint failing, not the model.
    const d = det(
      ["m"],
      [{ solved: true, status: "pass" }, { status: "server" }],
    );
    expect(leadsCoverage([d], "e293ad7").skipped).toBe(0);
  });

  it("reports how many models the edition holds", () => {
    const a = det(["m1"], [{ first_failed: ["x"] }]);
    const b = det(["m2"], [{ first_failed: ["x"] }]);
    expect(leadsCoverage([a], "e293ad7").models).toBe(1);
    expect(leadsCoverage([a, b], "e293ad7").models).toBe(2);
  });

  it("ignores runs from another edition", () => {
    const other = { ...det(["m"], [{ first_failed: [] }]), suite_hash: "beef" };
    expect(leadsCoverage([other as BenchRunDetail], "e293ad7").skipped).toBe(0);
  });
});

// ── T109 — per-language solved ratios ──────────────────────────────────────
describe("T109 languageBreakdown", () => {
  const rec109 = (lang: string, solved: boolean, status = "fail") =>
    ({
      ...(benchRun.records[0] as unknown as BenchRecord),
      lang,
      solved,
      status,
    }) as BenchRecord;

  it("produces the expected ratios per language", () => {
    const rows = languageBreakdown([
      rec109("js", true, "pass"),
      rec109("js", false),
      rec109("ts", false),
      rec109("ts", false),
      rec109("ts", true, "pass"),
    ]);
    expect(rows).toEqual([
      { lang: "js", solved: 1, total: 2 },
      { lang: "ts", solved: 1, total: 3 },
    ]);
  });

  it("omits a language with no samples rather than showing zero", () => {
    // 0/0 for a track that never ran reads as "attempted and failed".
    const rows = languageBreakdown([rec109("js", true, "pass")]);
    expect(rows.map((r) => r.lang)).toEqual(["js"]);
    expect(rows.some((r) => r.lang === "gdscript")).toBe(false);
  });

  it("excludes server samples, like every other rate on the page", () => {
    const rows = languageBreakdown([
      rec109("js", true, "pass"),
      rec109("js", false, "server"),
    ]);
    expect(rows[0]).toEqual({ lang: "js", solved: 1, total: 1 });
  });
});

// ── T117 — compareRows respects suite task order ──────────────────────────────
//
// Default sort was Δ descending. The taskOrder parameter changes it to suite
// position so the table reads in the same order as the task list.
describe("T117 compareRows sort order", () => {
  function mkDetail(tasks: { id: string; points: number }[]): BenchRunDetail {
    return detailOf(
      tasks.map(({ id, points }) =>
        rec({ task: id, points, max_points: points, solved: points > 0 }),
      ),
    );
  }

  it("defaults to Δ descending when taskOrder is absent", () => {
    const d1 = mkDetail([
      { id: "js/a", points: 0 },
      { id: "js/b", points: 3 },
    ]);
    const d2 = mkDetail([
      { id: "js/a", points: 3 },
      { id: "js/b", points: 3 },
    ]);
    const rows = compareRows([d1, d2]);
    // js/a has Δ=3, js/b has Δ=0 — js/a must come first.
    expect(rows[0].task).toBe("js/a");
  });

  it("sorts by taskOrder position when provided", () => {
    const d1 = mkDetail([
      { id: "js/a", points: 0 },
      { id: "js/b", points: 3 },
    ]);
    const d2 = mkDetail([
      { id: "js/a", points: 3 },
      { id: "js/b", points: 3 },
    ]);
    // Suite order: js/b first, js/a second.
    const taskOrder = [{ id: "js/b" }, { id: "js/a" }];
    const rows = compareRows([d1, d2], taskOrder);
    expect(rows[0].task).toBe("js/b");
    expect(rows[1].task).toBe("js/a");
  });

  it("puts tasks absent from taskOrder at the end", () => {
    const d1 = mkDetail([
      { id: "js/known", points: 0 },
      { id: "js/unknown", points: 3 },
    ]);
    const d2 = mkDetail([
      { id: "js/known", points: 3 },
      { id: "js/unknown", points: 0 },
    ]);
    const taskOrder = [{ id: "js/known" }];
    const rows = compareRows([d1, d2], taskOrder);
    expect(rows[0].task).toBe("js/known");
    expect(rows[1].task).toBe("js/unknown");
  });
});

// ── T125 — compareRows emits genMeans ─────────────────────────────────────────
describe("T125 compareRows genMeans", () => {
  it("includes mean gen_seconds per run column", () => {
    const d1 = detailOf([rec({ task: "js/a", gen_seconds: 2 })]);
    const d2 = detailOf([rec({ task: "js/a", gen_seconds: 4 })]);
    const [row] = compareRows([d1, d2]);
    expect(row.genMeans[0]).toBeCloseTo(2);
    expect(row.genMeans[1]).toBeCloseTo(4);
  });

  it("emits null for a detail slot that is null", () => {
    const d1 = detailOf([rec({ task: "js/a", gen_seconds: 1 })]);
    const [row] = compareRows([d1, null]);
    expect(row.genMeans[0]).toBeCloseTo(1);
    expect(row.genMeans[1]).toBeNull();
  });
});
