import React from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
  act,
} from "@testing-library/react";
import { LogConsole, lineMatchesFilters } from "../components/LogConsole";
import type { LogLine } from "../types/metrics";

// ─── WebSocket mock ────────────────────────────────────────────────────

const wsInstances: MockWs[] = [];

class MockWs {
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 0;

  constructor(public url: string) {
    wsInstances.push(this);
  }

  close() {
    this.onclose?.(new CloseEvent("close"));
  }

  openWs() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  sendHistory(lines: LogLine[], exited = false) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "history", lines, exited }),
      }),
    );
  }

  sendLog(line: LogLine) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "log", line }),
      }),
    );
  }
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("WebSocket", MockWs);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────

function makeLine(
  text: string,
  level: LogLine["level"] = "info",
  timestamp = "2024-01-01T00:00:00.000Z",
): LogLine {
  return { text, level, timestamp, stream: "stdout" };
}

function profilesResp({
  profiles = [] as Array<{
    id: string;
    name: string;
    script_path: string;
    file_hash: string;
    parsed_args: Record<string, unknown>;
    filename_meta: null;
    warning: null;
  }>,
  states = {} as Record<string, { status: string; llama_server_pid?: number }>,
} = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { profiles, states, metadata: {} } }),
  };
}

beforeEach(() => {
  wsInstances.length = 0;
  localStorage.clear();
  global.fetch = vi.fn().mockResolvedValue(profilesResp());
});

// ─── lineMatchesFilters (pure function) ────────────────────────────────

describe("lineMatchesFilters", () => {
  it("returns true when no presets and empty query", () => {
    expect(lineMatchesFilters("any text", new Set(), "")).toBe(true);
  });

  it("returns true when line matches active preset keyword", () => {
    expect(
      lineMatchesFilters("kv cache usage 40%", new Set(["cache"]), ""),
    ).toBe(true);
  });

  it("returns false when line does not match active preset", () => {
    expect(lineMatchesFilters("hello world", new Set(["cache"]), "")).toBe(
      false,
    );
  });

  it("returns true when line matches search query", () => {
    expect(lineMatchesFilters("slot 0 is processing", new Set(), "slot")).toBe(
      true,
    );
  });

  it("returns false when line does not match search query", () => {
    expect(lineMatchesFilters("hello world", new Set(), "error")).toBe(false);
  });

  it("matching is case-insensitive for both preset and query", () => {
    expect(lineMatchesFilters("KV Cache HIT", new Set(["cache"]), "HIT")).toBe(
      true,
    );
  });

  it("requires ALL active presets to match (AND logic)", () => {
    expect(
      lineMatchesFilters("slot processed", new Set(["draft", "cache"]), ""),
    ).toBe(false);
    expect(
      lineMatchesFilters("slot cached prefix", new Set(["draft", "cache"]), ""),
    ).toBe(true);
  });

  it("matches errors preset keywords (fatal, failed, abort)", () => {
    expect(
      lineMatchesFilters("fatal: out of memory", new Set(["errors"]), ""),
    ).toBe(true);
    expect(
      lineMatchesFilters("normal generation line", new Set(["errors"]), ""),
    ).toBe(false);
  });

  it("matches timings preset keywords (t/s, eval)", () => {
    expect(
      lineMatchesFilters("eval time: 235ms", new Set(["timings"]), ""),
    ).toBe(true);
    expect(lineMatchesFilters("slot 0 active", new Set(["timings"]), "")).toBe(
      false,
    );
  });

  it("matches draft preset keywords (slot, draft, specul)", () => {
    expect(
      lineMatchesFilters("draft model accepted", new Set(["draft"]), ""),
    ).toBe(true);
    expect(lineMatchesFilters("model loaded", new Set(["draft"]), "")).toBe(
      false,
    );
  });

  it("returns true when query is empty string even with preset active", () => {
    expect(lineMatchesFilters("slot 0", new Set(["draft"]), "")).toBe(true);
  });
});

// ─── LogConsole initial render ─────────────────────────────────────────

