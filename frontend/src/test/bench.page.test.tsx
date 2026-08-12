// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import benchRun from "./fixtures/benchRun.json";

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const addAlert = vi.fn();
vi.mock("../context/AlertsContext", () => ({
  useAlertsContext: () => ({
    addAlert,
    alerts: [],
    clearAlerts: () => {},
    removeAlert: () => {},
    setAlerts: () => {},
    alertCount: 0,
  }),
  AlertSeverity: { Info: "info", Warning: "warning", Error: "error" },
}));

import BenchPage from "../pages/BenchPage";
import { serverUnreachableCopy } from "../pages/bench/compute";
import Header from "../components/Header";

// Mutable so a test can change what the ACTIVE model reports — the source
// Run Setup's temperature and the hero's primary name both read.
const { activeModelMock } = vi.hoisted(() => ({
  activeModelMock: {
    temperature: 0.6 as number | null,
    model_path: null as string | null,
    model_alias: null as string | null,
  },
}));
function setActiveModel(next: Partial<typeof activeModelMock>) {
  Object.assign(activeModelMock, next);
}
vi.mock("../context/MetricsContext", () => ({
  // The active model's sampling temperature is what Run Setup inherits.
  useMetricsContext: () => ({
    systemMetrics: null,
    aiCurrentMetrics: activeModelMock,
  }),
}));
vi.mock("../context/LiveDataControlsContext", () => ({
  useLiveDataControlsContext: () => ({ isPaused: false, toggle: () => {} }),
}));
vi.mock("../hooks/useFetchAlerts", () => ({
  useFetchAlerts: () => ({ alerts: [], refetch: () => {} }),
}));

const TASK_LIST = {
  suite_hash: "e293ad7",
  tasks: [
    {
      number: 1,
      id: "js/retry_backoff",
      lang: "js",
      difficulty: "medium",
      kind: "fix",
      assertions: 35,
    },
    {
      number: 2,
      id: "js/formula_engine",
      lang: "js",
      difficulty: "very_hard",
      kind: "build",
      assertions: 77,
    },
    {
      number: 3,
      id: "js/interval_set",
      lang: "js",
      difficulty: "extreme",
      kind: "fix",
      assertions: 69,
    },
    {
      number: 4,
      id: "js/decimal_calc",
      lang: "js",
      difficulty: "hard",
      kind: "fix",
      assertions: 40,
    },
    {
      number: 5,
      id: "java/ring_buffer",
      lang: "java",
      difficulty: "hard",
      kind: "fix",
      assertions: 231,
    },
    {
      number: 6,
      id: "java/csv_parser",
      lang: "java",
      difficulty: "medium",
      kind: "fix",
      assertions: 60,
    },
  ],
};

const CHECK = {
  version: "2026.08.07-124",
  suite_hash: "e293ad7",
  endpoint: "http://localhost:8081/v1",
  tracks: [
    { lang: "js", tasks: 4, available: true, reason: "" },
    {
      lang: "gdscript",
      tasks: 8,
      available: false,
      reason: "godot not on PATH",
    },
  ],
};

type Detail = typeof benchRun;

function runRow(over: Record<string, unknown> = {}) {
  return {
    run_id: benchRun.run_id,
    suite_hash: benchRun.suite_hash,
    created: benchRun.created,
    folder: "seedA_20260808-223558",
    models: benchRun.models,
    summary: benchRun.summary,
    config: benchRun.config,
    finished: true,
    ...over,
  };
}

interface MockOpts {
  detail?: unknown;
  runs?: unknown[];
  failCheck?: boolean;
  /** Readiness of the target server (Fix 4's Start gate). */
  ready?: { ready: boolean; url: string; reason: string };
  /** What /api/ai/settings reports. */
  settings?: Record<string, unknown> | null;
  /** RUN MODELS profiles backing the Model dropdown. */
  profiles?: unknown[];
  /** Override the --check payload (per-language availability). */
  check?: unknown;
  /** Override the --list payload (the task roster). */
  taskList?: unknown;
  /** Process state from POST /api/bench/start, before any results.json. */
  current?: { running: boolean; run: unknown };
  /** Simulate results.json not existing yet. */
  noDetail?: boolean;
}

/** The { data, success } envelope every /api/bench endpoint returns. */
function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data, success: true }),
  } as Response);
}

function installFetch(opts: MockOpts = {}) {
  const detail = opts.detail ?? benchRun;
  const runs = opts.runs ?? [runRow()];
  const calls: string[] = [];
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const ok = okJson;
    if (url.includes("/api/bench/check")) {
      if (opts.failCheck)
        return Promise.resolve({ ok: false, status: 500 } as Response);
      return ok(opts.check ?? CHECK);
    }
    if (url.includes("/api/bench/tasks")) return ok(opts.taskList ?? TASK_LIST);
    if (url.includes("/api/launch/profiles"))
      return ok({
        profiles: opts.profiles ?? [
          {
            name: "qwen.sh",
            parsed_args: { alias: "Qwen3.6-27B-UD-Q4_K_XL" },
          },
          {
            name: "gemma.sh",
            parsed_args: { model_path: "/models/gemma-4-26B-it-qat.gguf" },
          },
        ],
      });
    if (url.includes("/api/ai/settings"))
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            opts.settings === null
              ? {}
              : (opts.settings ?? {
                  llama_server_url: "http://localhost:8081",
                  bench_dir: "/home/gamer/Projects/ai_benchmark/localbench",
                }),
          ),
      } as Response);
    if (url.includes("/api/bench/ready"))
      return ok(
        opts.ready ?? {
          ready: true,
          url: "http://localhost:8081",
          reason: "",
        },
      );
    if (url.includes("/api/bench/current"))
      return ok(opts.current ?? { running: false, run: null });
    if (url.includes("/api/bench/runs/")) {
      if (opts.noDetail)
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ error: "no run with that id", success: false }),
        } as Response);
      return ok(detail);
    }
    if (url.includes("/api/bench/runs")) return ok(runs);
    if (url.includes("/api/bench/log"))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ lines: [], nextOffset: 0 }),
      } as Response);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: {}, success: true }),
    } as Response);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  addAlert.mockClear();
  setActiveModel({ temperature: 0.6, model_path: null, model_alias: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// T07 — registration, both lists.
describe("T07 registration", () => {
  it("Header renders a Bench nav button", () => {
    installFetch();
    render(<Header accent={{ color: "#38bdf8", glow: "#38bdf8" }} />);
    expect(screen.getByText("Bench")).toBeTruthy();
  });

  it("clicking the Bench nav button asks the app to change page", () => {
    installFetch();
    const onPageChange = vi.fn();
    render(
      <Header
        accent={{ color: "#38bdf8", glow: "#38bdf8" }}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByText("Bench"));
    expect(onPageChange).toHaveBeenCalledWith("bench");
  });
});

// T08 — Row-1 cards render from live-shaped API data.
describe("T08 Row-1 cards render from /api/bench data", () => {
  it("shows the model, task-avg, solved and progress figures", async () => {
    installFetch();
    render(<BenchPage />);
    // Wait on real data, not on a tile that renders "—" before it arrives.
    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "buggy-model",
      ),
    );
    expect(screen.getByTestId("bench-task-avg").textContent).not.toContain("—");
    expect(screen.getByTestId("bench-solved")).toBeTruthy();
    expect(screen.getByTestId("bench-gauge-label")).toBeTruthy();
  });

  it("surfaces the missing toolchain that --check reports, rather than assuming", async () => {
    installFetch();
    render(<BenchPage />);
    // The tool-level row moved to Settings (Item 11). What remains here is
    // the consequence for a RUN: the language cannot be selected.
    await waitFor(() =>
      expect(screen.getByTestId("bench-lang-gdscript")).toBeTruthy(),
    );
    const gd = screen.getByTestId("bench-lang-gdscript") as HTMLButtonElement;
    expect(gd.disabled, "an unavailable language must not be selectable").toBe(
      true,
    );
    expect(gd.getAttribute("title")).toContain("skipped");
    expect(
      screen.queryByTestId("bench-track-gdscript"),
      "the tool-level diagnostic row now lives on Settings",
    ).toBeNull();
  });

  it("keeps rendering when the check endpoint fails", async () => {
    installFetch({ failCheck: true });
    render(<BenchPage />);
    // The page must still come up from the runs data alone.
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
  });
});

// T09 — the accent indexing plan is markup, not intention.
describe("T09 accent indexing", () => {
  it("bench cards carry data-accent-el so useAccentIndexer can index them", async () => {
    installFetch();
    const { container } = render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
    const indexed = container.querySelectorAll("[data-accent-el]");
    expect(indexed.length).toBeGreaterThanOrEqual(5);
  });

  it("renders the accent spine effect stack inside bench cards", async () => {
    installFetch();
    const { container } = render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
    expect(
      container.querySelectorAll(".accent-glow-target").length,
    ).toBeGreaterThan(0);
  });
});

// T21 — server errors get the hero banner.
describe("T21 consecutive server errors", () => {
  it("renders the hero banner at one error and says the sweep aborts at three", async () => {
    const live = {
      current_task: "js/formula_engine",
      current_attempt: 2,
      task_elapsed: 5,
      run_elapsed: 20,
      done: 2,
      total: 12,
      consecutive_server_errors: 2,
      heartbeat: new Date().toISOString(),
    };
    installFetch({ detail: { ...benchRun, live } });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-server-banner");
    expect(banner.textContent).toMatch(/aborts itself at 3/);
    expect(banner.textContent).toMatch(/never scored as zeros/);
  });

  it("shows no banner when the endpoint is answering", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
    expect(screen.queryByTestId("bench-server-banner")).toBeNull();
  });
});

// T10 (render half) — the two cell states that have no record behind them.
describe("T10 live and pending strip cells", () => {
  it("marks the in-flight sample of the current task as live, others pending", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    // Keep one sample of one task, and declare that task in flight.
    const task = detail.records[0].task;
    detail.records = detail.records.filter(
      (r) => r.task === task && r.sample === 0,
    );
    (detail as { config: { n: number } }).config.n = 3;
    (detail as { live: Record<string, unknown> }).live = {
      current_task: task,
      current_attempt: 1,
      task_elapsed: 5,
      run_elapsed: 10,
      done: 1,
      total: 3,
      consecutive_server_errors: 0,
      heartbeat: new Date().toISOString(),
    };
    installFetch({ detail });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.queryAllByTestId("bench-cell-live")).toHaveLength(1),
    );
    // Scoped to the in-flight task's OWN row: since T80 the table renders
    // the whole roster, so every queued task contributes pending cells too
    // and a page-wide count no longer isolates this strip.
    const liveRow = screen
      .getByTestId("bench-cell-live")
      .closest('[data-testid="bench-task-row"]')!;
    // n=3, one recorded sample, one live → exactly one still pending here.
    expect(
      liveRow.querySelectorAll('[data-testid="bench-cell-pending"]'),
    ).toHaveLength(1);
  });

  it("shows no live cell once the run has finished", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-task-row").length).toBeGreaterThan(0),
    );
    expect(
      screen.queryAllByTestId("bench-cell-live").length,
      "a finished run has nothing in flight",
    ).toBe(0);
  });
});

// T14 (render half) — the cut line needs two editions, which the seeded
// runs cannot supply: they all share one suite_hash.
describe("T14 edition cut line", () => {
  it("draws the cut line between two suite editions", async () => {
    installFetch({
      runs: [
        runRow({ run_id: "new", created: "2026-08-08T10:00:00" }),
        runRow({
          run_id: "old",
          created: "2026-07-30T10:00:00",
          suite_hash: "b7f04c1",
        }),
      ],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-tab-hist")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("bench-tab-hist"));
    const cut = await screen.findByTestId("bench-edition-cut");
    expect(cut.textContent).toMatch(/different benchmarks/i);
  });

  it("draws NO cut line when every run shares one edition", async () => {
    installFetch({
      runs: [
        runRow({ run_id: "a", created: "2026-08-08T10:00:00" }),
        runRow({ run_id: "b", created: "2026-08-07T10:00:00" }),
      ],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-tab-hist")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("bench-tab-hist"));
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-run-row")).toHaveLength(2),
    );
    expect(screen.queryByTestId("bench-edition-cut")).toBeNull();
  });
});

// T34 / T35 — liveness has two independent origins.
describe("T34/T35 hero liveness", () => {
  const SPAWNED = {
    running: true,
    run: {
      pid: 4242,
      folder: "qwen_20260809-120000",
      model: "Qwen3.6-27B-UD-Q4_K_XL",
      label: null,
      langs: "js,ts",
      attempts: 3,
      n: 3,
      temperature: 0.6,
      started: "2026-08-09T12:00:00Z",
    },
  };

  it("T34 populates the hero from the start response BEFORE any results.json exists", async () => {
    installFetch({ current: SPAWNED, noDetail: true, runs: [] });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "Qwen3.6-27B",
      ),
    );
    // Identity row is fully populated from process state alone. Config is
    // no longer echoed here — Run Setup owns it (Item 8) — so the started
    // clock is what proves process state reached the hero.
    expect(screen.getByTestId("bench-hero-tiles").textContent).toMatch(
      /Started/,
    );
    // ...and the missing file is stated honestly rather than shown as empty.
    const warming = screen.getByTestId("bench-warming");
    expect(warming.textContent).toMatch(/no results file yet/i);
  });

  it("T34 still warms when a STALE detail from a previous run is loaded", async () => {
    // The regression the live check caught: a previously selected run has
    // records, which must not suppress the notice for the run now starting.
    installFetch({
      current: SPAWNED,
      runs: [runRow({ folder: "some-older-run" })],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "Qwen3.6-27B",
      ),
    );
    const warming = await screen.findByTestId("bench-warming");
    expect(
      warming.textContent,
      "a stale detail must not hide the warming phase",
    ).toMatch(/no results file yet/i);
  });

  it("T34 drops the warming notice once the spawned run's file lands with samples", async () => {
    // "Landed" means the spawned run's own results.json is in the list and
    // carries records — not merely that some other run has records.
    installFetch({
      current: SPAWNED,
      runs: [runRow({ folder: SPAWNED.run.folder })],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-task-row").length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("bench-warming")).toBeNull(),
    );
  });

  it("T35 a CLI-started run — known only through results.json — still reads as running", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { live: Record<string, unknown> }).live = {
      current_task: "js/formula_engine",
      current_attempt: 1,
      task_elapsed: 4,
      run_elapsed: 30,
      done: 3,
      total: 12,
      consecutive_server_errors: 0,
      heartbeat: new Date().toISOString(),
    };
    // No process state: this backend did not spawn it.
    installFetch({ detail, current: { running: false, run: null } });
    render(<BenchPage />);

    // The status element replaced the heartbeat label in T74; a CLI-started
    // run must still read as running.
    await waitFor(() =>
      expect(
        screen.getByTestId("bench-run-status").getAttribute("data-status"),
      ).toBe("running"),
    );
    expect(screen.queryByTestId("bench-warming")).toBeNull();
  });
});

// T36 — a label must not masquerade as the model.
describe("T36 label vs model", () => {
  it("shows BOTH when --label replaced the model name", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { models: string[] }).models = ["livecap"];
    (detail as { config: { model: string } }).config.model =
      "Qwen3.6-27B-UD-Q4_K_XL";
    installFetch({ detail });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "Qwen3.6-27B",
      ),
    );
    // The label is shown as a label, never as the name of a model.
    const alias = screen.getByTestId("bench-hero-alias");
    expect(alias.textContent).toContain("Benchmark Alias");
    expect(alias.textContent).toContain("livecap");
  });

  it("shows ONE name when there is no label — no duplicate-name spam", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { models: string[] }).models = ["buggy-model"];
    (detail as { config: { model: string } }).config.model = "buggy-model";
    installFetch({ detail });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "buggy-model",
      ),
    );
    expect(
      screen.queryByTestId("bench-hero-alias"),
      "an unlabelled run must not render a redundant second name",
    ).toBeNull();
  });
});

// T25 — an interrupted run is not a scored run.
describe("T25 interrupted run", () => {
  it("renders the interrupted row with Resume, never as a score", async () => {
    installFetch({
      runs: [runRow({ finished: false })],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("bench-tab-hist"));
    await waitFor(() =>
      expect(screen.getByTestId("bench-interrupted")).toBeTruthy(),
    );
    expect(screen.getByTestId("bench-resume")).toBeTruthy();
  });
});

// T26 — the polling leak class, pinned.
describe("T26 polling lifecycle", () => {
  it("stops polling the run once live == {} (finished)", async () => {
    const calls = installFetch();
    vi.useFakeTimers();
    render(<BenchPage />);
    await vi.waitFor(() =>
      expect(
        calls.filter((u) => u.includes("/api/bench/runs/")).length,
      ).toBeGreaterThan(0),
    );
    const afterFirst = calls.filter((u) =>
      u.includes("/api/bench/runs/"),
    ).length;
    await vi.advanceTimersByTimeAsync(10000);
    const afterWait = calls.filter((u) =>
      u.includes("/api/bench/runs/"),
    ).length;
    expect(
      afterWait,
      "a finished run must not keep polling its results.json",
    ).toBe(afterFirst);
  });
});

// T28 — the header bell, once.
describe("T28 alerts", () => {
  it("pushes exactly one alert when a run has finished", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() => expect(addAlert).toHaveBeenCalled());
    expect(addAlert).toHaveBeenCalledTimes(1);
    expect(addAlert.mock.calls[0][1]).toBe("bench");
    expect(String(addAlert.mock.calls[0][2])).toMatch(/finished/);
  });
});

