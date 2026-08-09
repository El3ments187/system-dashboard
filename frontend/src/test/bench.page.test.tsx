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
  useMetricsContext: () => ({ systemMetrics: null }),
}));
vi.mock("../context/LiveDataControlsContext", () => ({
  useLiveDataControlsContext: () => ({ isPaused: false, toggle: () => {} }),
}));
vi.mock("../hooks/useFetchAlerts", () => ({
  useFetchAlerts: () => ({ alerts: [], refetch: () => {} }),
}));

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
  /** Process state from POST /api/bench/start, before any results.json. */
  current?: { running: boolean; run: unknown };
  /** Simulate results.json not existing yet. */
  noDetail?: boolean;
}

function installFetch(opts: MockOpts = {}) {
  const detail = opts.detail ?? benchRun;
  const runs = opts.runs ?? [runRow()];
  const calls: string[] = [];
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const ok = (data: unknown) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data, success: true }),
      } as Response);
    if (url.includes("/api/bench/check")) {
      if (opts.failCheck)
        return Promise.resolve({ ok: false, status: 500 } as Response);
      return ok(CHECK);
    }
    if (url.includes("/api/bench/tasks"))
      return ok({ suite_hash: "e293ad7", tasks: [] });
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