describe("LogConsole initial render", () => {
  it("renders without crash and shows console header", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/LLAMA\.CPP Console/)).toBeInTheDocument();
  });

  it("shows '○ No Logs' status initially", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("console-status")).toHaveTextContent("○ No Logs");
  });

  it("shows console-empty-state with 'No logs available.' and model start hint", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const empty = screen.getByTestId("console-empty-state");
    expect(within(empty).getByText(/No logs available/)).toBeInTheDocument();
    expect(within(empty).getByText(/Start a model/)).toBeInTheDocument();
  });

  it("does not render console-active-profile when no profile is running", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.queryByTestId("console-active-profile"),
    ).not.toBeInTheDocument();
  });

  it("renders log-area testid", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("log-area")).toBeInTheDocument();
  });
});

// ─── Filter chips and preset chips ────────────────────────────────────

describe("LogConsole filter and preset chips", () => {
  it("renders all level filter chips: INFO, WARN, ERROR, DEBUG, STATS", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "INFO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WARN" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ERROR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DEBUG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STATS" })).toBeInTheDocument();
  });

  it("level filter chips have aria-pressed=true by default", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "INFO" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "ERROR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders all preset chips: Draft/Spec, Timings, Cache, Errors", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Draft/Spec" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cache" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Errors" })).toBeInTheDocument();
  });

  it("preset chips have aria-pressed=false by default (none active)", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Cache" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders Filter and Highlight mode buttons", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Highlight" }),
    ).toBeInTheDocument();
  });
});

// ─── Toolbar buttons ───────────────────────────────────────────────────

describe("LogConsole toolbar buttons", () => {
  it("shows search input with aria-label 'Search logs'", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.getByRole("searchbox", { name: "Search logs" }),
    ).toBeInTheDocument();
  });

  it("shows Pause button title initially (not paused)", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTitle("Pause auto-scroll")).toBeInTheDocument();
  });

  it("clicking Pause toggles to Resume", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("Pause auto-scroll"));
    expect(screen.getByTitle("Resume auto-scroll")).toBeInTheDocument();
  });

  it("clicking Resume toggles back to Pause", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("Pause auto-scroll"));
    fireEvent.click(screen.getByTitle("Resume auto-scroll"));
    expect(screen.getByTitle("Pause auto-scroll")).toBeInTheDocument();
  });

  it("shows Clear, Copy, Save, Wrap, Hide Idle toolbar buttons", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTitle("Clear logs")).toBeInTheDocument();
    expect(
      screen.getByTitle("Copy visible logs to clipboard"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Download logs as .txt")).toBeInTheDocument();
    // wrap=true by default → title says "Disable word wrap"
    expect(screen.getByTitle("Disable word wrap")).toBeInTheDocument();
    // hideIdle=true by default → title says "Show idle lines"
    expect(screen.getByTitle("Show idle lines")).toBeInTheDocument();
  });

  it("clicking Wrap toggles word-wrap title", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("Disable word wrap"));
    expect(screen.getByTitle("Enable word wrap")).toBeInTheDocument();
  });
});

// ─── With active profile and log lines ────────────────────────────────

const activeProfile = {
  id: "p1",
  name: "Qwen-7B",
  script_path: "/scripts/run.sh",
  file_hash: "abc",
  parsed_args: { port: 8080 },
  filename_meta: null,
  warning: null,
};

function setupRunning() {
  global.fetch = vi.fn().mockResolvedValue(
    profilesResp({
      profiles: [activeProfile],
      states: {
        "/scripts/run.sh": { status: "running", llama_server_pid: 1234 },
      },
    }),
  );
}

describe("LogConsole with active profile", () => {
  it("shows active profile name in console-active-profile span", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => {
      expect(screen.getByTestId("console-active-profile")).toHaveTextContent(
        "Qwen-7B",
      );
    });
  });

  it("shows '● Live' status after WebSocket opens", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    wsInstances[wsInstances.length - 1].openWs();
    await waitFor(() => {
      expect(screen.getByTestId("console-status")).toHaveTextContent("● Live");
    });
  });

  it("renders log lines from WS history message", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("llama server started"),
      makeLine("model weights loaded"),
    ]);
    await waitFor(() => {
      expect(screen.getByText("llama server started")).toBeInTheDocument();
      expect(screen.getByText("model weights loaded")).toBeInTheDocument();
    });
  });

  it("renders correct level letter badges: I, E, W, S", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("info msg", "info"),
      makeLine("error msg", "error"),
      makeLine("warn msg", "warn"),
      makeLine("stats msg", "stats"),
    ]);
    await waitFor(() => {
      expect(screen.getAllByText("I").length).toBeGreaterThan(0);
      expect(screen.getAllByText("E").length).toBeGreaterThan(0);
      expect(screen.getAllByText("W").length).toBeGreaterThan(0);
      expect(screen.getAllByText("S").length).toBeGreaterThan(0);
    });
  });

  it("shows '● Process Exited' when WS history has exited=true", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([], true);
    await waitFor(() => {
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "● Process Exited",
      );
    });
  });

  it("shows '● Disconnected' when WS closes unexpectedly", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.close();
    await waitFor(() => {
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "● Disconnected",
      );
    });
  });
});