// Run controls — both states, because an always-enabled Stop is the bug.
describe("run controls", () => {
  const LIVE = {
    current_task: "js/formula_engine",
    current_attempt: 1,
    task_elapsed: 5,
    run_elapsed: 20,
    done: 2,
    total: 12,
    consecutive_server_errors: 0,
    heartbeat: new Date().toISOString(),
  };

  it("disables Stop and Skip while nothing is running, and offers Start", async () => {
    installFetch();
    render(<BenchPage />);
    // Wait for the run detail itself: Start is also disabled while there is
    // no run to repeat, so asserting earlier would pass for the wrong reason.
    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "buggy-model",
      ),
    );
    expect(
      (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("bench-action-skip-task") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("enables Stop and Skip during a live run and refuses a second Start", async () => {
    installFetch({ detail: { ...benchRun, live: LIVE } });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByTestId("bench-action-skip-task") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
        .disabled,
      "a live run must refuse a second start",
    ).toBe(true);
  });

  it("Stop calls the SIGTERM endpoint and says so, never SIGKILL", async () => {
    const calls = installFetch({ detail: { ...benchRun, live: LIVE } });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    const stop = screen.getByTestId("bench-action-stop-run");
    expect(stop.getAttribute("title")).toMatch(/SIGTERM/);
    expect(stop.getAttribute("title")).toMatch(/resumable/);
    fireEvent.click(stop);
    await waitFor(() =>
      expect(calls.some((u) => u.includes("/api/bench/stop"))).toBe(true),
    );
  });
});

// T37 — Start gated on SERVER readiness (Fix 4).
describe("T37 server-readiness gate", () => {
  const NOT_READY = {
    ready: false,
    url: "http://localhost:8081",
    reason: "no server answering at http://localhost:8081: connection refused",
  };

  it("disables Start and renders the reason when nothing answers", async () => {
    installFetch({ ready: NOT_READY });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    // The first probe runs before the settings fetch resolves, so the
    // reason is briefly "no url configured" — wait for the real one.
    await waitFor(() =>
      expect(screen.getByTestId("bench-start-blocked").textContent).toMatch(
        /no server answering/i,
      ),
    );
    // The remedy must be in the UI, not only a tooltip.
    expect(screen.getByTestId("bench-start-blocked").textContent).toMatch(
      /llama\.cpp page|mockserver/i,
    );
  });

  it("enables Start when the server answers", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByTestId("bench-start-blocked")).toBeNull();
  });

  it("flips without a remount once a failing probe starts succeeding", async () => {
    let ready = false;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const ok = okJson;
      if (url.includes("/api/ai/settings"))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ llama_server_url: "http://localhost:8081" }),
        } as Response);
      if (url.includes("/api/bench/ready"))
        return ok({
          ready,
          url: "http://localhost:8081",
          reason: ready ? "" : "down",
        });
      if (url.includes("/api/bench/check")) return ok(CHECK);
      if (url.includes("/api/bench/tasks"))
        return ok({ suite_hash: "e293ad7", tasks: [] });
      if (url.includes("/api/bench/current"))
        return ok({ running: false, run: null });
      if (url.includes("/api/bench/runs/")) return ok(benchRun);
      if (url.includes("/api/bench/runs")) return ok([runRow()]);
      return ok({});
    }) as unknown as typeof fetch;

    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    // A model starts elsewhere; no reload, no remount.
    ready = true;
    await waitFor(
      () =>
        expect(
          (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      { timeout: 9000 },
    );
  }, 15000);
});

// T38 — the target is visible, and mock runs are badged (Fix 5).
describe("T38 target visibility", () => {
  it("badges a non-default target in the hero", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { config: { url: string } }).config.url =
      "http://127.0.0.1:8123";
    installFetch({ detail });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-mock-badge").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.getByTestId("bench-target-url").textContent).toContain(
      "8123",
    );
  });

  it("renders NO badge when the run targets the configured llama-server", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { config: { url: string } }).config.url =
      "http://localhost:8081";
    installFetch({
      detail,
      runs: [
        runRow({
          config: { ...benchRun.config, url: "http://localhost:8081" },
        }),
      ],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "buggy-model",
      ),
    );
    expect(
      screen.queryAllByTestId("bench-mock-badge"),
      "a real target must not be badged",
    ).toHaveLength(0);
  });

  it("badges the mock run's History row and leaves a real one unbadged", async () => {
    installFetch({
      runs: [
        runRow({
          run_id: "mock",
          config: { ...benchRun.config, url: "http://127.0.0.1:8123" },
        }),
        runRow({
          run_id: "real",
          created: "2026-08-07T10:00:00",
          config: { ...benchRun.config, url: "http://localhost:8081" },
        }),
      ],
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-tab-hist")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("bench-tab-hist"));
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-run-row")).toHaveLength(2),
    );
    const rows = screen.getAllByTestId("bench-run-row");
    const badgedRows = rows.filter((r) =>
      r.querySelector('[data-testid="bench-mock-badge"]'),
    );
    expect(badgedRows).toHaveLength(1);
  });
});

// T39 — Start/Stop follow ACTUAL run liveness, including across a remount.
describe("T39 liveness wiring", () => {
  const LIVE_RUN = {
    running: true,
    run: {
      pid: 99,
      folder: "f",
      model: "m",
      label: null,
      langs: "js",
      url: "http://localhost:8081",
      attempts: 3,
      n: 1,
      temperature: 0.6,
      started: "2026-08-09T12:00:00Z",
    },
  };

  it("running → Start disabled, Stop enabled", async () => {
    installFetch({ current: LIVE_RUN });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("a REMOUNT while the backend run is live still shows Stop enabled", async () => {
    installFetch({ current: LIVE_RUN });
    const first = render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    first.unmount();

    // Fresh mount, same backend state: liveness must come from the backend,
    // not from "did I click Start in this session".
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-stop-run") as HTMLButtonElement)
          .disabled,
        "liveness must survive a remount — a local flag would not",
      ).toBe(false),
    );
  });
});

// T40 / T43 / T44 — Run Setup is a real form (Fix 7, Fix 10).
describe("T40/T43/T44 Run Setup form", () => {
  it("T40 the url field defaults to the llama-server, not the last run's url", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    // The stored run used a mock url; a fresh mount must NOT inherit it.
    (detail as { config: { url: string } }).config.url =
      "http://127.0.0.1:8123";
    installFetch({ detail });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-url-field") as HTMLInputElement).value,
      ).toBe("http://localhost:8081"),
    );
  });

  it("T43 every field is a real editable control", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-field-model")).toBeTruthy(),
    );
    for (const id of [
      "bench-field-model",
      "bench-field-label",
      "bench-url-field",
      "bench-field-attempts",
      "bench-field-n",
      "bench-field-temperature",
    ]) {
      const el = screen.getByTestId(id) as HTMLInputElement;
      expect(el.tagName, `${id} must be an input, not static text`).toBe(
        "INPUT",
      );
      expect(el.readOnly).toBe(false);
    }
    const attempts = screen.getByTestId(
      "bench-field-attempts",
    ) as HTMLInputElement;
    fireEvent.change(attempts, { target: { value: "7" } });
    expect(attempts.value).toBe("7");
  });

  it("T44 temperature inherits the active model's value until overridden", async () => {
    installFetch();
    render(<BenchPage />);
    const temp = (await screen.findByTestId(
      "bench-field-temperature",
    )) as HTMLInputElement;
    // The mocked metrics context reports 0.6 (see the module mock).
    await waitFor(() => expect(temp.value).toBe("0.6"));
    expect(screen.getByText(/Inherited from the active model/)).toBeTruthy();

    fireEvent.change(temp, { target: { value: "0.9" } });
    expect(temp.value).toBe("0.9");
    expect(screen.queryByText(/Inherited from the active model/)).toBeNull();
  });
});

// T41 — console tab keeps its state across a switch (Fix 8).
describe("T41 console tab state", () => {
  it("keeps level filters across tabbing away and back", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-tab-console")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("bench-tab-console"));
    const warn = await screen.findByTestId("bench-log-level-warn");
    expect(warn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(warn);
    expect(warn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("bench-tab-tasks"));
    fireEvent.click(screen.getByTestId("bench-tab-console"));
    expect(
      screen.getByTestId("bench-log-level-warn").getAttribute("aria-pressed"),
      "filters must survive the hidden toggle, not reset",
    ).toBe("false");
  });

  it("keeps streaming while another tab is showing (stays mounted)", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-tab-console")).toBeTruthy(),
    );
    // Console pane exists even while "This run" is the active tab.
    expect(screen.getByTestId("bench-console")).toBeTruthy();
  });
});

// T46 — the runs-path chip shows the REAL configured location (Fix 11).
describe("T46 runs path chip", () => {
  it("renders the configured bench_dir", async () => {
    installFetch();
    render(<BenchPage />);
    const chip = await screen.findByTestId("bench-runs-path");
    await waitFor(() =>
      expect(chip.textContent).toContain(
        "/home/gamer/Projects/ai_benchmark/localbench/runs",
      ),
    );
  });

  it("says so explicitly when bench_dir is unset, rather than rendering blank", async () => {
    installFetch({ settings: { llama_server_url: "http://localhost:8081" } });
    render(<BenchPage />);
    const chip = await screen.findByTestId("bench-runs-path");
    await waitFor(() => expect(chip.textContent).toMatch(/unset/i));
    expect(chip.textContent).toMatch(/settings/i);
  });
});

// T47 — the hero counts THIS run's scope, not the whole suite.
describe("T47 hero task count", () => {
  it("counts only the run's selected languages", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { config: { langs: string[] } }).config.langs = ["js"];
    installFetch({ detail });
    render(<BenchPage />);
    const chip = await screen.findByTestId("bench-hero-taskcount");
    // 4 js tasks of 6 in the suite — NOT 6.
    await waitFor(() => expect(chip.textContent).toBe("4"));
    expect(chip.parentElement?.textContent).toMatch(/js only/);
  });

  it("agrees with the number of rows Tasks & Runs renders for that run", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { config: { langs: string[] } }).config.langs = ["js"];
    installFetch({ detail });
    render(<BenchPage />);
    const chip = await screen.findByTestId("bench-hero-taskcount");
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-task-row").length).toBeGreaterThan(0),
    );
    expect(
      Number(chip.textContent),
      "the hero must not contradict the table below it",
    ).toBe(screen.getAllByTestId("bench-task-row").length);
  });

  it("shows the full suite when no language filter is set", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (detail as { config: { langs: string[] } }).config.langs = [];
    installFetch({ detail });
    render(<BenchPage />);
    const chip = await screen.findByTestId("bench-hero-taskcount");
    await waitFor(() => expect(chip.textContent).toBe("6"));
    // Scoped to the chip: "only" appears in other copy on the page.
    expect(
      chip.parentElement?.textContent,
      "an unfiltered run must not claim a language scope",
    ).not.toMatch(/only/);
  });
});

// T48 — Model is a dropdown, but not a cage.
describe("T48 Model dropdown", () => {
  it("lists the models RUN MODELS knows about", async () => {
    installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    // The datalist is what makes it a dropdown while keeping it typable.
    expect(field.getAttribute("list")).toBe("bench-model-options");
    await waitFor(() => {
      const options = Array.from(
        screen.getByTestId("bench-model-options").querySelectorAll("option"),
      ).map((o) => o.getAttribute("value"));
      // alias when the script sets one, else the model file's basename.
      expect(options).toContain("Qwen3.6-27B-UD-Q4_K_XL");
      expect(options).toContain("gemma-4-26B-it-qat.gguf");
    });
  });

  it("still accepts a name that is NOT in the list, and submits it", async () => {
    const calls = installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    fireEvent.change(field, { target: { value: "some-unlisted-mock" } });
    expect(field.value).toBe("some-unlisted-mock");
    fireEvent.click(screen.getByTestId("bench-action-start-run"));

    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/start"))).toBe(true),
    );
    const body = JSON.parse(
      (
        global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls.find(([u]) => String(u).includes("/api/bench/start"))![1]
        .body as string,
    ) as { model: string };
    expect(
      body.model,
      "a model outside the dropdown must not be silently dropped",
    ).toBe("some-unlisted-mock");
  });
});

// T49 / T50 / T51 — Dry run is the normal pipeline, pointed elsewhere.
describe("T49/T50/T51 Dry run", () => {
  const startBody = () =>
    JSON.parse(
      (
        global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls.find(([u]) => String(u).includes("/api/bench/start"))![1]
        .body as string,
    ) as { url: string };

  it("T49 starts a run against the mockserver address, not the configured one", async () => {
    const calls = installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-dry-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("bench-action-dry-run"));
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/start"))).toBe(true),
    );
    expect(startBody().url).toBe("http://127.0.0.1:8123");
  });

  it("T50 leaves the configured url field byte-identical", async () => {
    installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-url-field",
    )) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe("http://localhost:8081"));
    const before = field.value;

    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-dry-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("bench-action-dry-run"));

    expect(
      (screen.getByTestId("bench-url-field") as HTMLInputElement).value,
      "a dry run must not silently repoint the configured url",
    ).toBe(before);
  });

  it("T51 faces the same readiness gate, for the MOCK address", async () => {
    // The configured server answers; the mockserver does not.
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai/settings"))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ llama_server_url: "http://localhost:8081" }),
        } as Response);
      if (url.includes("/api/bench/ready")) {
        const down = url.includes("8123");
        return okJson({
          ready: !down,
          url: down ? "http://127.0.0.1:8123" : "http://localhost:8081",
          reason: down
            ? "No server answering at http://127.0.0.1:8123: connection refused"
            : "",
        });
      }
      if (url.includes("/api/bench/check")) return okJson(CHECK);
      if (url.includes("/api/bench/tasks")) return okJson(TASK_LIST);
      if (url.includes("/api/launch/profiles")) return okJson({ profiles: [] });
      if (url.includes("/api/bench/current"))
        return okJson({ running: false, run: null });
      if (url.includes("/api/bench/runs/")) return okJson(benchRun);
      if (url.includes("/api/bench/runs")) return okJson([runRow()]);
      return okJson({});
    }) as unknown as typeof fetch;

    render(<BenchPage />);
    // Normal Start is fine — the configured server answers.
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    // Dry run is gated on the MOCK address, and says so.
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-dry-run") as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    const title = screen
      .getByTestId("bench-action-dry-run")
      .getAttribute("title");
    expect(title).toMatch(/No server answering at http:\/\/127\.0\.0\.1:8123/);
    expect(title, "the next step must be stated").toMatch(/mockserver\.py/);
  });
});

// T23 / T24 — the drilldown.
describe("T23/T24 drilldown", () => {
  async function openFirstTask(detail: unknown) {
    installFetch({ detail });
    render(<BenchPage />);
    // Wait for the run's DATA, not merely for rows: since T80 the roster
    // renders rows before the detail arrives, and clicking that early means
    // the drilldown is opened against runKey "none" and is then correctly
    // closed by T64's scoping when the real run loads.
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId("bench-task-mean")
          .some((c) => /\d/.test(c.textContent ?? "")),
      ).toBe(true),
    );
    // The first RECORDED task, not the first row: since T80 the table also
    // renders queued roster rows, which have no drilldown to open.
    const task = (detail as { records: Array<{ task: string }> }).records[0]
      .task;
    const row = screen
      .getAllByTestId("bench-task-row")
      .find((r) => r.textContent?.includes(task))!;
    fireEvent.click(row);
  }

  it("labels completion tokens as a SUM and total_tokens as the largest single request", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    await openFirstTask(detail);
    const sum = await screen.findByTestId("bench-tokens-sum");
    const max = screen.getByTestId("bench-tokens-max");
    expect(sum.textContent).toMatch(/Completion/i);
    expect(sum.textContent).toMatch(/all attempts/i);
    expect(max.textContent).toMatch(/Largest single request/i);
  });

  it("suffixes token figures with ~ when tokens_estimated is set", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    detail.records.forEach((r) => {
      (r as { tokens_estimated: boolean }).tokens_estimated = true;
    });
    await openFirstTask(detail);
    const note = await screen.findByTestId("bench-tokens-estimated");
    expect(note.textContent).toMatch(/estimated/i);
    expect(screen.getByTestId("bench-tokens-sum").textContent).toContain("~");
  });

  it("renders the assertion canary loudly when the run disagrees with the suite", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    detail.records.forEach((r) => {
      (r as { tests_total: number }).tests_total = 3;
      (r as { tests_expected: number }).tests_expected = 99;
    });
    await openFirstTask(detail);
    const canary = await screen.findByTestId("bench-canary");
    expect(canary.textContent).toMatch(/SUITE DRIFT/);
  });

  it("marks the canary satisfied when the counts agree", async () => {
    const detail = JSON.parse(JSON.stringify(benchRun)) as Detail;
    detail.records.forEach((r) => {
      (r as { tests_total: number }).tests_total = 42;
      (r as { tests_expected: number }).tests_expected = 42;
    });
    await openFirstTask(detail);
    const canary = await screen.findByTestId("bench-canary");
    expect(canary.textContent).not.toMatch(/SUITE DRIFT/);
    expect(canary.textContent).toMatch(/42\/42/);
  });
});

