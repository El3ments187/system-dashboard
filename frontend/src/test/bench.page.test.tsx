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
import Header from "../components/Header";

vi.mock("../context/MetricsContext", () => ({
  // The active model's sampling temperature is what Run Setup inherits.
  useMetricsContext: () => ({
    systemMetrics: null,
    aiCurrentMetrics: { temperature: 0.6 },
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
      return ok(CHECK);
    }
    if (url.includes("/api/bench/tasks")) return ok(TASK_LIST);
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
        "seedA",
      ),
    );
    expect(screen.getByTestId("bench-task-avg").textContent).not.toContain("—");
    expect(screen.getByTestId("bench-solved")).toBeTruthy();
    expect(screen.getByTestId("bench-gauge-label")).toBeTruthy();
  });

  it("surfaces the missing toolchain that --check reports, rather than assuming", async () => {
    installFetch();
    render(<BenchPage />);
    await waitFor(() =>
      expect(screen.getByTestId("bench-track-gdscript")).toBeTruthy(),
    );
    expect(screen.getByTestId("bench-track-gdscript").textContent).toContain(
      "8 skipped",
    );
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
    // Identity row is fully populated from process state alone.
    expect(screen.getByText(/a3 · n3 · t0.6/)).toBeTruthy();
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
        "livecap",
      ),
    );
    const real = screen.getByTestId("bench-hero-real-model");
    expect(real.textContent).toContain("Qwen3.6-27B");
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
      screen.queryByTestId("bench-hero-real-model"),
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
        "seedA",
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
        "seedA",
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
      "bench-url-field",
      "bench-field-langs",
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
    expect(screen.getByText(/inherited from active model/i)).toBeTruthy();

    fireEvent.change(temp, { target: { value: "0.9" } });
    expect(temp.value).toBe("0.9");
    expect(screen.queryByText(/inherited from active model/i)).toBeNull();
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