// ─── Idle line filtering ───────────────────────────────────────────────

describe("LogConsole hide idle filtering", () => {
  it("hides 'update_slots: all slots are idle' lines by default", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("update_slots: all slots are idle"),
      makeLine("normal log line"),
    ]);
    await waitFor(() => {
      expect(
        screen.queryByText("update_slots: all slots are idle"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("normal log line")).toBeInTheDocument();
    });
  });

  it("shows idle lines when Hide Idle is toggled off", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([makeLine("update_slots: all slots are idle")]);
    await waitFor(() =>
      expect(
        screen.queryByText("update_slots: all slots are idle"),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTitle("Show idle lines"));
    await waitFor(() => {
      expect(
        screen.getByText("update_slots: all slots are idle"),
      ).toBeInTheDocument();
    });
  });
});

// ─── Search filtering ─────────────────────────────────────────────────

describe("LogConsole search and filter mode", () => {
  it("filters logs by search query in Filter mode", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("kv cache hit on 512 tokens"),
      makeLine("generation started for slot 0"),
    ]);
    await waitFor(() =>
      expect(
        screen.getByText("generation started for slot 0"),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search logs" }), {
      target: { value: "kv cache" },
    });
    await waitFor(() => {
      expect(
        screen.getByText("kv cache hit on 512 tokens"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("generation started for slot 0"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows 'No matching log lines.' in console-empty-state when search has no results", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([makeLine("hello world")]);
    await waitFor(() =>
      expect(screen.getByText("hello world")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search logs" }), {
      target: { value: "xyznotfound" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("console-empty-state")).toHaveTextContent(
        "No matching log lines.",
      );
    });
  });

  it("toggling INFO chip off hides info-level lines", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("info level message", "info"),
      makeLine("error level message", "error"),
    ]);
    await waitFor(() =>
      expect(screen.getByText("info level message")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "INFO" }));
    await waitFor(() => {
      expect(screen.queryByText("info level message")).not.toBeInTheDocument();
      expect(screen.getByText("error level message")).toBeInTheDocument();
    });
  });

  it("toggling INFO chip off sets its aria-pressed to false", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const infoChip = screen.getByRole("button", { name: "INFO" });
    expect(infoChip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(infoChip);
    expect(infoChip).toHaveAttribute("aria-pressed", "false");
  });
});

// ─── Preset chip filtering ─────────────────────────────────────────────