// T52 — the health strip has THREE states. Only two were ever specified, so
// a finished run fell through to live pacing copy with no heartbeat behind it.
describe("T52 health strip states", () => {
  // Amended by T103. This asserted "Run stopped" for a run that FINISHED —
  // the fixture's live block is empty, which is how bench.py records a clean
  // completion. The strip, the hero pill and the status line each decided for
  // themselves what a terminal run was called, so a completed 27/27 run read
  // "Stopped", "Run finished" and "Run stopped" at once. All three now take
  // the same `runStatus` kind; an INTERRUPTED run still reads stopped, and
  // that direction is asserted in T103's own tests.
  it("reports a finished run instead of live pacing copy", async () => {
    installFetch();
    render(<BenchPage />);
    const strip = await screen.findByTestId("bench-pacing");
    await waitFor(() => expect(strip.textContent).toMatch(/run finished/i));
    expect(
      strip.textContent,
      "a stopped run has no heartbeat to call a health signal",
    ).not.toMatch(/heartbeat is the only health signal/i);
    expect(strip.textContent).toMatch(/samples recorded/i);
  });

  it("keeps the live pacing copy while a run is actually running", async () => {
    const live = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (live as { live: Record<string, unknown> }).live = {
      current_task: "js/formula_engine",
      done: 2,
      total: 12,
      task_elapsed: 30,
      heartbeat: new Date().toISOString(),
    };
    installFetch({ detail: live });
    render(<BenchPage />);
    const strip = await screen.findByTestId("bench-pacing");
    await waitFor(() =>
      expect(strip.textContent).toMatch(/health signal|median for this task/i),
    );
    expect(strip.textContent).not.toMatch(/run stopped/i);
  });
});

// T54 — Progress must not describe the PREVIOUS run while a new one warms.
describe("T54 Progress during warming", () => {
  it("shows no carried-over sample count, elapsed or gauge", async () => {
    // A finished run is loaded (12 samples, 100% gauge) and a DIFFERENT run
    // has just been spawned — the exact split-brain that showed one run in
    // the hero and another in Progress.
    installFetch({
      current: {
        running: true,
        run: {
          pid: 4242,
          folder: "qwen_20260809-120000",
          model: "Qwen3.6-27B-UD-Q4_K_XL",
          label: null,
          langs: "js,ts",
          attempts: 3,
          n: 3,
          temperature: 0.6,
          started: "2026-08-09T12:00:00Z",
          url: "http://localhost:8081",
        },
      },
    });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("bench-gauge-label").textContent,
      "the previous run's completed gauge must not light up the new one",
    ).not.toBe("100");
    const progress = screen.getByTestId("bench-progress-tiles").textContent;
    expect(
      progress,
      "the previous run's sample count must not carry",
    ).not.toMatch(/12/);
  });
});

// T55 — float32 noise from the server is not a temperature to show.
describe("T55 inherited temperature formatting", () => {
  it("renders 0.30, not the raw float32 round-trip", async () => {
    setActiveModel({ temperature: 0.30000001192092896 });
    installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-temperature",
    )) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe("0.3"));
    expect(field.value).not.toContain("0.30000001");
  });

  it("sends the same rounded value it displays", async () => {
    setActiveModel({ temperature: 0.30000001192092896 });
    const calls = installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("bench-action-start-run"));
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/start"))).toBe(true),
    );
    const body = JSON.parse(
      (
        global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls.find(([u]) => String(u).includes("/api/bench/start"))![1]
        .body as string,
    ) as { temperature: number };
    expect(
      body.temperature,
      "displaying one temperature and benchmarking another would be worse than the noise",
    ).toBe(0.3);
  });
});

// T56 — Model ID blank + an alias must still name the real model.
describe("T56 Model ID vs Benchmark Alias", () => {
  it("shows the ACTIVE model as the name and the alias as an alias", async () => {
    setActiveModel({ model_path: "/models/Qwen3.6-35B-APEX-Q3_K_L.gguf" });
    installFetch({
      current: {
        running: true,
        run: {
          folder: "looping_20260809-120000",
          // Model ID was left blank; only a label was given.
          model: null,
          label: "looping-model",
          langs: "js",
          attempts: 1,
          n: 1,
          temperature: 0.6,
          started: new Date().toISOString(),
          url: "http://localhost:8081",
          pid: 4242,
        },
      },
      noDetail: true,
      runs: [],
    });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "Qwen3.6-35B-APEX",
      ),
    );
    expect(
      screen.getByTestId("bench-hero-model").textContent,
      "a label must never stand in for the model name",
    ).not.toContain("looping-model");
    const alias = screen.getByTestId("bench-hero-alias");
    expect(alias.textContent).toContain("Benchmark Alias");
    expect(alias.textContent).toContain("looping-model");
  });
});

// T57 — Config left the hero; Output moved next to the log it belongs with.
describe("T57 hero tiles and Output relocation", () => {
  it("renders exactly two hero tiles, with no Config echo", async () => {
    installFetch();
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-hero-tiles");
    expect(tiles.textContent).toMatch(/Started/);
    expect(tiles.textContent).toMatch(/Elapsed/);
    expect(
      tiles.textContent,
      "Run Setup owns configuration; a compressed copy here is the duplication that was removed",
    ).not.toMatch(/Config/);
    expect(tiles.textContent).not.toMatch(/Output/);
  });

  it("puts the run folder in the Console tab's toolbar, once", async () => {
    installFetch();
    render(<BenchPage />);
    const out = await screen.findByTestId("bench-console-output");
    expect(out.textContent).toContain("seedA_20260808-223558");
    expect(
      screen.queryAllByText(/runs\/seedA_20260808-223558/),
      "the path belongs in one place, not two",
    ).toHaveLength(1);
  });
});

// T58 — Languages is four toggles sourced from real availability.
describe("T58 language toggles", () => {
  it("toggles independently and submits exactly what is left on", async () => {
    const calls = installFetch({
      check: {
        ...CHECK,
        tracks: [
          { lang: "js", tasks: 4, available: true, reason: "" },
          { lang: "ts", tasks: 7, available: true, reason: "" },
          { lang: "java", tasks: 8, available: true, reason: "" },
          {
            lang: "gdscript",
            tasks: 8,
            available: false,
            reason: "godot not on PATH",
          },
        ],
      },
    });
    render(<BenchPage />);
    // Amended by T99. This used to wait for the SELECTED RUN's flags to land
    // and asserted "the run used --langs js, so js starts on". Run Setup no
    // longer seeds from the selected run at all — it opens on localbench's
    // defaults — so that starting state no longer exists. What this test is
    // actually for, and what it still asserts, is that two toggles in one
    // render are both applied and that exactly what is left on is submitted.
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-lang-ts") as HTMLButtonElement).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true"),
    );

    // Two toggles back to back: batched into one render, so both must be
    // applied — the first must not be lost to a stale read.
    fireEvent.click(screen.getByTestId("bench-lang-ts"));
    fireEvent.click(screen.getByTestId("bench-lang-js"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-lang-js") as HTMLButtonElement).getAttribute(
          "aria-pressed",
        ),
      ).toBe("false"),
    );
    expect(
      (screen.getByTestId("bench-lang-ts") as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
      "the second click must not be lost to a stale read of the first",
    ).toBe("false");
    expect(
      (screen.getByTestId("bench-lang-java") as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-action-start-run") as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId("bench-action-start-run"));
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/start"))).toBe(true),
    );
    const body = JSON.parse(
      (
        global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls.find(([u]) => String(u).includes("/api/bench/start"))![1]
        .body as string,
    ) as { langs: string };
    expect(body.langs).toBe("java");
  });

  it("cannot switch on a language whose toolchain is missing", async () => {
    installFetch();
    render(<BenchPage />);
    const gd = (await screen.findByTestId(
      "bench-lang-gdscript",
    )) as HTMLButtonElement;
    expect(gd.disabled).toBe(true);
    fireEvent.click(gd);
    expect(gd.getAttribute("aria-pressed")).toBe("false");
  });
});

// T59 — the footer reports the page's own numbers, not a second computation.
describe("T59 footer is single-source", () => {
  it("matches Score's solved/graded and the hero's elapsed", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-footer-pass-rate").textContent).not.toBe(
        "—",
      ),
    );
    const solved =
      screen.getByTestId("bench-solved").parentElement?.textContent ?? "";
    // "11 / 15 graded" → the same ratio the footer renders as a percentage.
    // "Solved — samples11 / 15 graded" → the ratio Score is showing.
    const [num, den] = solved
      .split("/")
      .map((part) => Number(part.replace(/\D/g, "")));
    const expected = `${Math.round((num / den) * 100)}%`;
    expect(screen.getByTestId("bench-footer-pass-rate").textContent).toBe(
      expected,
    );

    const heroElapsed =
      screen.getByTestId("bench-hero-tiles").textContent ?? "";
    expect(
      heroElapsed,
      "two clocks that can disagree is worse than one shown twice",
    ).toContain(screen.getByTestId("bench-footer-elapsed").textContent ?? "");
  });

  it("dashes every stat when there is no run at all", async () => {
    installFetch({ noDetail: true, runs: [] });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-footer-gen-speed")).toBeTruthy(),
    );
    for (const id of [
      "bench-footer-gen-speed",
      "bench-footer-samples-hr",
      "bench-footer-pass-rate",
      "bench-footer-remaining",
    ]) {
      expect(
        screen.getByTestId(id).textContent,
        `${id} must be an honest dash, not a leftover figure`,
      ).toBe("—");
    }
  });
});

// T61 — the refusal copy, byte for byte. A substring check is what let the
// raw-HTTP-error version through last time.
describe("T61 readiness refusal copy", () => {
  it("renders the exact sentence, with no raw transport error inline", async () => {
    installFetch({
      ready: {
        ready: false,
        url: "http://localhost:8081",
        reason:
          "no server answering at http://localhost:8081: error sending request for url (http://localhost:8081/v1/models)",
      },
    });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-start-blocked");
    // Wait on the TITLE: the sentence can already match from the url field
    // while the probe is still in flight, so asserting it first would race.
    await waitFor(() =>
      expect(banner.getAttribute("title")).toContain("error sending request"),
    );
    expect(banner.textContent).toBe(
      serverUnreachableCopy("http://localhost:8081"),
    );
    expect(banner.textContent).not.toContain("error sending request");
    expect(
      screen.getByTestId("bench-llamacpp-link").getAttribute("href"),
      "the page is a link, not prose naming a page",
    ).toBe("/llama-cpp");
  });
});

// T59b — the Compare tab's count badge is real, not the mockup's literal 3.
describe("T59 Compare badge counts real runs", () => {
  it("matches the number of run columns the tab actually renders", async () => {
    installFetch({
      runs: [runRow(), runRow({ run_id: "r2" }), runRow({ run_id: "r3" })],
    });
    render(<BenchPage />);

    const tab = await screen.findByTestId("bench-tab-cmp");
    await waitFor(() => expect(tab.textContent).toMatch(/Compare\s+\d/));
    const badge = Number(/\d+/.exec(tab.textContent ?? "")?.[0]);

    fireEvent.click(tab);
    await waitFor(() =>
      expect(
        screen.queryAllByTestId("bench-compare-col").length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.queryAllByTestId("bench-compare-col").length,
      "the badge must count the runs actually being compared",
    ).toBe(badge);
  });
});

// T64 — the drilldown must never present another run's failure content.
//
// Item 5's mechanism, one level deeper: `detail` is file-derived, and during
// a new run's warming phase it is still the PREVIOUSLY selected run. Progress
// and the hero were re-scoped then; the task table was not, so an older run's
// records — including its drilldown failure text — rendered underneath a run
// that had not produced a sample.
describe("T64 drilldown is scoped to the current run", () => {
  const SPAWNED_B = {
    running: true,
    run: {
      pid: 9001,
      folder: "runB_20260810-030000",
      model: "Qwen3.6-35B-APEX",
      label: null,
      langs: "js",
      attempts: 1,
      n: 1,
      temperature: 0.6,
      started: new Date().toISOString(),
      url: "http://localhost:8081",
    },
  };

  it("shows no task rows from the previous run while a new one warms", async () => {
    // Run A's detail is loaded and full of records; run B has just spawned
    // and has no results.json yet.
    installFetch({ current: SPAWNED_B });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    // T80 changed the warming state from an empty pane to the run's full
    // queue, so the guard is now "no RESULTS from run A" rather than "no
    // rows" — every row must be queued, with no scored figure anywhere.
    const rows = screen.queryAllByTestId("bench-task-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const cell of screen.queryAllByTestId("bench-task-mean")) {
      expect(
        cell.textContent,
        "the previous run's scores must not appear under a warming run",
      ).toMatch(/queued|skipped|—/);
    }
    expect(screen.queryAllByTestId("bench-cell-solved")).toHaveLength(0);
    // The Score card is the same class of surface: it means "this run".
    expect(
      screen.getByTestId("bench-task-avg").textContent,
      "the previous run's score must not be attributed to the warming run",
    ).toContain("—");
  });

  it("does not carry an open drilldown's content across a run change", async () => {
    installFetch();
    const { rerender } = render(<BenchPage />);

    // Open a drilldown under run A on a RECORDED task (queued roster rows
    // have nothing to expand), and only once A's data has actually loaded.
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId("bench-task-mean")
          .some((c) => /\d/.test(c.textContent ?? "")),
      ).toBe(true),
    );
    const rowsA = await screen.findAllByTestId("bench-task-row");
    const recorded = rowsA.find((r) =>
      r.textContent?.includes(benchRun.records[0].task),
    )!;
    fireEvent.click(recorded);
    await waitFor(() =>
      expect(screen.getByTestId("bench-canary")).toBeTruthy(),
    );

    // Run B spawns: warming, no file of its own yet.
    installFetch({ current: SPAWNED_B });
    rerender(<BenchPage />);

    // The process-state probe runs on its own interval, so run B's arrival
    // is not synchronous with the rerender. Since T80, run B shows its full
    // queue rather than an empty pane, so the assertion is that A's expanded
    // FAILURE DETAIL is gone — not that the table is empty.
    await waitFor(
      () =>
        expect(
          screen.queryByTestId("bench-canary"),
          "run A's drilldown content must not survive into run B",
        ).toBeNull(),
      { timeout: 8000 },
    );
    for (const cell of screen.queryAllByTestId("bench-task-mean")) {
      expect(cell.textContent).toMatch(/queued|skipped|—/);
    }
  }, 15000);
});

// T63 — UI copy is sentence-cased.
//
// These strings came from prose inside the spec prompts, which are written in
// a lowercase-first style; that style was quoted verbatim into real UI copy.
// The design file is NOT a complete audit source — several of these strings
// never appeared in it — so the rendered page is the reference.
describe("T63a copy is sentence-cased (byte-exact)", () => {
  const cases: Array<[string, RegExp]> = [
    // Shortened by T84: at 3 and 4 wrapped lines these two hints were half
    // the card's height and pushed Start off a 1080p viewport. The full
    // wording moved to each field's tooltip; the sentence-casing T63 guards
    // is unchanged.
    ["Model ID hint", /^Blank = trust the server$/],
    ["Benchmark Alias hint", /^Optional — names this run$/],
    ["URL hint", /^Defaults to the configured llama-server$/],
    [
      "Languages hint",
      /^Click to toggle · struck through = toolchain unavailable$/,
    ],
  ];
  for (const [name, re] of cases) {
    it(`${name}`, async () => {
      installFetch();
      render(<BenchPage />);
      await waitFor(() => expect(screen.getByText(re)).toBeTruthy());
    });
  }

  it("temperature hint, in all three of its states", async () => {
    setActiveModel({ temperature: 0.6 });
    installFetch();
    const { unmount } = render(<BenchPage />);
    await waitFor(() =>
      expect(
        screen.getByText(
          /^Inherited from the active model · click to override$/,
        ),
      ).toBeTruthy(),
    );
    unmount();

    setActiveModel({ temperature: null });
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/^No active model — sent explicitly$/),
      ).toBeTruthy(),
    );
  });

  // Byte-exact copy, amended by T103: a finished run says so. The stopped
  // wording still exists and is asserted for a run that ended mid-flight.
  it("health strip, finished-run state", async () => {
    installFetch();
    render(<BenchPage />);
    const strip = await screen.findByTestId("bench-pacing");
    await waitFor(() => expect(strip.textContent).toMatch(/^Run finished — /));
  });

  it("hero warming text", async () => {
    installFetch({
      current: {
        running: true,
        run: {
          pid: 1,
          folder: "w_1",
          model: "m",
          label: null,
          langs: "js",
          attempts: 1,
          n: 1,
          temperature: 0.6,
          started: new Date().toISOString(),
          url: "http://localhost:8081",
        },
      },
      noDetail: true,
      runs: [],
    });
    render(<BenchPage />);
    const w = await screen.findByTestId("bench-warming");
    expect(w.textContent).toMatch(
      /^First sample in progress — no results file yet\./,
    );
  });
});

