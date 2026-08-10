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
    if (url.includes("/api/bench/tasks")) return ok(TASK_LIST);
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
    // n=3, one recorded sample, one live → exactly one still pending.
    expect(screen.queryAllByTestId("bench-cell-pending")).toHaveLength(1);
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

    await waitFor(() =>
      expect(screen.getByTestId("bench-heartbeat")).toBeTruthy(),
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
    await waitFor(() =>
      expect(screen.getAllByTestId("bench-task-row").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByTestId("bench-task-row")[0]);
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
  it("reports a finished run instead of live pacing copy", async () => {
    installFetch();
    render(<BenchPage />);
    const strip = await screen.findByTestId("bench-pacing");
    await waitFor(() => expect(strip.textContent).toMatch(/run stopped/i));
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
    // Wait for the SELECTED RUN's flags to land: before its detail arrives
    // the form defaults to every available language, so asserting earlier
    // would be racing the fetch rather than testing the toggles.
    await waitFor(() =>
      expect(
        (screen.getByTestId("bench-lang-ts") as HTMLButtonElement).getAttribute(
          "aria-pressed",
        ),
      ).toBe("false"),
    );
    expect(
      (screen.getByTestId("bench-lang-js") as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
      "the run used --langs js, so js starts on",
    ).toBe("true");

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
    expect(body.langs).toBe("ts");
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
      "bench-footer-server-errors",
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
    expect(
      screen.queryAllByTestId("bench-task-row"),
      "a warming run has no samples — the previous run's tasks must not fill its table",
    ).toHaveLength(0);
    expect(screen.getByTestId("bench-this-run-empty").textContent).toMatch(
      /no samples recorded yet/i,
    );
    // The Score card is the same class of surface: it means "this run".
    expect(
      screen.getByTestId("bench-task-avg").textContent,
      "the previous run's score must not be attributed to the warming run",
    ).toContain("—");
  });

  it("does not carry an open drilldown's content across a run change", async () => {
    installFetch();
    const { rerender } = render(<BenchPage />);

    // Open a drilldown under run A and capture something only A shows.
    const row = await screen.findAllByTestId("bench-task-row");
    fireEvent.click(row[0]);
    await waitFor(() =>
      expect(screen.getByTestId("bench-canary")).toBeTruthy(),
    );

    // Run B spawns: warming, no file of its own yet.
    installFetch({ current: SPAWNED_B });
    rerender(<BenchPage />);

    // The process-state probe runs on its own interval, so run B's arrival
    // is not synchronous with the rerender.
    await waitFor(
      () => expect(screen.queryAllByTestId("bench-task-row")).toHaveLength(0),
      { timeout: 6000 },
    );
    expect(
      screen.queryByTestId("bench-canary"),
      "run A's drilldown content must not survive into run B",
    ).toBeNull();
  });
});

// T63 — UI copy is sentence-cased.
//
// These strings came from prose inside the spec prompts, which are written in
// a lowercase-first style; that style was quoted verbatim into real UI copy.
// The design file is NOT a complete audit source — several of these strings
// never appeared in it — so the rendered page is the reference.
describe("T63a copy is sentence-cased (byte-exact)", () => {
  const cases: Array<[string, RegExp]> = [
    [
      "Model ID hint",
      /^Which model this run expects — leave blank to trust whatever the server reports$/,
    ],
    [
      "Benchmark Alias hint",
      /^Optional — names this run in the results; useful when the server reports a bare id, not which quantisation you loaded$/,
    ],
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
        screen.getByText(/^No active model to inherit from — sent explicitly$/),
      ).toBeTruthy(),
    );
  });

  it("health strip, finished-run state", async () => {
    installFetch();
    render(<BenchPage />);
    const strip = await screen.findByTestId("bench-pacing");
    await waitFor(() => expect(strip.textContent).toMatch(/^Run stopped — /));
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
    /^(solved|failed|in progress|timeout\/format|on retry|server —)/, // strip legend fragments
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