describe("LogConsole preset chip filtering", () => {
  it("activating Cache preset hides lines without cache keywords", async () => {
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([
      makeLine("kv cache miss on prefix"),
      makeLine("generation started"),
    ]);
    await waitFor(() =>
      expect(screen.getByText("generation started")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cache" }));
    await waitFor(() => {
      expect(screen.getByText("kv cache miss on prefix")).toBeInTheDocument();
      expect(screen.queryByText("generation started")).not.toBeInTheDocument();
    });
  });

  it("Cache preset chip shows aria-pressed=true when active", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const cacheChip = screen.getByRole("button", { name: "Cache" });
    expect(cacheChip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cacheChip);
    expect(cacheChip).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking an active preset chip deactivates it", async () => {
    render(<LogConsole />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const cacheChip = screen.getByRole("button", { name: "Cache" });
    fireEvent.click(cacheChip); // activate
    expect(cacheChip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cacheChip); // deactivate
    expect(cacheChip).toHaveAttribute("aria-pressed", "false");
  });
});

// ─── active-profile-loss debounce ──────────────────────────────────────

describe("LogConsole active-profile detection debounces a stop", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT clear logs after a single poll reporting no active profile (a transient flake)", async () => {
    // User-reported: "the console goes blank after a short period... I
    // can no longer see the errors." Traced to this exact poll: ANY
    // single fetch reporting no active profile immediately cleared logs
    // and closed the websocket. This test proves ONE such poll — a
    // plausible transient race, not a real stop — no longer wipes
    // anything.
    vi.useFakeTimers();
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      // First call (mount): profile is running. Second call (poll #2,
      // 3s later): a single flaky read reports nothing active.
      if (callCount === 1) {
        return Promise.resolve(
          profilesResp({
            profiles: [activeProfile],
            states: {
              "/scripts/run.sh": { status: "running", llama_server_pid: 1234 },
            },
          }),
        );
      }
      return Promise.resolve(profilesResp({ profiles: [], states: {} }));
    });

    render(<LogConsole />);
    await vi.waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([makeLine("important error context", "error")]);
    await vi.waitFor(() =>
      expect(screen.getByText("important error context")).toBeInTheDocument(),
    );

    // One flaky poll (3s later) reporting no active profile.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // The log must still be visible — one flaky poll must not blank it.
    expect(screen.getByText("important error context")).toBeInTheDocument();
  });

  it("DOES clear logs after TWO CONSECUTIVE polls confirm no active profile (a real stop)", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(
          profilesResp({
            profiles: [activeProfile],
            states: {
              "/scripts/run.sh": { status: "running", llama_server_pid: 1234 },
            },
          }),
        );
      }
      // Every poll after the first reports nothing active — a real stop.
      return Promise.resolve(profilesResp({ profiles: [], states: {} }));
    });

    render(<LogConsole />);
    await vi.waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([makeLine("some log line", "info")]);
    await vi.waitFor(() =>
      expect(screen.getByText("some log line")).toBeInTheDocument(),
    );

    // Poll #2 (3s): first null — not confirmed yet, must NOT clear.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("some log line")).toBeInTheDocument();

    // Poll #3 (6s total): second CONSECUTIVE null — now confirmed, must
    // clear, matching a genuine stop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await vi.waitFor(() =>
      expect(screen.queryByText("some log line")).not.toBeInTheDocument(),
    );
  });

  it("self-corrects: a flaky null poll followed by the SAME profile again clears nothing", async () => {
    // The debounce counter must reset the moment a real active profile is
    // seen again — a flake sandwiched between two genuine "running" polls
    // must never accumulate toward a false stop.
    vi.useFakeTimers();
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      // Poll 1 (mount): running. Poll 2 (3s): flaky null. Poll 3 (6s):
      // running again — the SAME profile, proving the flake didn't
      // silently start counting toward a stop.
      if (callCount === 2) {
        return Promise.resolve(profilesResp({ profiles: [], states: {} }));
      }
      return Promise.resolve(
        profilesResp({
          profiles: [activeProfile],
          states: {
            "/scripts/run.sh": { status: "running", llama_server_pid: 1234 },
          },
        }),
      );
    });

    render(<LogConsole />);
    await vi.waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([makeLine("persistent log", "info")]);
    await vi.waitFor(() =>
      expect(screen.getByText("persistent log")).toBeInTheDocument(),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    }); // poll 2: flaky null
    expect(screen.getByText("persistent log")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    }); // poll 3: running again
    // A THIRD poll's worth of time passing (which would have been the
    // "second consecutive null" if the flake had counted) must still not
    // clear anything, since the flake was reset by poll 3 seeing the
    // profile active again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("persistent log")).toBeInTheDocument();
  });
});

// ─── T207 toolbar: hover class and action confirmations ───────────────