// T63b — the backstop. Catches whatever the list above missed.
describe("T63b no unexpected lowercase-first copy", () => {
  /**
   * Everything here is a deliberate exception, not an oversight:
   *  - technical identifiers whose casing is part of their correctness
   *  - brief data-label fragments that annotate a value rather than read
   *    as prose ("of 15 graded", "est. 3m")
   *  - bench.py's own stdout, which this page renders verbatim
   */
  const ALLOW = [
    /^bench\.py\b/, // bench.py output, bench.py output appears here…
    /^bench_dir\b/, // the unset-path chip names the setting first
    /^runs\//, // run folder paths
    /^https?:\/\//, // urls
    /^--/, // CLI flags
    /^[a-z]+\/[a-z0-9_]+$/, // task ids: js/formula_engine
    /^(js|ts|java|gdscript|py|doc)$/, // language codes
    /^(info|warn|error)$/, // console level filters
    /^x̄/, // the task-mean symbol
    /^(of|edition|localbench|tasks?|on task|set it in Settings)$/,
    /^est\. /, // "est. 3m 17s" — a value annotation, not a sentence
    /^(queued|skipped)$/, // roster-row state labels, not sentences
    /^(solved|failed|in progress|timeout\/format|on retry|server —)/, // strip legend fragments
    /^crashed \/ nothing runnable$/, // T70's legend entry, same class
    /^(current|previous) edition$/, // section headings (CSS-uppercased)
    /^mock \/ other server$/, // badge (CSS-uppercased)
    /^inspect prompt$/, // lead pill label
    /^no server answering at/, // T61's byte-exact banner — owned by that test
    /^at a mockserver\.$/, // tail fragment of that same banner, after <code>
    /^\d/, // anything starting with a number
  ];

  it("every rendered text node and tooltip starts uppercase or is allowlisted", async () => {
    installFetch();
    const { container } = render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );

    const offenders: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = (n.textContent ?? "").trim();
      if (!t || !/^[a-z]/.test(t)) continue;
      if (!ALLOW.some((re) => re.test(t))) offenders.push(t);
    }
    container.querySelectorAll("[title]").forEach((e) => {
      const t = (e.getAttribute("title") ?? "").trim();
      if (!t || !/^[a-z]/.test(t)) return;
      if (!ALLOW.some((re) => re.test(t))) offenders.push(t);
    });

    expect(
      [...new Set(offenders)],
      "lowercase-first copy that is not an allowlisted exception",
    ).toEqual([]);
  });
});

// ── Findings from the first real 35B run (T65-T71) ──────────────────────────

describe("T65 Model ID does not inherit a stale run's model", () => {
  it("defaults to the ACTIVE model, never the selected run's", async () => {
    // The loaded run's config.model is "buggy-model"; inheriting it is how a
    // real run came to be filed under a mock's name.
    setActiveModel({ model_path: "/m/Qwen3.6-35B-APEX-ICompact-Q3_K_L.gguf" });
    installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    await waitFor(() =>
      expect(field.value).toBe("Qwen3.6-35B-APEX-ICompact-Q3_K_L"),
    );
    expect(
      field.value,
      "a leftover value from an unrelated prior run must not be the default",
    ).not.toBe("buggy-model");
  });

  it("falls back to blank when no model is loaded", async () => {
    setActiveModel({ model_path: null, model_alias: null });
    installFetch();
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg").textContent).not.toContain(
        "—",
      ),
    );
    expect(field.value).toBe("");
  });

  it("accepts the real model name even when the server reports only an alias", async () => {
    // Every launch profile here sets --alias coder, so /v1/models names
    // nothing useful; warning on "not the alias" would fire on every
    // correctly-named run.
    setActiveModel({ model_path: "/m/Qwen3.6-35B-APEX-ICompact-Q3_K_L.gguf" });
    installFetch({
      ready: {
        ready: true,
        url: "http://localhost:8081",
        reason: "",
        models: ["coder"],
      },
    });
    render(<BenchPage />);
    await screen.findByTestId("bench-field-model");
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-field-model") as HTMLInputElement).value,
      ).toBe("Qwen3.6-35B-APEX-ICompact-Q3_K_L"),
    );
    expect(screen.queryByTestId("bench-model-mismatch")).toBeNull();
  });

  it("warns when Model ID is not what the target reports", async () => {
    installFetch({
      ready: {
        ready: true,
        url: "http://localhost:8081",
        reason: "",
        models: ["Qwen3.6-35B-APEX"],
      },
    });
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "looping-model" } });

    const warn = await screen.findByTestId("bench-model-mismatch");
    expect(warn.textContent).toContain("looping-model");
    expect(warn.textContent).toContain("Qwen3.6-35B-APEX");
  });

  it("stays quiet when the id matches, and when the field is blank", async () => {
    installFetch({
      ready: {
        ready: true,
        url: "http://localhost:8081",
        reason: "",
        models: ["Qwen3.6-35B-APEX"],
      },
    });
    render(<BenchPage />);
    const field = (await screen.findByTestId(
      "bench-field-model",
    )) as HTMLInputElement;
    expect(screen.queryByTestId("bench-model-mismatch")).toBeNull();
    fireEvent.change(field, { target: { value: "Qwen3.6-35B-APEX" } });
    await waitFor(() =>
      expect(screen.queryByTestId("bench-model-mismatch")).toBeNull(),
    );
  });
});

describe("T66 budget banner covers both cut-off mechanisms", () => {
  const withFlags = (
    shape: Array<{ truncated?: boolean; stopped_at_budget?: boolean }>,
  ) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    shape.forEach((f, i) => {
      if (!recs[i]) return;
      recs[i].truncated = !!f.truncated;
      recs[i].stopped_at_budget = !!f.stopped_at_budget;
    });
    return d;
  };

  it("fires on stopped_at_budget with the nudge-at remedy, not max-tokens", async () => {
    // The real run's shape: three budget cutoffs, NOT consecutive, and zero
    // `truncated`. A three-in-a-row rule over the combined flags would still
    // have shown nothing.
    installFetch({
      detail: withFlags([
        {},
        {},
        {},
        { stopped_at_budget: true },
        {},
        {},
        {},
        {},
        {},
        { stopped_at_budget: true },
        {},
        { stopped_at_budget: true },
      ]),
    });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-budget-banner");
    expect(banner.textContent).toContain("--nudge-at");
    expect(
      banner.textContent,
      "raising --max-tokens does nothing for a client-side cutoff",
    ).not.toMatch(/Raise <?-?-?max-tokens/);
    expect(banner.textContent).toContain("3");
    expect(screen.queryByTestId("bench-truncation-banner")).toBeNull();
  });

  it("still fires the max-tokens remedy for server-side truncation", async () => {
    installFetch({
      detail: withFlags([
        { truncated: true },
        { truncated: true },
        { truncated: true },
      ]),
    });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-truncation-banner");
    expect(banner.textContent).toContain("--max-tokens");
    expect(screen.queryByTestId("bench-budget-banner")).toBeNull();
  });

  it("shows each remedy when both mechanisms occurred", async () => {
    installFetch({
      detail: withFlags([
        { truncated: true },
        { truncated: true },
        { truncated: true },
        { stopped_at_budget: true },
      ]),
    });
    render(<BenchPage />);
    expect(
      (await screen.findByTestId("bench-truncation-banner")).textContent,
    ).toContain("--max-tokens");
    expect(
      (await screen.findByTestId("bench-budget-banner")).textContent,
    ).toContain("--nudge-at");
  });
});

describe("T69 both remedies name a control this page has", () => {
  it("exposes --max-tokens and --nudge-at as real fields", async () => {
    installFetch();
    render(<BenchPage />);
    for (const id of ["bench-field-max-tokens", "bench-field-nudge-at"]) {
      const el = (await screen.findByTestId(id)) as HTMLInputElement;
      expect(el.tagName).toBe("INPUT");
      expect(el.readOnly).toBe(false);
    }
    const nudge = screen.getByTestId(
      "bench-field-nudge-at",
    ) as HTMLInputElement;
    expect(nudge.value, "bench.py's own default").toBe("16384");
  });
});

describe("T67 the suite-drift canary ignores crashed records", () => {
  const asStatus = (status: string, ran: number, expected: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const r = (d as { records: Record<string, unknown>[] }).records[0];
    r.status = status;
    r.tests_total = ran;
    r.tests_expected = expected;
    r.solved = false;
    return d;
  };

  it("says nothing when a crash cut the assertion count short", async () => {
    // The real run: java/glob_matcher errored after 59 of 128 assertions and
    // was reported as SUITE DRIFT. A crash explains the low count by itself.
    installFetch({ detail: asStatus("error", 59, 128) });
    render(<BenchPage />);
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
    const canary = await screen.findByTestId("bench-canary");
    expect(
      canary.textContent,
      "a crashed record's count is evidence of the crash, not of drift",
    ).not.toMatch(/SUITE DRIFT/);
  });

  it("still shouts when a completed record disagrees with the suite", async () => {
    installFetch({ detail: asStatus("fail", 32, 35) });
    render(<BenchPage />);
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
    const canary = await screen.findByTestId("bench-canary");
    expect(canary.textContent).toMatch(/SUITE DRIFT/);
  });
});

describe("T70 error is distinguishable from fail", () => {
  it("renders its own cell state and legend entry", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    recs[0].status = "error";
    recs[0].solved = false;
    recs[1].status = "fail";
    recs[1].solved = false;
    installFetch({ detail: d });
    render(<BenchPage />);

    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-cell-state="error"]').length,
      ).toBeGreaterThan(0),
    );
    expect(
      document.querySelectorAll('[data-cell-state="miss"]').length,
    ).toBeGreaterThan(0);
    // Both appear in the legend, so the distinction is readable.
    expect(screen.getByText("crashed / nothing runnable")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
  });
});

describe("T71 flaky is unmeasurable at --n 1", () => {
  it("renders a dash, not a zero, when there is one sample per task", async () => {
    // The shared fixture is --n 3; this case needs a single-sample run.
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { config: Record<string, unknown> }).config.n = 1;
    installFetch({ detail: d });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg").textContent).not.toContain(
        "—",
      ),
    );
    expect(
      screen.getByTestId("bench-flaky").textContent,
      "one sample per task cannot disagree with itself",
    ).toContain("—");
  });

  it("computes a real count when --n is 2 or more", async () => {
    installFetch(); // the shared fixture is --n 3
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-flaky").textContent).not.toContain("—"),
    );
  });
});

// T75 — a run started after mount must appear on its own.
//
// The runs list was fetched once per mount, and auto-select searches that
// list for the spawned run's folder, so it searched a list that could never
// grow. On a real 33-minute run the page sat at "No samples recorded yet"
// with a dashed footer the whole way, until someone pressed Refresh.
describe("T75 the live view populates without a manual refresh", () => {
  const SPAWNED = {
    running: true,
    run: {
      pid: 7001,
      folder: "late_20260810-010000",
      model: "Qwen3.6-35B",
      label: null,
      langs: "js",
      attempts: 1,
      n: 1,
      temperature: 0.2,
      started: new Date().toISOString(),
      url: "http://localhost:8081",
    },
  };

  it("picks up a run that only appears in a LATER poll of the list", async () => {
    // The list is empty at mount and gains the spawned run afterwards —
    // exactly what happens when you click Start and bench.py writes its
    // first sample minutes later.
    let listCalls = 0;
    const late = runRow({
      run_id: "late-run",
      folder: SPAWNED.run.folder,
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai/settings"))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ llama_server_url: "http://localhost:8081" }),
        } as Response);
      if (url.includes("/api/bench/ready"))
        return okJson({
          ready: true,
          url: "http://localhost:8081",
          reason: "",
          models: [],
        });
      if (url.includes("/api/bench/check")) return okJson(CHECK);
      if (url.includes("/api/bench/tasks")) return okJson(TASK_LIST);
      if (url.includes("/api/launch/profiles")) return okJson({ profiles: [] });
      if (url.includes("/api/bench/current")) return okJson(SPAWNED);
      if (url.includes("/api/bench/runs/")) {
        // The detail must carry the SAME run_id the list row has, or the
        // page cannot tell that what it loaded is the spawned run.
        const d = JSON.parse(JSON.stringify(benchRun)) as { run_id: string };
        d.run_id = "late-run";
        return okJson(d);
      }
      if (url.includes("/api/bench/runs")) {
        listCalls += 1;
        // Empty on the first read, present from the second onwards.
        return okJson(listCalls === 1 ? [] : [late]);
      }
      return okJson({});
    }) as unknown as typeof fetch;

    render(<BenchPage />);

    // Warming first: nothing of its own on disk yet.
    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );

    // …then, with no remount and no Refresh click, the run's own RESULTS
    // arrive. Row count no longer proves this: since T80 the roster renders
    // rows immediately, all of them queued. A scored figure only appears
    // once the spawned run's detail has actually been loaded.
    await waitFor(
      () =>
        expect(
          screen
            .queryAllByTestId("bench-task-mean")
            .some((c) => /\d/.test(c.textContent ?? "")),
          "a run started after mount must load its own results unaided",
        ).toBe(true),
      { timeout: 15000 },
    );
    expect(
      listCalls,
      "the list must be re-read, not fetched once",
    ).toBeGreaterThan(1);
    // The list poll is 5s, so this test must outlive vitest's 5s default.
  }, 20000);

  it("stops polling the list on unmount", async () => {
    const calls = installFetch();
    const { unmount } = render(<BenchPage />);
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/runs"))).toBe(true),
    );
    unmount();
    const after = calls.filter((c) => c.includes("/api/bench/runs")).length;
    await new Promise((r) => setTimeout(r, 1200));
    expect(
      calls.filter((c) => c.includes("/api/bench/runs")).length,
      "an unmounted hook must not keep polling",
    ).toBe(after);
  });
});

// T77 — points are denominated in attempts, so a guessed denominator states
// something about the run that nothing has established yet.
describe("T77 warming-phase denominator comes from the run's own config", () => {
  it("shows the spawned run's attempts, not a default of 3", async () => {
    installFetch({
      current: {
        running: true,
        run: {
          pid: 8001,
          folder: "att1_20260810-020000",
          model: "Qwen3.6-35B",
          label: null,
          langs: "js",
          attempts: 1,
          n: 1,
          temperature: 0.2,
          started: new Date().toISOString(),
          url: "http://localhost:8081",
        },
      },
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    const avg = screen.getByTestId("bench-task-avg").textContent ?? "";
    expect(avg, "a --attempts 1 run is scored out of 1").toContain("/ 1");
    expect(avg).not.toContain("/ 3");
  });

  it("renders a dash rather than guessing when nothing knows the attempts", async () => {
    installFetch({ noDetail: true, runs: [] });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg").textContent).toContain("—"),
    );
    expect(screen.getByTestId("bench-task-avg").textContent).not.toContain(
      "/ 3",
    );
  });
});

// T78 — one alias/model convention across every surface.
//
// History put the ALIAS in the primary position and the real model in an
// unlabelled secondary; the hero does the opposite. Two surfaces showing the
// same two facts in opposite orders is worse than either order chosen once.
describe("T78 hero, History and Compare agree on alias vs model", () => {
  const labelled = () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { models: string[] }).models = ["livecap"];
    (d as { config: { model: string } }).config.model = "Qwen3.6-35B-APEX";
    return d;
  };

  it("puts the real model first and labels the alias, in hero AND History", async () => {
    const d = labelled();
    installFetch({
      detail: d,
      runs: [runRow({ models: ["livecap"], config: d.config })],
    });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-hero-model").textContent).toContain(
        "Qwen3.6-35B-APEX",
      ),
    );
    expect(screen.getByTestId("bench-hero-alias").textContent).toContain(
      "Benchmark Alias",
    );

    fireEvent.click(screen.getByTestId("bench-tab-hist"));
    const name = await screen.findByTestId("bench-run-name");
    // Real model leads.
    expect(name.textContent).toMatch(/^Qwen3\.6-35B-APEX/);
    // Alias follows, and says what it is.
    expect(screen.getByTestId("bench-run-alias").textContent).toContain(
      "Benchmark Alias: livecap",
    );
    expect(
      name.textContent,
      "the alias must not occupy the primary position",
    ).not.toMatch(/^livecap/);
  });

  it("renders one value with no dangling separator when there is no alias", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { models: string[] }).models = ["buggy-model"];
    (d as { config: { model: string } }).config.model = "buggy-model";
    installFetch({ detail: d, runs: [runRow({ models: ["buggy-model"] })] });
    render(<BenchPage />);

    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    const name = await screen.findByTestId("bench-run-name");
    await waitFor(() => expect(name.textContent).toContain("buggy-model"));
    expect(screen.queryByTestId("bench-run-alias")).toBeNull();
    expect(name.textContent).not.toContain("·");
  });
});

// T83 — the footer draws the design's bars, not a line.
//
// A line through the 1-2 points a run has early on is one long diagonal
// across the whole strip, which is what the screenshots showed. Bars degrade
// honestly. Also guards the shared-series bug found here: Samples/hr and
// Elapsed were plotting the identical array.
describe("T83 footer sparklines", () => {
  const withRecords = (n: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    (d as { records: unknown[] }).records = recs.slice(0, n);
    return d;
  };

  it("renders one bar per data point, not a path", async () => {
    installFetch({ detail: withRecords(5) });
    render(<BenchPage />);
    // Addressed by series name, not index: an index silently follows any
    // reordering of the strip (T90 replaced one slot) and the failure then
    // looks like a data bug rather than a moved column.
    const spark = (name: string) =>
      document.querySelector(`[data-series="${name}"]`);
    await waitFor(() =>
      expect(spark("Elapsed")?.querySelectorAll("i")).toHaveLength(5),
    );
    const sparks = document.querySelectorAll('[data-testid="bench-spark"]');
    expect(sparks).toHaveLength(5); // one per footer stat
    // One bar per record. data-points counts only the FINITE values — the
    // mock fixture's gen_seconds are ~0, so most rates are null and would
    // understate the bar count.
    expect(spark("Elapsed")?.querySelectorAll("i")).toHaveLength(5);
  });

  it("draws nothing rather than a misleading shape with no points", async () => {
    installFetch({ noDetail: true, runs: [] });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-footer-gen-speed").textContent).toBe(
        "—",
      ),
    );
    expect(
      document.querySelectorAll('[data-testid="bench-spark-bar"]').length,
      "an empty series must not draw bars",
    ).toBe(0);
  });

  it("gives Samples/hr its own series, not a copy of Elapsed's", async () => {
    installFetch({ detail: withRecords(6) });
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-testid="bench-spark-bar"]').length,
      ).toBeGreaterThan(0),
    );
    const sparks = [
      ...document.querySelectorAll('[data-testid="bench-spark"]'),
    ];
    const heights = (el: Element) =>
      [...el.querySelectorAll("i")].map((i) => (i as HTMLElement).style.height);
    // index 1 = Samples/hr, index 3 = Elapsed. Elapsed is cumulative and so
    // monotonically rising; samples-per-hour is a rate and is not.
    expect(
      heights(sparks[1]).join(","),
      "Samples/hr must not be a copy of the Elapsed series",
    ).not.toBe(heights(sparks[3]).join(","));
  });
});

// T85 — the selected run's detail must keep polling across a failed read.
//
// The reported cause (fetched once, never re-polled) did NOT match source:
// the effect already recurses at RUN_POLL_MS and already stops on
// `live == {}`. The real freeze is the error path — the old catch returned
// without rescheduling, so one slow read (results.json grows through a run,
// and getJson aborts at 8s) permanently ended the recursion while the run
// carried on.
describe("T85 detail polling survives a transient read failure", () => {
  const liveDetail = (done: number, task: string) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: task,
      current_attempt: 1,
      done,
      total: 27,
      run_elapsed: done * 60,
      heartbeat: new Date().toISOString(),
    };
    return d;
  };

  it("recovers and keeps advancing after a failed detail fetch", async () => {
    let detailCalls = 0;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai/settings"))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ llama_server_url: "http://localhost:8081" }),
        } as Response);
      if (url.includes("/api/bench/ready"))
        return okJson({ ready: true, url: "", reason: "", models: [] });
      if (url.includes("/api/bench/check")) return okJson(CHECK);
      if (url.includes("/api/bench/tasks")) return okJson(TASK_LIST);
      if (url.includes("/api/launch/profiles")) return okJson({ profiles: [] });
      if (url.includes("/api/bench/current"))
        return okJson({ running: false, run: null });
      if (url.includes("/api/bench/runs/")) {
        detailCalls += 1;
        // 1st ok, 2nd fails (the slow-read abort), 3rd shows progress.
        if (detailCalls === 2) return Promise.reject(new Error("aborted"));
        return okJson(liveDetail(detailCalls === 1 ? 15 : 16, "java/x"));
      }
      if (url.includes("/api/bench/runs")) return okJson([runRow()]);
      return okJson({});
    }) as unknown as typeof fetch;

    render(<BenchPage />);
    // Reaching 16/27 REQUIRES surviving the failed second fetch: the third
    // response is the only one that reports it. Asserting the intermediate
    // 15/27 would just race the 2s poll.
    await waitFor(
      () =>
        expect(
          screen.getByTestId("bench-progress-tiles").textContent,
          "a transient read failure must not stop the detail poll",
        ).toContain("16/27"),
      { timeout: 15000 },
    );
    expect(
      detailCalls,
      "the failed read must have been passed through, not skipped",
    ).toBeGreaterThan(2);
  }, 20000);

  it("stops polling once the payload reports the run finished", async () => {
    const calls = installFetch(); // fixture has live == {}
    render(<BenchPage />);
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/runs/"))).toBe(true),
    );
    const settled = calls.filter((c) => c.includes("/api/bench/runs/")).length;
    await new Promise((r) => setTimeout(r, 2600)); // > RUN_POLL_MS
    expect(
      calls.filter((c) => c.includes("/api/bench/runs/")).length,
      "a finished run must not be re-read forever",
    ).toBe(settled);
  });
});

// T79 — a warning about the PREVIOUS run is worse than a stale number.
//
// T64 scoped the drilldown and the ScoreCard to the current run; the
// record-derived WARNINGS were not reached. A fresh run showed "5 samples
// were cut off" from its predecessor while reporting 0 samples of its own.
describe("T79 record-derived warnings are scoped to the current run", () => {
  const withBudgetStops = () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    [0, 2, 4].forEach((i) => {
      if (recs[i]) recs[i].stopped_at_budget = true;
    });
    return d;
  };
  const SPAWNED_B = {
    running: true,
    run: {
      pid: 9100,
      folder: "runB_20260810-110000",
      model: "Qwen3.6-35B",
      label: null,
      langs: "js",
      attempts: 1,
      n: 1,
      temperature: 0.2,
      started: new Date().toISOString(),
      url: "http://localhost:8081",
    },
  };

  it("shows no budget banner while a new run has no records of its own", async () => {
    // Run A (loaded, has budget stops) + run B just spawned.
    installFetch({ detail: withBudgetStops(), current: SPAWNED_B });
    render(<BenchPage />);

    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    expect(
      screen.queryByTestId("bench-budget-banner"),
      "the previous run's budget stops are not this run's problem",
    ).toBeNull();
  });

  it("still shows it for the run that actually hit the budget", async () => {
    installFetch({ detail: withBudgetStops() });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-budget-banner");
    expect(banner.textContent).toContain("3");
  });

  // The siblings that share the same source.
  it("suppresses the truncation banner during warming too", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    [0, 1, 2].forEach((i) => {
      if (recs[i]) recs[i].truncated = true;
    });
    installFetch({ detail: d, current: SPAWNED_B });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    expect(screen.queryByTestId("bench-truncation-banner")).toBeNull();
  });

  it("suppresses a carried-over server-error banner during warming", async () => {
    // An INTERRUPTED previous run keeps a non-empty `live`, so its
    // consecutive_server_errors would otherwise leak into the new run.
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/x",
      done: 3,
      total: 27,
      consecutive_server_errors: 2,
    };
    installFetch({ detail: d, current: SPAWNED_B });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-warming")).toBeTruthy(),
    );
    expect(screen.queryByTestId("bench-server-banner")).toBeNull();
  });
});

// T80 — the table shows the whole roster from the first render.
//
// It used to grow row by row out of `groupByTask(records)`, so a 27-task run
// displayed 1 row at 45s while the hero already said "27 of 27" — two
// surfaces disagreeing about the same fact. `pending` was already a defined
// CellState with no producer.
describe("T80 Tasks & Runs renders the full task roster", () => {
  it("renders every task in the run's scope before any record exists", async () => {
    // A spawned run, warming: no results.json of its own yet.
    installFetch({
      current: {
        running: true,
        run: {
          pid: 9200,
          folder: "roster_20260810-120000",
          model: "Qwen3.6-35B",
          label: null,
          langs: "js",
          attempts: 1,
          n: 1,
          temperature: 0.2,
          started: new Date().toISOString(),
          url: "http://localhost:8081",
        },
      },
      noDetail: true,
      runs: [],
    });
    render(<BenchPage />);

    // TASK_LIST declares 4 js tasks; the run selected js only.
    await waitFor(() =>
      expect(screen.queryAllByTestId("bench-task-row")).toHaveLength(4),
    );
    // Queued, not zeroed — a 0.00 reads as a scored result.
    const means = screen.queryAllByTestId("bench-task-mean");
    for (const m of means) {
      expect(m.textContent).toMatch(/queued|skipped/);
      expect(m.textContent).not.toContain("0.00");
    }
    expect(
      screen.queryAllByTestId("bench-cell-pending").length,
    ).toBeGreaterThan(0);
  });

  it("keeps the row count stable as records arrive", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId("bench-task-mean")
          .some((c) => /\d/.test(c.textContent ?? "")),
      ).toBe(true),
    );
    // The fixture's run covers js; its rows are the roster's, not the
    // records' — so scored and queued rows coexist at a constant count.
    expect(screen.queryAllByTestId("bench-task-row")).toHaveLength(4);
  });

  it("marks a task whose toolchain is missing as skipped, not queued", async () => {
    // CHECK reports gdscript unavailable.
    installFetch({
      current: {
        running: true,
        run: {
          pid: 9201,
          folder: "gd_20260810-130000",
          model: "m",
          label: null,
          langs: "gdscript",
          attempts: 1,
          n: 1,
          temperature: 0.2,
          started: new Date().toISOString(),
          url: "http://localhost:8081",
        },
      },
      noDetail: true,
      runs: [],
      taskList: {
        tasks: [
          { id: "gdscript/turn_queue", lang: "gdscript" },
          { id: "gdscript/cooldowns", lang: "gdscript" },
        ],
      },
    });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.queryAllByTestId("bench-task-row")).toHaveLength(2),
    );
    for (const m of screen.queryAllByTestId("bench-task-mean")) {
      expect(m.textContent).toBe("skipped");
    }
  });
});

// T74 — plain-language status. "Heartbeat" is polling vocabulary: it says how
// the page knows, not what is happening.
describe("T74 run status in plain language", () => {
  const liveDetail = (heartbeatAgeMs: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/formula_engine",
      current_attempt: 1,
      done: 3,
      total: 12,
      run_elapsed: 120,
      heartbeat: new Date(Date.now() - heartbeatAgeMs).toISOString(),
    };
    return d;
  };

  it("running: green dot, and the label says so", async () => {
    installFetch({ detail: liveDetail(4000) });
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() => expect(el.getAttribute("data-status")).toBe("running"));
    expect(el.textContent).toMatch(/^Running · updated \d+s ago$/);
  });

  // Amended by T94. This used a 106s-old heartbeat, which was "stale" only
  // under the superseded 90s constant. The heartbeat is refreshed when a
  // sample is saved, so 106s is an ordinary task in progress, not a wedged
  // run. The stalled STATE is still asserted — with an age past any plausible
  // sample — and T94's own tests assert the healthy-slow direction.
  it("stalled: says the run may be stuck, not 'stale'", async () => {
    installFetch({ detail: liveDetail(1_800_000) });
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() => expect(el.getAttribute("data-status")).toBe("stalled"));
    expect(el.textContent).toMatch(/No update for \d+s — the run may be stuck/);
  });

  it("finished: reports what happened", async () => {
    installFetch(); // fixture's live == {}
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() =>
      expect(el.getAttribute("data-status")).toBe("finished"),
    );
    expect(el.textContent).toMatch(/^Run finished · \d+ samples in /);
  });

  it("idle is grey and normal, never an error", async () => {
    installFetch({ noDetail: true, runs: [] });
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() => expect(el.getAttribute("data-status")).toBe("idle"));
    expect(el.textContent).toBe("Not running");
  });

  // Backstop, on RENDERED OUTPUT ONLY. A source-text assertion would flag the
  // data contract's own field name and would be the wrong test.
  it("no user-visible text or tooltip says 'heartbeat'", async () => {
    installFetch({ detail: liveDetail(4000) });
    const { container } = render(<BenchPage />);
    // Wait for the PACING branch that carried the jargon. Waiting only for
    // the status element made this vacuous: it exists before the detail
    // loads, so the median-based health line never rendered and the sweep
    // walked a DOM that could not contain the string it was looking for.
    await waitFor(() =>
      expect(screen.getByTestId("bench-pacing").textContent).toMatch(
        /Median for this task/,
      ),
    );

    const offenders: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (/heartbeat/i.test(n.textContent ?? ""))
        offenders.push((n.textContent ?? "").trim().slice(0, 60));
    }
    container.querySelectorAll("[title]").forEach((e) => {
      if (/heartbeat/i.test(e.getAttribute("title") ?? ""))
        offenders.push(
          "TITLE: " + (e.getAttribute("title") ?? "").slice(0, 60),
        );
    });
    expect(offenders, "polling vocabulary must not reach the user").toEqual([]);
  });
});

// T82 — ON TASK must not name a task that has already finished.
//
// bench.py sets current_task when a sample STARTS (1769) and writes
// results.json when it ENDS (1874), so at save time the field names the
// sample that just completed. Option 1 was chosen: show it only when a
// sample is genuinely in flight, matching this page's honest-unknown
// pattern — a live monitoring page exists to say what is happening NOW.
describe("T82 ON TASK reflects what is actually running", () => {
  const detailWith = (currentTask: string) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: currentTask,
      current_attempt: 1,
      done: 2,
      total: 27,
      run_elapsed: 162,
      heartbeat: new Date().toISOString(),
    };
    return d;
  };

  // Amended by T98. This asserted the literal "Between samples" — a label
  // that named nothing and, at `--n 1` (the default and the reported case),
  // was the tile's PERMANENT state, because `inFlight` can never be true
  // there. Meanwhile the line below it claimed "5m 27s on task", so the card
  // told two opposite stories. The invariant T82 actually protects is that a
  // task the table has already scored is not presented as running, and that
  // is what is asserted here now.
  it("does not present a task that already has a completed record", async () => {
    const finished = benchRun.records[0].task; // has a record in the fixture
    installFetch({ detail: detailWith(finished) });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toContain("Last completed"));
    expect(
      tiles.textContent,
      "a scored task cannot also be in flight",
    ).not.toContain(`On task${finished}`);
  });

  it("still names a genuinely in-flight task", async () => {
    // A roster task with no record yet.
    installFetch({ detail: detailWith("js/interval_set_unrecorded") });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toContain("On task"));
    expect(tiles.textContent).toContain("js/interval_set_unrecorded");
  });
});

// T86 — a run that is still going is not "interrupted".
describe("T86 History distinguishes running from interrupted", () => {
  const unfinished = () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/unrecorded",
      done: 15,
      total: 27,
      heartbeat: new Date().toISOString(),
    };
    return d;
  };

  it("shows the live run as running, with no Resume", async () => {
    const d = unfinished();
    installFetch({ detail: d, runs: [runRow({ finished: false })] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));

    await waitFor(() =>
      expect(screen.getByTestId("bench-run-running")).toBeTruthy(),
    );
    expect(
      screen.queryByTestId("bench-resume"),
      "resuming a live run would spawn a second process on the same directory",
    ).toBeNull();
    expect(screen.queryByTestId("bench-interrupted")).toBeNull();
  });

  it("shows the same file as interrupted, with Resume, once it is not live", async () => {
    // Identical shape, no liveness: live == {} and no process state.
    installFetch({
      runs: [runRow({ finished: false })],
      current: { running: false, run: null },
    });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));

    await waitFor(() =>
      expect(screen.getByTestId("bench-interrupted")).toBeTruthy(),
    );
    expect(screen.getByTestId("bench-resume")).toBeTruthy();
  });
});

// T90 — the footer's fifth slot reports something that moves.
describe("T90 footer shows Remaining, not an always-zero error count", () => {
  it("replaces the Server errors slot", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-footer-remaining")).toBeTruthy(),
    );
    expect(screen.queryByTestId("bench-footer-server-errors")).toBeNull();
  });

  it("dashes rather than guessing when no run is active", async () => {
    installFetch({ noDetail: true, runs: [] });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-footer-remaining").textContent).toBe(
        "—",
      ),
    );
  });

  it("leaves the server-excluded tile and hero banner alone", async () => {
    // Regression guard: this was a footer swap, not a removal of the count.
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/x",
      done: 1,
      total: 27,
      consecutive_server_errors: 2,
      heartbeat: new Date().toISOString(),
    };
    installFetch({ detail: d });
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-server-banner")).toBeTruthy(),
    );
    expect(screen.getByTestId("bench-server-excluded")).toBeTruthy();
  });
});