describe("T207 toolbar buttons — class and confirmation flash", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("all six toolbar buttons carry the log-toolbar-btn CSS class", async () => {
    render(<LogConsole />);
    await waitFor(() =>
      expect(
        document.querySelectorAll(".log-toolbar-btn").length,
      ).toBeGreaterThanOrEqual(6),
    );
    const texts = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".log-toolbar-btn"),
    ).map((b) => b.textContent ?? "");
    expect(texts.some((t) => /pause|resume/i.test(t))).toBe(true);
    expect(texts.some((t) => /clear/i.test(t))).toBe(true);
    expect(texts.some((t) => /copy/i.test(t))).toBe(true);
    expect(texts.some((t) => /save/i.test(t))).toBe(true);
    expect(texts.some((t) => /wrap/i.test(t))).toBe(true);
    expect(texts.some((t) => /hide idle/i.test(t))).toBe(true);
  });

  it("Pause toggle: active state persists until toggled back", async () => {
    render(<LogConsole />);
    await waitFor(() =>
      expect(screen.getByTitle("Pause auto-scroll")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTitle("Pause auto-scroll"));
    expect(screen.getByTitle("Resume auto-scroll")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Resume auto-scroll"));
    expect(screen.getByTitle("Pause auto-scroll")).toBeInTheDocument();
  });

  it("Clear: shows 'Cleared' immediately then reverts after ~1 s", async () => {
    // Render with real timers so the component mounts normally, then switch to
    // fake timers before the click so the 1s revert timeout can be advanced.
    render(<LogConsole />);
    const clearBtn = screen.getByTitle("Clear logs");
    expect(clearBtn.textContent).toContain("Clear");

    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(clearBtn);
    });
    expect(clearBtn.textContent).toContain("Cleared");

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(clearBtn.textContent).not.toContain("Cleared");
    expect(clearBtn.textContent).toContain("Clear");
  });

  it("Copy: fallback path (execCommand=true) confirms; reverts after ~1 s", async () => {
    // jsdom has no navigator.clipboard — fallbackCopy runs automatically
    document.execCommand = vi.fn().mockReturnValue(true);

    render(<LogConsole />);
    const copyBtn = screen.getByTitle("Copy visible logs to clipboard");

    // Switch to fake timers AFTER render so waitFor's internal setTimeout still fires.
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(copyBtn.textContent).toContain("Copied");

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(copyBtn.textContent).not.toContain("Copied");
    expect(copyBtn.textContent).toContain("Copy");
  });

  it("Copy: fallback path (execCommand=false) shows no confirmation", async () => {
    document.execCommand = vi.fn().mockReturnValue(false);

    render(<LogConsole />);
    await waitFor(() =>
      expect(
        screen.getByTitle("Copy visible logs to clipboard"),
      ).toBeInTheDocument(),
    );
    const copyBtn = screen.getByTitle("Copy visible logs to clipboard");

    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(copyBtn.textContent).not.toContain("Copied");
  });

  it("Copy: clipboard API confirms on success; reverts after ~1 s", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });

    render(<LogConsole />);
    const copyBtn = screen.getByTitle("Copy visible logs to clipboard");

    // Switch to fake timers AFTER render so waitFor's internal setTimeout still fires.
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(copyBtn);
      // flush the resolved writeText promise
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copyBtn.textContent).toContain("Copied");

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(copyBtn.textContent).not.toContain("Copied");

    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("Copy: clipboard API rejected + execCommand=false → no confirmation", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
      writable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    render(<LogConsole />);
    await waitFor(() =>
      expect(
        screen.getByTitle("Copy visible logs to clipboard"),
      ).toBeInTheDocument(),
    );
    const copyBtn = screen.getByTitle("Copy visible logs to clipboard");

    await act(async () => {
      fireEvent.click(copyBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copyBtn.textContent).not.toContain("Copied");

    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });
});

// ─── Recovered-process console message ────────────────────────────────

describe("LogConsole recovered-process message", () => {
  it("shows recovered-process message when profile is active but history is empty, and hides 'Start a model' hint", async () => {
    // TDD guard: model IS running (recovered by backend after restart) but
    // log pipe was never established — sendHistory([]) simulates the WS
    // delivering an empty history for a process that has no stdout capture.
    // The old "Start a model" hint is actively wrong in this state (the
    // model IS started). The new message is honest about the limitation.
    setupRunning();
    render(<LogConsole />);
    await waitFor(() => expect(wsInstances.length).toBeGreaterThan(0));
    const ws = wsInstances[wsInstances.length - 1];
    ws.openWs();
    ws.sendHistory([]);
    await waitFor(() => {
      expect(
        screen.getByText(/started before the current backend session/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Start a model to view/)).not.toBeInTheDocument();
  });
});