// ── T92 — Compare's per-slot dropdowns ──────────────────────────────────────
//
// Supersedes the chip cloud (T88 desync, T91 dead end). The chips drew from
// `runs` while the columns came from `storedDetails`, and only the 8 most
// recent runs got a chip — so a selection outside that window had no control
// to undo it. These assert the control and the columns are the same thing.
describe("T92 Compare per-slot dropdowns", () => {
  const openCompare = async (runs: unknown[]) => {
    installFetch({ runs });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-cmp"));
    await screen.findByTestId("bench-compare-slot-0");
  };
  const slot = (i: number) =>
    screen.getByTestId(`bench-compare-slot-${i}`) as HTMLSelectElement;
  const columnIds = () =>
    screen
      .queryAllByTestId("bench-compare-col")
      .map((el) => el.getAttribute("data-run-id"));
  const selections = () => [0, 1, 2].map((i) => slot(i).value).filter(Boolean);
  const threeRuns = () => [
    runRow(),
    runRow({ run_id: "r2" }),
    runRow({ run_id: "r3" }),
  ];

  it("renders exactly the columns the dropdowns select", async () => {
    await openCompare(threeRuns());
    await waitFor(() => expect(columnIds().length).toBeGreaterThan(0));
    // Set equality, not a count: the desync showed the right NUMBER of
    // columns for the wrong runs.
    expect(new Set(columnIds())).toEqual(new Set(selections()));
  });

  it("shows the default selection in the dropdowns, never as hidden state", async () => {
    await openCompare(threeRuns());
    await waitFor(() => expect(selections().length).toBeGreaterThanOrEqual(2));
    expect(new Set(columnIds())).toEqual(new Set(selections()));
  });

  it("'— none —' empties that slot and removes its column", async () => {
    await openCompare(threeRuns());
    await waitFor(() => expect(columnIds()).toHaveLength(3));
    const removed = slot(2).value;

    fireEvent.change(slot(2), { target: { value: "" } });

    await waitFor(() => expect(columnIds()).not.toContain(removed));
    expect(new Set(columnIds())).toEqual(new Set(selections()));
  });

  it("disables an option whose --attempts conflicts, and gives the reason", async () => {
    await openCompare([
      runRow(),
      runRow({ run_id: "r2" }),
      runRow({
        run_id: "odd",
        config: { ...benchRun.config, attempts: 99 },
      }),
    ]);
    await waitFor(() => expect(selections().length).toBeGreaterThanOrEqual(2));

    const opt = [...slot(0).options].find((o) => o.value === "odd");
    expect(opt, "the conflicting run should still be listed").toBeDefined();
    expect(opt!.disabled).toBe(true);
    expect(opt!.textContent).toContain("different --attempts");
  });

  it("stays changeable while a refusal is displayed", async () => {
    // T91: an ineligible selection became a dead end needing a page reload.
    await openCompare(threeRuns());
    await waitFor(() => expect(columnIds()).toHaveLength(3));

    fireEvent.change(slot(2), { target: { value: "" } });
    fireEvent.change(slot(1), { target: { value: "" } });
    await screen.findByTestId("bench-compare-refusal");

    const back = [...slot(1).options].find(
      (o) => o.value && o.value !== slot(0).value,
    );
    fireEvent.change(slot(1), { target: { value: back!.value } });

    await waitFor(() =>
      expect(screen.queryByTestId("bench-compare-refusal")).toBeNull(),
    );
  });

  it("still refuses an ineligible selection that reaches the table (T87)", async () => {
    // Disabled options make this rare, not impossible — restored state or a
    // deep link can still arrive ineligible, so the backstop must remain.
    await openCompare([
      runRow(),
      runRow({ run_id: "x", suite_hash: "other99" }),
    ]);

    fireEvent.change(slot(1), { target: { value: "x" } });

    const refusal = await screen.findByTestId("bench-compare-refusal");
    expect(refusal.textContent).toMatch(/suite editions/);
  });
});

// ── Regression — a poll must not close an open drilldown ────────────────────
//
// Roster rows (T80) render BEFORE the run's detail exists, so a click can be
// keyed to the placeholder run ("none"). When the real run id arrived the
// drilldown was dropped as though the run had changed, collapsing an
// expanded task under the user. Gated rather than timing-dependent: the
// canary tests hit this intermittently, which is not a guard.
describe("an open drilldown survives its own run's data arriving", () => {
  it("keeps the expanded task when detail lands after the click", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const rec = (d as { records: Record<string, unknown>[] }).records[0];
    rec.status = "fail";
    rec.tests_total = 32;
    rec.tests_expected = 35;
    rec.solved = false;

    installFetch({ detail: d });
    const inner = global.fetch as unknown as (
      i: RequestInfo | URL,
    ) => Promise<Response>;
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (/\/api\/bench\/runs\/[^/?]+$/.test(String(input))) await gate;
      return inner(input);
    }) as unknown as typeof global.fetch;

    render(<BenchPage />);
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);

    release();

    // Assert the drilldown's CONTENT, not merely that a node exists: the
    // canary is what the expanded row was opened to show.
    const canary = await screen.findByTestId("bench-canary");
    expect(
      canary.textContent,
      "the run's own detail arriving is not a run change — the drilldown must survive it",
    ).toMatch(/SUITE DRIFT/);
  });
});

// ── T96 — resume must reproduce the run's recorded conditions ───────────────
//
// bench.py's `_check_resume_compatible` exits when the resumed run's
// temperature differs from the recorded one, and since localbench -129 `None`
// is one of the values it compares. Sending no temperature therefore killed
// every resume of a dashboard-started run, all of which record a concrete
// value because the backend's validate() demands one.
describe("T96 resume forwards the conditions bench.py compares", () => {
  const resumeBody = () => {
    const calls = (
      global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls;
    const call = calls.find(([u]) => String(u).includes("/api/bench/resume"));
    return call ? JSON.parse(String(call[1].body)) : null;
  };

  const resumeRunWith = async (config: Record<string, unknown>) => {
    installFetch({
      runs: [runRow({ run_id: "r1", finished: false, config })],
    });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    fireEvent.click(await screen.findByTestId("bench-resume"));
    await waitFor(() => expect(resumeBody()).not.toBeNull());
    return resumeBody();
  };

  it("sends the temperature the run recorded", async () => {
    const body = await resumeRunWith({
      ...benchRun.config,
      temperature: 0.2,
    });
    expect(
      body.temperature,
      "bench.py exits if the resumed temperature differs from the recorded one",
    ).toBe(0.2);
  });

  it("keeps a run recorded WITHOUT a temperature distinct from one at 0", async () => {
    // The inverse bug: collapsing null to 0 refuses just as hard, because
    // bench.py treats unset and greedy as different conditions.
    const body = await resumeRunWith({
      ...benchRun.config,
      temperature: null,
    });
    expect(body.temperature).toBeNull();
    expect(body.temperature).not.toBe(0);
  });

  it("sends a deliberate 0 as 0, not as absent", async () => {
    const body = await resumeRunWith({ ...benchRun.config, temperature: 0 });
    expect(body.temperature).toBe(0);
    expect(body.temperature).not.toBeNull();
  });

  it("also forwards the time settings the same guard compares", async () => {
    const body = await resumeRunWith({
      ...benchRun.config,
      temperature: 0.2,
      time_budget: 15,
      time_step: 30,
    });
    expect(body.time_budget).toBe(15);
    expect(body.time_step).toBe(30);
  });
});

// A resume bench.py refuses must say so. The response used to be discarded,
// so the run simply never appeared and the reason stayed in the Console tab.
describe("T96 a refused resume surfaces bench.py's reason", () => {
  it("raises an alert carrying the exit text", async () => {
    installFetch({
      runs: [runRow({ run_id: "r1", finished: false })],
    });
    const inner = global.fetch as unknown as (
      i: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/bench/resume")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              error:
                "--resume: that run used --temperature 0.2, this one has no --temperature.",
            }),
        } as Response);
      }
      return inner(input, init);
    }) as unknown as typeof global.fetch;

    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    fireEvent.click(await screen.findByTestId("bench-resume"));

    await waitFor(() =>
      expect(
        addAlert.mock.calls.some(([, , msg]) =>
          String(msg).includes("--temperature 0.2"),
        ),
        "the user must see why bench.py refused, not a run that never appears",
      ).toBe(true),
    );
  });
});

// ── T93 — an unfiltered run must not read as "no languages selected" ────────
//
// bench.py records a no-filter run as `config.langs: []`, and `[].join(",")`
// is `""` — which `??` accepts. The form therefore read a full-suite run as
// nothing selected, painted every toggle off, and then sent no filter, which
// bench.py treats as "every language" (bench.py:233). The loop closed: a
// full-suite run produced another full-suite run while claiming to be
// filtered.
describe("T93 languages seeded from an unfiltered run", () => {
  const FOUR_TRACKS = {
    ...CHECK,
    tracks: [
      { lang: "js", tasks: 4, available: true, reason: "" },
      { lang: "ts", tasks: 7, available: true, reason: "" },
      { lang: "java", tasks: 8, available: true, reason: "" },
      {
        lang: "gdscript",
        tasks: 8,
        available: false,
        reason: "godot not on PATH",
      },
    ],
  };
  const unfilteredRun = () => ({
    ...benchRun,
    config: { ...benchRun.config, langs: [] as string[] },
  });
  const pressed = (lang: string) =>
    screen.getByTestId(`bench-lang-${lang}`).getAttribute("aria-pressed");

  const mountUnfiltered = async () => {
    installFetch({ detail: unfilteredRun(), check: FOUR_TRACKS });
    render(<BenchPage />);
    // This used to wait for the selected run's config to land — the fixture's
    // `n: 3` against the form's default of 1 — because the seeding bug only
    // appeared once `detail` was in play. T99 removed the run's config from
    // the startup chain entirely, so there is nothing to wait for: the
    // toggles are seeded from the available languages and cannot be darkened
    // by a stored run at all. The user-visible guarantee this file exists to
    // protect — an unfiltered run never reads as "no languages selected" —
    // is still asserted below; the pathway that broke it is gone.
    await screen.findByTestId("bench-lang-js");
  };

  it("renders every available toggle pressed, not dark", async () => {
    await mountUnfiltered();
    expect(pressed("js")).toBe("true");
    expect(pressed("ts")).toBe("true");
    expect(pressed("java")).toBe("true");
  });

  it("deselecting one leaves the others pressed", async () => {
    // The absence half: the fix must not simply force every toggle on.
    await mountUnfiltered();
    fireEvent.click(screen.getByTestId("bench-lang-ts"));
    await waitFor(() => expect(pressed("ts")).toBe("false"));
    expect(pressed("js")).toBe("true");
    expect(pressed("java")).toBe("true");
  });

  it("sends exactly the selected languages", async () => {
    await mountUnfiltered();
    fireEvent.click(screen.getByTestId("bench-lang-ts"));
    await waitFor(() => expect(pressed("ts")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: /Start run/ }));

    await waitFor(() => {
      const calls = (
        global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls;
      const start = calls.find(([u]) => String(u).includes("/api/bench/start"));
      expect(start, "Start must have posted").toBeTruthy();
      const sent = JSON.parse(String(start![1].body)).langs as string;
      expect(sent.split(",").sort()).toEqual(["java", "js"]);
    });
  });

  it("refuses to start with nothing selected, visibly", async () => {
    // An empty --langs would run the WHOLE suite, so this must never reach
    // the wire.
    await mountUnfiltered();
    for (const l of ["js", "ts", "java"]) {
      fireEvent.click(screen.getByTestId(`bench-lang-${l}`));
    }
    await waitFor(() => expect(pressed("js")).toBe("false"));

    expect(screen.getByTestId("bench-no-langs")).toBeTruthy();
    const start = screen.getByRole("button", {
      name: /Start run/,
    }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    fireEvent.click(start);
    const calls = (
      global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls;
    expect(
      calls.some(([u]) => String(u).includes("/api/bench/start")),
      "an empty filter must never be sent",
    ).toBe(false);
  });
});

// ── T94 — a slow task is not a stuck run ───────────────────────────────────
//
// bench.py refreshes the heartbeat only when a sample is SAVED, so its age is
// the in-flight sample's duration. The old 90s constant therefore fired on
// every task slower than 90s — most of this suite — while the Progress card
// on the same screen called the run merely "over median".
describe("T94 stuck detection paces against the task", () => {
  const runningDetail = (heartbeatAgeMs: number, taskSeconds: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    // Give the task a history so the median is real, the same source the
    // Progress card compares against.
    (d as { records: Record<string, unknown>[] }).records = (
      d as { records: Record<string, unknown>[] }
    ).records.map((r) => ({
      ...r,
      task: "js/formula_engine",
      seconds: taskSeconds,
    }));
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/formula_engine",
      current_attempt: 1,
      done: 16,
      total: 27,
      run_elapsed: 3000,
      task_elapsed: 327,
      heartbeat: new Date(Date.now() - heartbeatAgeMs).toISOString(),
    };
    return d;
  };

  it("a healthy run slower than the old constant reads as running", async () => {
    // The reported case: 150s since the last sample, on a ~200s task.
    installFetch({ detail: runningDetail(150_000, 200) });
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() => expect(el.getAttribute("data-status")).toBe("running"));
    expect(
      el.textContent,
      "a task slower than the threshold is not evidence of a wedged run",
    ).not.toMatch(/may be stuck/);
  });

  it("a genuinely wedged run is still called out", async () => {
    // Half an hour without a sample on a ~200s task is not slowness.
    installFetch({ detail: runningDetail(1_800_000, 200) });
    render(<BenchPage />);
    const el = await screen.findByTestId("bench-run-status");
    await waitFor(() => expect(el.getAttribute("data-status")).toBe("stalled"));
    expect(el.textContent).toMatch(/may be stuck/);
  });

  it("never says 'stuck' while Progress says the task is merely over median", async () => {
    // One fixture, both surfaces: this is the contradiction T94 reported.
    installFetch({ detail: runningDetail(150_000, 200) });
    render(<BenchPage />);
    const status = await screen.findByTestId("bench-run-status");
    await waitFor(() =>
      expect(status.getAttribute("data-status")).toBe("running"),
    );
    const overMedian = screen.queryByText(/over median/);
    if (overMedian) {
      expect(
        status.textContent,
        "Progress and the status line must not give opposite verdicts",
      ).not.toMatch(/may be stuck/);
    }
  });
});

// ── T95 — BUDGET must not be stamped on a truncation-tainted sample ────────
//
// The banner counts samples bench.py actually stopped at --nudge-at; the
// badges mark every sample from the first trigger onward. Both are correct,
// but labelling a server-truncated sample BUDGET sends the reader to
// --nudge-at when --max-tokens is the flag that matters.
describe("T95 taint badges name their own mechanism", () => {
  const ROSTER_TASKS = TASK_LIST.tasks.map((t) => t.id);
  const withRecords = (over: Array<Record<string, unknown>>) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const recs = (d as { records: Record<string, unknown>[] }).records;
    (d as { records: Record<string, unknown>[] }).records = over.map(
      (o, i) => ({
        ...recs[Math.min(i, recs.length - 1)],
        // Roster-driven rows (T80): a record for a task the roster does not
        // list renders no row, and therefore no badge.
        task: ROSTER_TASKS[i],
        sample: 1,
        truncated: false,
        stopped_at_budget: false,
        ...o,
      }),
    );
    return d;
  };
  const badges = () => screen.queryAllByTestId("bench-taint-badge");

  it("labels a truncation-only run TRUNCATED, never BUDGET", async () => {
    installFetch({
      detail: withRecords([
        {},
        { truncated: true },
        { truncated: true },
        { truncated: true },
      ]),
    });
    render(<BenchPage />);
    await waitFor(() => expect(badges().length).toBeGreaterThan(0));

    for (const b of badges()) {
      expect(
        b.textContent,
        "a server-truncated sample is not a budget stop",
      ).not.toBe("BUDGET");
      expect(b.getAttribute("data-taint")).toBe("truncation");
    }
    expect(badges()[0].getAttribute("title")).toMatch(/--max-tokens/);
  });

  it("labels a budget stop BUDGET, with its own remedy", async () => {
    installFetch({
      detail: withRecords([{}, { stopped_at_budget: true }, {}]),
    });
    render(<BenchPage />);
    await waitFor(() => expect(badges().length).toBeGreaterThan(0));

    const budget = badges().filter(
      (b) => b.getAttribute("data-taint") === "budget",
    );
    expect(budget.length).toBeGreaterThan(0);
    expect(budget[0].textContent).toBe("BUDGET");
    const title = budget[0].getAttribute("title") ?? "";
    expect(title).toMatch(/--nudge-at/);
    expect(title, "the budget remedy must not point at --max-tokens").toMatch(
      /--max-tokens does not affect this/,
    );
  });

  it("leaves rows before any trigger unbadged", async () => {
    installFetch({ detail: withRecords([{}, {}, {}]) });
    render(<BenchPage />);
    await screen.findAllByTestId("bench-task-row");
    expect(badges()).toHaveLength(0);
  });

  it("banner counts stops while badges count everything scored under the cap", async () => {
    // The reported 7-vs-15 gap, in miniature: one stop, three marked rows.
    installFetch({
      detail: withRecords([{}, { stopped_at_budget: true }, {}, {}]),
    });
    render(<BenchPage />);
    const banner = await screen.findByTestId("bench-budget-banner");

    expect(banner.textContent).toMatch(/\b1\b/);
    await waitFor(() => expect(badges()).toHaveLength(3));
    // Contagion explanation moved from banner to badge tooltip (T111) so it
    // lives beside the badge it describes. Verify it is still on screen.
    const budgetBadge = await screen.findAllByTestId("bench-taint-badge");
    const budgetTitle = budgetBadge.find(
      (b) => b.getAttribute("data-taint") === "budget",
    );
    expect(
      budgetTitle?.getAttribute("title"),
      "the gap between the two numbers must be explained in the badge tooltip",
    ).toMatch(/every task from the first stop onward/i);
  });
});

// ── T97 — the footer's two numbers must be reconcilable ────────────────────
//
// REMAINING 23m 51s beside SAMPLES/HR 16.5 with 11 samples left implied ~40m:
// the bar contradicted itself. NOTE: this is an invariant guard, not the
// red-first one — `installFetch` serves the same detail for every run id, so
// a fixture's live run and its own history cannot diverge here. The
// red-first proof for the estimator lives in bench.compute.test.ts (T97).
describe("T97 footer REMAINING agrees with its own SAMPLES/HR", () => {
  // Parsed by hand rather than by pattern: "12m 30s" is two tokens, and every
  // regex spelling of it trips the super-linear-backtracking rule.
  const secondsFromLabel = (text: string) => {
    let total = 0;
    for (const token of text.split(" ")) {
      const value = parseInt(token, 10);
      if (Number.isNaN(value)) continue;
      if (token.endsWith("m")) total += value * 60;
      else if (token.endsWith("s")) total += value;
    }
    return total;
  };

  it("the two agree within a stated tolerance on a live run", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const ids = TASK_LIST.tasks.map((t) => t.id);
    (d as { records: Record<string, unknown>[] }).records = ids
      .slice(0, 3)
      .map((task) => ({
        ...(d as { records: Record<string, unknown>[] }).records[0],
        task,
        sample: 1,
        status: "pass",
        seconds: 30,
        truncated: false,
        stopped_at_budget: false,
      }));
    (d as { config: Record<string, unknown> }).config = {
      ...(d as { config: Record<string, unknown> }).config,
      langs: ["js", "java"],
      n: 1,
    };
    // `created` drives wall-clock elapsed for a live run since T106, so a
    // fixture dated days ago would report an elapsed measured in days and a
    // rate of ~0. A live run's created stamp is by definition recent.
    (d as { created: string }).created = new Date(
      Date.now() - 90_000,
    ).toISOString();
    (d as { live: Record<string, unknown> }).live = {
      current_task: ids[3],
      current_attempt: 1,
      done: 3,
      total: ids.length,
      run_elapsed: 90,
      heartbeat: new Date().toISOString(),
    };
    installFetch({ detail: d });
    render(<BenchPage />);

    const remaining = await screen.findByTestId("bench-footer-remaining");
    const rate = await screen.findByTestId("bench-footer-samples-hr");
    await waitFor(() =>
      expect(secondsFromLabel(remaining.textContent ?? "")).toBeGreaterThan(0),
    );

    const left = TASK_LIST.tasks.length - 3;
    const perHour = Number(/[\d.]+/.exec(rate.textContent ?? "")?.[0] ?? 0);
    expect(
      perHour,
      "the footer must report a rate to compare against",
    ).toBeGreaterThan(0);
    const impliedSeconds = (left / perHour) * 3600;
    const shown = secondsFromLabel(remaining.textContent ?? "");

    // Tolerance, and why: the remaining tasks are the slow tail, so REMAINING
    // may legitimately exceed the flat rate's implication — what it must not
    // do is fall far BELOW it, which is the contradiction that was reported.
    expect(
      shown,
      `REMAINING ${shown}s is far below the run's own pace (${Math.round(impliedSeconds)}s)`,
    ).toBeGreaterThanOrEqual(impliedSeconds * 0.75);
  });
});

// ── T98 — the two Progress elements must tell one story ────────────────────
//
// Cadence, verified against a RUNNING benchmark and not only from source:
// over 90 seconds of active generation, current_task, task_elapsed, done,
// current_attempt and heartbeat were all frozen. results.json is written once
// per sample, at its end (bench.py:1775), so nothing in `live` moves between
// saves and no surface may claim live knowledge of the sample in progress.
describe("T98 the on-task tiles agree", () => {
  const RUNNING = {
    running: true,
    run: {
      pid: 4242,
      // Must match the runs-list row for the selected detail, or the page
      // treats this as a freshly spawned run still warming up (T79) and
      // scopes the live blob away.
      folder: "seedA_20260808-223558",
      model: "qwen",
      label: null,
      langs: "js,ts,java,gdscript",
      attempts: 3,
      n: 1,
      started: new Date().toISOString(),
    },
  };

  // One saved record for `task`, so per-task completeness is unambiguous.
  const liveAt = (task: string, n = 1) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const first = (d as { records: Record<string, unknown>[] }).records[0];
    (d as { records: Record<string, unknown>[] }).records = [
      { ...first, task, sample: 1, status: "pass", seconds: 327 },
    ];
    (d as { config: Record<string, unknown> }).config = {
      ...(d as { config: Record<string, unknown> }).config,
      n,
    };
    (d as { live: Record<string, unknown> }).live = {
      current_task: task,
      current_attempt: 1,
      done: 1,
      total: 27,
      run_elapsed: 400,
      task_elapsed: 327,
      heartbeat: new Date().toISOString(),
    };
    return d;
  };

  it("at --n 1 does not say 'on task' about a finished sample", async () => {
    // The reported contradiction: "Between samples —" beside "5m 27s on task".
    installFetch({ detail: liveAt("js/retry_backoff"), current: RUNNING });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toContain("Last completed"));

    await waitFor(() =>
      expect(screen.queryByText(/last sample took/)).toBeTruthy(),
    );
    expect(
      screen.queryByText(/on task/),
      "the card must not claim a live position it cannot know",
    ).toBeNull();
  });

  it("names the task it last completed rather than nothing at all", async () => {
    installFetch({ detail: liveAt("js/retry_backoff"), current: RUNNING });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    // Wait on the VALUE, not the label: "Last completed" is also the label
    // before any detail has loaded, so waiting on it races the fixture.
    await waitFor(() =>
      expect(
        tiles.textContent,
        "the tile had no true value to show at --n 1; it must show what IS known",
      ).toContain("js/retry_backoff"),
    );
  });

  it("at --n 3 a task with 1 of 3 samples saved still reads as in flight", async () => {
    // T82's original case, which must stay green: per-task completeness, not
    // "is it the newest record".
    installFetch({ detail: liveAt("js/retry_backoff", 3), current: RUNNING });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toContain("On task"));
    expect(tiles.textContent).toContain("js/retry_backoff");
    expect(screen.queryByText(/on task/)).toBeTruthy();
  });

  // Amended by T107. This used a populated run with `current_task: ""` and
  // expected "—". A finished run's live block is empty, and blanking the tile
  // then hid the most certain fact on the card — the last completed task is
  // simply the final record. The dash now means what it says: nothing has
  // been recorded at all.
  it("says nothing at all when the run has recorded nothing", async () => {
    const d = liveAt("js/retry_backoff");
    (d as { records: unknown[] }).records = [];
    (d as { live: Record<string, unknown> }).live = {
      ...(d as { live: Record<string, unknown> }).live,
      current_task: "",
    };
    installFetch({ detail: d, current: RUNNING });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    // "Last completed" only shows after something completes. With no records
    // the label is the neutral "Task" and the value is em-dash (T98).
    await waitFor(() => expect(tiles.textContent).toContain("Task"));
    expect(tiles.textContent).toContain("\u2014");
  });
});

// ── T100 — the panel explains the failure instead of showing its passes ────
describe("T100 the why-it-failed panel states the mode", () => {
  const cutOff = (over: Record<string, unknown> = {}) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const first = (d as { records: Record<string, unknown>[] }).records[0];
    (d as { records: Record<string, unknown>[] }).records = [
      {
        ...first,
        task: "js/retry_backoff",
        sample: 1,
        status: "error",
        solved: false,
        first_failed: [],
        tests_passed: 28,
        tests_failed: 0,
        tests_total: 28,
        tests_expected: 77,
        truncated: false,
        stopped_at_budget: true,
        detail: "PASS left ass\nPASS right\nPASS third",
        ...over,
      },
    ];
    return d;
  };

  const openDrilldown = async () => {
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
  };

  it("gives a reason rather than a window of PASS lines", async () => {
    installFetch({ detail: cutOff() });
    render(<BenchPage />);
    await openDrilldown();

    const reason = await screen.findByTestId("bench-failure-reason");
    expect(reason.textContent).toMatch(/crashed before the tests finished/i);
    // 77 declared, 28 ran: the single most explanatory number available.
    expect(
      (await screen.findByTestId("bench-unreached")).textContent,
    ).toContain("49");
  });

  it("labels the excerpt as the start of the log, not the explanation", async () => {
    installFetch({ detail: cutOff() });
    render(<BenchPage />);
    await openDrilldown();
    const label = await screen.findByTestId("bench-detail-excerpt-label");
    expect(label.textContent).toMatch(/start of the log/i);
  });

  it("names --nudge-at, not --max-tokens, for a budget stop", async () => {
    installFetch({ detail: cutOff() });
    render(<BenchPage />);
    await openDrilldown();
    const history = await screen.findByTestId("bench-failure-history");
    expect(history.textContent).toMatch(/--nudge-at/);
    expect(history.textContent).toMatch(/--max-tokens does not affect this/);
  });

  it("STICKY FLAG: a real failure list is still shown, with no cut-off message", async () => {
    installFetch({
      detail: cutOff({
        status: "fail",
        first_failed: ["expects 2 + 2 to equal 4"],
        stopped_at_budget: true,
      }),
    });
    render(<BenchPage />);
    await openDrilldown();

    await waitFor(() =>
      expect(screen.queryByText(/expects 2 \+ 2 to equal 4/)).toBeTruthy(),
    );
    expect(
      screen.queryByTestId("bench-failure-reason"),
      "a sample that failed on merit must not be reported as cut off",
    ).toBeNull();
  });

  it("leaves the canary alone: a crashed record stays green", async () => {
    installFetch({ detail: cutOff() });
    render(<BenchPage />);
    await openDrilldown();
    const canary = await screen.findByTestId("bench-canary");
    expect(canary.textContent).not.toMatch(/SUITE DRIFT/);
  });
});

// ── T99 — Run Setup opens on localbench's defaults ─────────────────────────
//
// The form was `override ?? detail?.config?.<field> ?? literal`, and a run is
// selected by default, so the middle tier won on every fresh mount: the form
// opened on whatever the last run happened to use.
describe("T99 Run Setup defaults and reset", () => {
  const DIVERGENT = {
    ...benchRun.config,
    label: "seedZ",
    attempts: 9,
    n: 7,
    max_tokens: 999,
    nudge_at: 42,
    langs: ["gdscript"],
  };
  const divergentRun = () => ({ ...benchRun, config: DIVERGENT });
  const val = (id: string) =>
    (screen.getByTestId(id) as HTMLInputElement).value;

  const mountWithDivergentRun = async () => {
    const calls = installFetch({ detail: divergentRun() });
    render(<BenchPage />);
    await screen.findByTestId("bench-field-attempts");
    // The run's detail must actually have been fetched before asserting, or
    // this would pass against the old chain simply by running first.
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/bench/runs/"))).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByTestId("bench-task-avg")).toBeTruthy(),
    );
  };

  it("shows the defaults, not the selected run's settings", async () => {
    await mountWithDivergentRun();
    expect(val("bench-field-attempts"), "bench.py --attempts default").toBe(
      "3",
    );
    expect(val("bench-field-n"), "bench.py --n default").toBe("1");
    expect(val("bench-field-max-tokens")).toBe("0");
    expect(val("bench-field-nudge-at")).toBe("16384");
    expect(val("bench-field-label")).toBe("");
  });

  it("restores every field, not just one", async () => {
    // A reset that misses a field is the likely failure, so each is asserted.
    await mountWithDivergentRun();
    fireEvent.change(screen.getByTestId("bench-field-attempts"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByTestId("bench-field-n"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("bench-field-max-tokens"), {
      target: { value: "512" },
    });
    fireEvent.change(screen.getByTestId("bench-field-nudge-at"), {
      target: { value: "99" },
    });
    fireEvent.change(screen.getByTestId("bench-field-label"), {
      target: { value: "mine" },
    });
    fireEvent.click(screen.getByTestId("bench-lang-js"));
    await waitFor(() => expect(val("bench-field-attempts")).toBe("8"));

    fireEvent.click(screen.getByTestId("bench-action-reset-to-defaults"));

    await waitFor(() => expect(val("bench-field-attempts")).toBe("3"));
    expect(val("bench-field-n")).toBe("1");
    expect(val("bench-field-max-tokens")).toBe("0");
    expect(val("bench-field-nudge-at")).toBe("16384");
    expect(val("bench-field-label")).toBe("");
    expect(
      screen.getByTestId("bench-lang-js").getAttribute("aria-pressed"),
      "the language toggles are part of the form and must reset too",
    ).toBe("true");
  });

  it("keeps the three documented exceptions after a reset", async () => {
    // Reverting these to bench.py's table would re-open closed bugs: a blank
    // model filed a 35-minute run under the wrong name (T65), and the
    // dashboard knows the real server address where bench.py only guesses.
    await mountWithDivergentRun();
    fireEvent.click(screen.getByTestId("bench-action-reset-to-defaults"));

    await waitFor(() =>
      expect(val("bench-field-temperature"), "from the active model").toBe(
        "0.6",
      ),
    );
    expect(val("bench-url-field"), "the configured llama-server").toContain(
      "8081",
    );
  });

  it("cannot be reset while a run is active", async () => {
    installFetch({
      detail: divergentRun(),
      current: {
        running: true,
        run: {
          pid: 1,
          folder: "seedA_20260808-223558",
          model: "m",
          label: null,
          langs: "js",
          attempts: 3,
          n: 1,
          started: new Date().toISOString(),
        },
      },
    });
    render(<BenchPage />);
    const btn = (await screen.findByTestId(
      "bench-action-reset-to-defaults",
    )) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ── T102 — `nudged` is a COUNT, so a bare `&&` renders the digit ───────────
//
// bench.py writes `"nudged": sam.nudges_total` (`:1760`), but types.ts
// declared it boolean. `0 && <FlagChip/>` evaluates to `0`, which React
// prints — an unlabelled digit beside STOPPED AT BUDGET.
describe("T102 the nudged flag chip", () => {
  const withNudged = (nudged: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const first = (d as { records: Record<string, unknown>[] }).records[0];
    (d as { records: Record<string, unknown>[] }).records = [
      {
        ...first,
        task: "js/retry_backoff",
        sample: 1,
        status: "fail",
        solved: false,
        first_failed: ["expects 2 + 2 to equal 4"],
        nudged,
      },
    ];
    return d;
  };
  const flagRow = async () => {
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
    return (await screen.findByTestId("bench-drill-flags")).textContent ?? "";
  };

  it("renders no digit and no chip at zero", async () => {
    installFetch({ detail: withNudged(0) });
    render(<BenchPage />);
    const text = await flagRow();
    expect(text, "0 must not leak into the flag row").not.toMatch(/0/);
    expect(text).not.toMatch(/NUDGED/);
  });

  it("renders the chip when the model actually was nudged", async () => {
    // The absence half: suppressing the digit must not suppress the flag.
    installFetch({ detail: withNudged(2) });
    render(<BenchPage />);
    expect(await flagRow()).toMatch(/NUDGED/);
  });
});

// ── T103 — one run state, one name ─────────────────────────────────────────
//
// A completed 27/27 run showed "Stopped" (hero pill), "Run finished" (status
// line) and "Run stopped" (health strip) at the same time. The pill came from
// llama.cpp's StatusIndicator driven by a boolean, and a boolean cannot say
// "finished" — nor tell an idle page from a completed run.
describe("T103 terminal run states agree across surfaces", () => {
  const finishedRun = () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {}; // bench.py: clean end
    return d;
  };
  const interruptedRun = () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    // A live block that survived the end means it stopped mid-flight.
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/retry_backoff",
      done: 3,
      total: 27,
      run_elapsed: 120,
      heartbeat: new Date().toISOString(),
    };
    return d;
  };

  it("a completed run reads finished on all three surfaces", async () => {
    installFetch({ detail: finishedRun() });
    render(<BenchPage />);
    const pill = await screen.findByTestId("bench-state-pill");
    await waitFor(() =>
      expect(pill.getAttribute("data-kind")).toBe("finished"),
    );
    expect(pill.textContent).toBe("Finished");
    expect((await screen.findByTestId("bench-run-status")).textContent).toMatch(
      /Run finished/,
    );
    expect((await screen.findByTestId("bench-pacing")).textContent).toMatch(
      /Run finished/,
    );
  });

  it("a run with a live block still reads running, not finished", async () => {
    // The likely regression is making every terminal run read "finished".
    // Note what the page CAN and cannot tell apart: `isRunning` treats any
    // populated live block as running (T35 — a CLI-started run known only
    // through results.json must read as running), and bench.py empties that
    // block on a clean finish. So "aborted" is not a state the hero can
    // detect; History draws it, by comparing a stored row against the run
    // actually in flight (T86). What is asserted here is that a run still
    // holding a live block is never called finished.
    installFetch({ detail: interruptedRun() });
    render(<BenchPage />);
    const pill = await screen.findByTestId("bench-state-pill");
    await waitFor(() =>
      expect(["running", "stalled"]).toContain(pill.getAttribute("data-kind")),
    );
    expect(pill.textContent).not.toMatch(/finished/i);
    expect((await screen.findByTestId("bench-pacing")).textContent).not.toMatch(
      /Run finished/,
    );
  });

  it("an idle page reads neither finished nor stopped", async () => {
    // The distinction the boolean collapsed: no run selected is not a run
    // that ended.
    installFetch({
      runs: [],
      detail: { ...benchRun, summary: null, live: {} },
    });
    render(<BenchPage />);
    const pill = await screen.findByTestId("bench-state-pill");
    await waitFor(() => expect(pill.getAttribute("data-kind")).toBe("idle"));
    expect(pill.textContent).not.toMatch(/finished|stopped/i);
  });

  it("leaves the llama.cpp StatusIndicator out of it", async () => {
    // That component is shared with the server page, where its vocabulary is
    // correct. Bench maps its own kinds instead of widening it.
    installFetch({ detail: finishedRun() });
    render(<BenchPage />);
    await screen.findByTestId("bench-state-pill");
    expect(document.body.textContent).not.toMatch(/\bStarting\b|\bLoading\b/);
  });
});

// ── T104 — the cross-edition banner only when editions are crossed ─────────
describe("T104 History cross-edition banner", () => {
  const runAt = (hash: string, id: string) =>
    runRow({ run_id: id, suite_hash: hash, folder: `f_${id}` });

  it("stays silent when every run is one edition", async () => {
    installFetch({ runs: [runAt("e293ad7", "r1"), runAt("e293ad7", "r2")] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    // Wait for the pane to actually render its rows before asserting the
    // banner's absence — `length >= 0` is true of every array and proves
    // nothing.
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-run-row").length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByTestId("bench-cross-edition"),
      "warning about mixed editions when there is only one is a false alarm",
    ).toBeNull();
  });

  it("warns, and names them, when editions really are mixed", async () => {
    installFetch({ runs: [runAt("e293ad7", "r1"), runAt("beef123", "r2")] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    const banner = await screen.findByTestId("bench-cross-edition");
    expect(banner.textContent).toMatch(/2 suite editions/);
    expect(banner.textContent).toMatch(/e293ad7/);
    expect(banner.textContent).toMatch(/beef123/);
  });
});

// The call site must actually pass the population — a compute-level test
// cannot see that, because it supplies the argument itself.
describe("T104 Compare's refusal reflects what history holds", () => {
  it("says there is no second run, not 'select two', when only one exists", async () => {
    installFetch({ runs: [runRow({ run_id: "solo", folder: "f_solo" })] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-cmp"));
    const refusal = await screen.findByTestId("bench-compare-refusal");
    await waitFor(() =>
      expect(refusal.textContent).toMatch(/only one stored run/i),
    );
    expect(
      refusal.textContent,
      "the reader cannot select a run that does not exist",
    ).not.toMatch(/select at least two/i);
  });
});

// ── T105 — Leads says what it cannot see, and stops pretending to rank ─────
describe("T105 the Leads header", () => {
  const leadsDetail = (records: Array<Record<string, unknown>>) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    const first = (d as { records: Record<string, unknown>[] }).records[0];
    (d as { records: Record<string, unknown>[] }).records = records.map(
      (r, i) => ({
        ...first,
        task: `js/task_${i}`,
        sample: 1,
        status: "fail",
        solved: false,
        first_failed: [],
        ...r,
      }),
    );
    return d;
  };
  const openLeads = async () => {
    fireEvent.click(await screen.findByTestId("bench-tab-leads"));
  };

  it("reports HOW MANY records it could not see", async () => {
    installFetch({
      detail: leadsDetail([{ first_failed: ["expects a"] }, {}, {}, {}]),
    });
    render(<BenchPage />);
    await openLeads();
    const note = await screen.findByTestId("bench-leads-skipped");
    // Three unsolved samples carry no failed assertion.
    expect(note.textContent).toMatch(/\b3\b/);
  });

  it("says nothing about exclusions when there are none", async () => {
    // The absence half: the caveat must not be permanent furniture.
    installFetch({
      detail: leadsDetail([
        { first_failed: ["expects a"] },
        { solved: true, status: "pass" },
      ]),
    });
    render(<BenchPage />);
    await openLeads();
    await screen.findByTestId("bench-tab-leads");
    expect(screen.queryByTestId("bench-leads-skipped")).toBeNull();
  });

  it("does not present a ranking built from one model", async () => {
    installFetch({ detail: leadsDetail([{ first_failed: ["expects a"] }]) });
    render(<BenchPage />);
    await openLeads();
    expect(
      (await screen.findByTestId("bench-leads-unranked")).textContent,
    ).toMatch(/not a ranking yet/i);
  });

  it("keeps the original discriminating-vs-defective reasoning", async () => {
    // Extend, do not replace: that sentence was well judged and is why the
    // list is called a lead list rather than a leaderboard.
    installFetch({ detail: leadsDetail([{ first_failed: ["expects a"] }]) });
    render(<BenchPage />);
    await openLeads();
    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /lead list, not a leaderboard/i,
      ),
    );
  });
});

// ── T106 + T107 — the live-vs-finished boundary ────────────────────────────
//
// `live.run_elapsed` only advances when a sample is saved, so ELAPSED moved
// in 3-6 minute jumps and everything derived from it inherited the staleness.
// The same boundary blanks LAST COMPLETED and ATTEMPT the moment a run ends,
// which is when both become most certain.
describe("T106 elapsed counts the time since the run started", () => {
  const liveRun = (savedSecondsAgo: number, runElapsed: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { created: string }).created = new Date(
      Date.now() - (runElapsed + savedSecondsAgo) * 1000,
    ).toISOString();
    (d as { live: Record<string, unknown> }).live = {
      current_task: "js/retry_backoff",
      current_attempt: 2,
      done: 3,
      total: 27,
      run_elapsed: runElapsed,
      task_elapsed: 40,
      heartbeat: new Date(Date.now() - savedSecondsAgo * 1000).toISOString(),
    };
    return d;
  };

  it("includes the time since the last save, not just up to it", async () => {
    // 600s of saved progress, then 150s generating with nothing written.
    installFetch({ detail: liveRun(150, 600) });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    // 12m 30s, not the frozen 10m.
    await waitFor(() =>
      expect(
        tiles.textContent,
        "elapsed must not freeze between sample saves",
      ).toMatch(/12m/),
    );
  });

  it("a finished run keeps its own recorded total", async () => {
    // The absence half: wall-clock must not keep running after the end.
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {};
    installFetch({ detail: d });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toMatch(/Elapsed/));
    // No regex: every spelling of "a digit followed by d" trips the
    // super-linear-backtracking rule, and "Elapsed" itself contains a d.
    const text = tiles.textContent ?? "";
    const showsDays = [...text].some(
      (ch, i) => ch === "d" && !Number.isNaN(Number.parseInt(text[i - 1], 10)),
    );
    expect(showsDays, "wall-clock must stop at the end of the run").toBe(false);
  });
});

describe("T107 terminal tiles keep reporting what is known", () => {
  it("a finished run still names its last completed task and attempt", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {};
    const recs = (d as { records: Record<string, unknown>[] }).records;
    const lastTask = recs[recs.length - 1].task as string;
    installFetch({ detail: d });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    await waitFor(() => expect(tiles.textContent).toContain(lastTask));
    expect(
      tiles.textContent,
      "the last task is MORE certain once the run ends, not less",
    ).not.toMatch(/Last completed—/);
  });
});

// ── T108 — a tile that cannot be measured says why ─────────────────────────
//
// Decision: KEEP both tiles and explain the inert one, rather than hiding it.
// Hiding would change the card's shape from run to run, and `Server excl.`
// reading 0 is a REAL measurement at any --n — unlike T90's always-zero slot.
// Keyed off the run's recorded --n, so a stored --n 3 run still shows both.
describe("T108 unmeasurable tiles explain themselves", () => {
  const runAtN = (n: number) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { config: Record<string, unknown> }).config = {
      ...(d as { config: Record<string, unknown> }).config,
      n,
    };
    return d;
  };

  it("at --n 1 the flaky tile says WHY it is n/a", async () => {
    installFetch({ detail: runAtN(1) });
    render(<BenchPage />);
    const tile = await screen.findByTestId("bench-flaky");
    await waitFor(() => expect(tile.textContent).toMatch(/n\/a/i));
    expect(tile.getAttribute("title")).toMatch(/--n 2 or more/);
    expect(
      tile.getAttribute("title"),
      "an absent measurement is not a measurement of zero",
    ).toMatch(/not zero flakiness/);
  });

  it("at --n 3 it measures, and drops the caveat", async () => {
    // The absence half, keyed off the RUN's config: a stored --n 3 run must
    // still show the metric even though the form may now say something else.
    installFetch({ detail: runAtN(3) });
    render(<BenchPage />);
    const tile = await screen.findByTestId("bench-flaky");
    await waitFor(() => expect(tile.textContent).not.toMatch(/n\/a/i));
    expect(tile.getAttribute("title")).not.toMatch(/--n 2 or more/);
  });

  it("keeps Server excl., whose 0 is a real result", async () => {
    installFetch({ detail: runAtN(1) });
    render(<BenchPage />);
    const tile = await screen.findByTestId("bench-server-excluded");
    expect(tile.getAttribute("title")).toMatch(/never answered/);
  });
});

// ── Consistency items ──────────────────────────────────────────────────────
describe("Bench consistency items", () => {
  it("SAMPLES keeps its n/total shape once the run ends", async () => {
    const d = JSON.parse(JSON.stringify(benchRun)) as Detail;
    (d as { live: Record<string, unknown> }).live = {};
    installFetch({ detail: d });
    render(<BenchPage />);
    const tiles = await screen.findByTestId("bench-progress-tiles");
    // Not a bare count: the tile changed shape mid-read, 26/27 then "27".
    await waitFor(() => expect(tiles.textContent).toMatch(/Samples\d+\/\d+/));
  });

  it("dates read the same way everywhere", async () => {
    // 8/11/2026 is ambiguous outside the US, and the header already used ISO.
    installFetch({ runs: [runRow()] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    const rows = await screen.findAllByTestId("bench-run-row");
    await waitFor(() =>
      expect(rows[0].textContent).toMatch(/\d{4}-\d{2}-\d{2}/),
    );
    expect(
      rows[0].textContent,
      "the ambiguous M/D/YYYY form should be gone",
    ).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("History says so when there are no runs, instead of showing a blank panel", async () => {
    installFetch({ runs: [] });
    render(<BenchPage />);
    fireEvent.click(await screen.findByTestId("bench-tab-hist"));
    const empty = await screen.findByTestId("bench-empty-pane");
    expect(empty.textContent).toMatch(/No stored runs yet/i);
  });

  it("Raw assertions says which unit it counts", async () => {
    installFetch();
    render(<BenchPage />);
    const tile = await screen.findByText("Raw assertions");
    const owner = tile.closest("[title]");
    expect(owner?.getAttribute("title")).toMatch(
      /different unit from Pass rate/i,
    );
  });
});

// ── T112 — Drilldown header branches correctly ─────────────────────────────
//
// The old code picked `records[0]` as "worst" regardless of status. If the
// first sample was a server error, the header said "why it failed" and the
// body showed server-error text — a non-sequitur. Now the header matches
// whichever branch applies.
describe("T112 drilldown header branch", () => {
  const TASK = "js/retry_backoff";

  const drilldownDetail = (rec: Record<string, unknown>) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as typeof benchRun;
    (d as { records: unknown[] }).records = [
      {
        ...(d as { records: Record<string, unknown>[] }).records[0],
        task: TASK,
        sample: 1,
        ...rec,
      },
    ];
    return d;
  };

  const openDrilldown = async () => {
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
  };

  it("says 'why it failed' when a non-server failing record exists", async () => {
    installFetch({
      detail: drilldownDetail({ status: "fail", solved: false, first_failed: ["assert x"] }),
    });
    render(<BenchPage />);
    await openDrilldown();
    const header = await screen.findByText(/why it failed/i);
    expect(header).toBeTruthy();
  });

  it("says 'endpoint did not answer' when all records are server errors", async () => {
    installFetch({
      detail: drilldownDetail({ status: "server", solved: false }),
    });
    render(<BenchPage />);
    await openDrilldown();
    const header = await screen.findByText(/endpoint did not answer/i);
    expect(header).toBeTruthy();
  });

  it("says 'attempt detail' when all records pass", async () => {
    installFetch({
      detail: drilldownDetail({ status: "pass", solved: true }),
    });
    render(<BenchPage />);
    await openDrilldown();
    const header = await screen.findByText(/attempt detail/i);
    expect(header).toBeTruthy();
  });
});

// ── T113 — passes-only blockquote suppressed when first_failed is non-empty ─
//
// bench.py stores detail[:400] (head of log); test runners print passes first,
// so the excerpt never contains the failing assertion. Suppress the blockquote
// when first_failed is non-empty; keep the raw/ pointer.
describe("T113 drilldown blockquote suppression", () => {
  const TASK = "js/retry_backoff";

  const drilldownDetail = (rec: Record<string, unknown>) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as typeof benchRun;
    (d as { records: unknown[] }).records = [
      {
        ...(d as { records: Record<string, unknown>[] }).records[0],
        task: TASK,
        sample: 1,
        status: "fail",
        solved: false,
        detail: "PASS a\nPASS b\nPASS c",
        ...rec,
      },
    ];
    return d;
  };

  const openDrilldown = async () => {
    const rows = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(rows[0]);
  };

  it("shows raw/ pointer instead of blockquote when first_failed is non-empty", async () => {
    installFetch({
      detail: drilldownDetail({ first_failed: ["assert x === y"] }),
    });
    render(<BenchPage />);
    await openDrilldown();
    const label = await screen.findByTestId("bench-detail-excerpt-label");
    expect(label.textContent).toMatch(/Full log in raw/i);
    // The blockquote with passes must not appear.
    expect(screen.queryByRole("blockquote")).toBeNull();
  });

  it("shows the blockquote when first_failed is empty", async () => {
    installFetch({
      detail: drilldownDetail({ first_failed: [] }),
    });
    render(<BenchPage />);
    await openDrilldown();
    // blockquote is rendered when first_failed is empty.
    await waitFor(() =>
      expect(document.querySelector("blockquote")).toBeTruthy(),
    );
  });
});

// ── T114 — BUDGET badge uses weaker tooltip when task still solved ──────────
//
// A task scored under the budget cap that still achieved full marks should get
// TAINT_BUDGET_PASS ("cap was in effect but nothing shows it changed the
// result") rather than the stronger "measures the cutoff" claim.
describe("T114 budget badge tooltip strength", () => {
  const ROSTER_TASKS = TASK_LIST.tasks.map((t) => t.id);

  const withBudget = (over: Record<string, unknown>[]) => {
    const d = JSON.parse(JSON.stringify(benchRun)) as typeof benchRun;
    (d as { records: Record<string, unknown>[] }).records = over.map(
      (o, i) => ({
        ...(d as { records: Record<string, unknown>[] }).records[
          Math.min(i, (d as { records: unknown[] }).records.length - 1)
        ],
        task: ROSTER_TASKS[i],
        sample: 1,
        stopped_at_budget: true,
        truncated: false,
        ...o,
      }),
    );
    return d;
  };

  it("uses the weaker tooltip when all budget-tainted rows still solved", async () => {
    installFetch({
      detail: withBudget([
        { solved: true, status: "pass" },
        { solved: true, status: "pass" },
      ]),
    });
    render(<BenchPage />);
    const badges = await screen.findAllByTestId("bench-taint-badge");
    const budgetBadge = badges.find(
      (b) => b.getAttribute("data-taint") === "budget",
    );
    expect(budgetBadge?.getAttribute("title")).toMatch(/scored full marks/i);
    expect(budgetBadge?.getAttribute("title")).not.toMatch(/measures the cutoff/i);
  });

  it("uses the stronger tooltip when some budget-tainted rows did not solve", async () => {
    installFetch({
      detail: withBudget([
        { solved: false, status: "fail" },
        { solved: false, status: "fail" },
      ]),
    });
    render(<BenchPage />);
    const badges = await screen.findAllByTestId("bench-taint-badge");
    const budgetBadge = badges.find(
      (b) => b.getAttribute("data-taint") === "budget",
    );
    expect(budgetBadge?.getAttribute("title")).toMatch(/measures the cutoff/i);
  });
});

// ── T119 — controlAction surfaces failures via addAlert ────────────────────
//
// The old post() discarded the response body, so a refused action (e.g., a
// bench.py skip on a finished run) was invisible. controlAction reads the JSON
// and calls addAlert when success is false.
describe("T119 controlAction error surfacing", () => {
  it("calls addAlert when a control endpoint returns success:false", async () => {
    // Install the full base mock, then intercept only the skip endpoint.
    const baseFetch = installFetch({ current: { running: true, run: null } });
    void baseFetch; // unused — we just need the side-effect of setting global.fetch
    const base = global.fetch as ReturnType<typeof vi.fn>;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/bench/skip")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ success: false, error: "no active run" }),
        } as Response);
      }
      return base(input, init);
    }) as unknown as typeof fetch;

    render(<BenchPage />);
    const skipBtn = await screen.findByText("Skip task");
    fireEvent.click(skipBtn);
    await waitFor(() => expect(addAlert).toHaveBeenCalled());
    const [, , msg] = addAlert.mock.calls[0] as [unknown, unknown, string];
    expect(msg).toMatch(/no active run/i);
  });
});
