import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { LogConsole } from "../components/LogConsole";
import type { LogLine, ProfileResponse } from "../types/metrics";

// ─── WebSocket mock ──────────────────────────────────────────────────

interface MockWsInstance {
  url: string;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  send: (data: string) => void;
  triggerOpen: () => void;
  triggerMessage: (data: object) => void;
  triggerClose: () => void;
  triggerError: () => void;
}

let lastWs: MockWsInstance | null = null;

class MockWebSocket implements MockWsInstance {
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    lastWs = this;
  }

  close() {
    this.onclose?.();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  send(_: string) {}

  triggerOpen() {
    this.onopen?.({} as Event);
  }

  triggerMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  triggerClose() {
    this.onclose?.();
  }

  triggerError() {
    this.onerror?.();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function makeProfiles(overrides: Partial<ProfileResponse> = {}): {
  data: ProfileResponse;
} {
  return {
    data: {
      profiles: [],
      states: {},
      metadata: {},
      scan_dir: "/scripts",
      ...overrides,
    },
  };
}

function runningProfile() {
  return makeProfiles({
    profiles: [
      {
        id: "p1",
        name: "test-model",
        script_path: "/test.sh",
        file_hash: "abc",
        parsed_args: null,
        filename_meta: null,
      },
    ],
    states: {
      "/test.sh": {
        status: "running",
        llama_server_pid: 1234,
        start_time: null,
        peak_vram_mb: null,
        peak_ram_mb: null,
        current_tps: null,
      },
    },
  });
}

function makeLine(overrides: Partial<LogLine> = {}): LogLine {
  return {
    timestamp: "2024-01-01T12:00:00Z",
    stream: "stdout",
    level: "info",
    text: "test log line",
    ...overrides,
  };
}

function mockFetch(responses: object[]) {
  let call = 0;
  return vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
    if (opts?.method === "DELETE") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      });
    }
    const resp = responses[Math.min(call++, responses.length - 1)];
    return Promise.resolve({ ok: true, json: async () => resp });
  });
}

// ─── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  lastWs = null;
  vi.stubGlobal("WebSocket", MockWebSocket);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Empty state ─────────────────────────────────────────────────────

describe("LogConsole empty state", () => {
  it("shows No logs available when no profile is active", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() =>
      expect(screen.getByText(/No logs available/i)).toBeInTheDocument(),
    );
  });

  it("shows Start a model hint when status is no_logs", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() =>
      expect(
        screen.getByText(/Start a model to view llama\.cpp output/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows No Logs status indicator initially", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "○ No Logs",
      ),
    );
  });
});

// ─── Connection status ────────────────────────────────────────────────

describe("LogConsole connection status", () => {
  it("shows Live status after WebSocket connects", async () => {
    global.fetch = mockFetch([runningProfile()]);
    render(<LogConsole />);

    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({ type: "history", lines: [], exited: false }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent("● Live"),
    );
  });

  it("shows Disconnected status when WebSocket closes after being live", async () => {
    global.fetch = mockFetch([runningProfile()]);
    render(<LogConsole />);

    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({ type: "history", lines: [], exited: false }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent("● Live"),
    );

    act(() => lastWs!.triggerClose());
    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "● Disconnected",
      ),
    );
  });

  it("shows Process Exited status on exited message", async () => {
    global.fetch = mockFetch([runningProfile()]);
    render(<LogConsole />);

    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({ type: "history", lines: [], exited: false }),
    );
    act(() => lastWs!.triggerMessage({ type: "exited" }));

    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "● Process Exited",
      ),
    );
  });

  it("shows Process Exited when history arrives with exited=true", async () => {
    global.fetch = mockFetch([runningProfile()]);
    render(<LogConsole />);

    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({ type: "history", lines: [], exited: true }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("console-status")).toHaveTextContent(
        "● Process Exited",
      ),
    );
  });
});

// ─── Shared helper ────────────────────────────────────────────────────

async function renderWithLines(lines: LogLine[]) {
  global.fetch = mockFetch([runningProfile()]);
  render(<LogConsole />);
  await waitFor(() => expect(lastWs).not.toBeNull());
  act(() => lastWs!.triggerOpen());
  act(() => lastWs!.triggerMessage({ type: "history", lines, exited: false }));
  await waitFor(() =>
    expect(screen.getByText(lines[0].text)).toBeInTheDocument(),
  );
}

// ─── Log rendering ────────────────────────────────────────────────────

describe("LogConsole log rendering", () => {
  it("renders log lines from WebSocket history", async () => {
    await renderWithLines([makeLine({ text: "loading model..." })]);
    expect(screen.getByText("loading model...")).toBeInTheDocument();
  });

  it("renders multiple log lines", async () => {
    await renderWithLines([
      makeLine({ text: "line one" }),
      makeLine({ text: "line two" }),
    ]);
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("shows E badge for error-level lines", async () => {
    await renderWithLines([
      makeLine({ level: "error", text: "something failed" }),
    ]);
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("does not show E badge for info-level lines", async () => {
    await renderWithLines([makeLine({ level: "info", text: "stdout info" })]);
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });
});

// ─── Search ───────────────────────────────────────────────────────────

describe("LogConsole search", () => {
  it("filters log lines by search term", async () => {
    await renderWithLines([
      makeLine({ text: "model loading started" }),
      makeLine({ text: "server ready" }),
    ]);

    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "loading" } });

    await waitFor(() =>
      expect(screen.queryByText("server ready")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("model loading started")).toBeInTheDocument();
  });

  it("is case-insensitive", async () => {
    await renderWithLines([makeLine({ text: "Loading Model" })]);
    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "loading model" } });
    await waitFor(() =>
      expect(screen.getByText("Loading Model")).toBeInTheDocument(),
    );
  });

  it("shows No matching log lines when search matches nothing", async () => {
    await renderWithLines([makeLine({ text: "some log line" })]);
    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "xyznotfound" } });
    await waitFor(() =>
      expect(screen.getByText("No matching log lines.")).toBeInTheDocument(),
    );
  });
});

// ─── Filters ──────────────────────────────────────────────────────────

describe("LogConsole level filters", () => {
  async function renderWithMixedLevels() {
    const lines: LogLine[] = [
      makeLine({ level: "info", text: "info line" }),
      makeLine({ level: "warn", text: "warn line" }),
      makeLine({ level: "error", text: "error line" }),
      makeLine({ level: "stats", text: "stats line" }),
    ];
    global.fetch = mockFetch([runningProfile()]);
    render(<LogConsole />);
    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({ type: "history", lines, exited: false }),
    );
    await waitFor(() =>
      expect(screen.getByText("info line")).toBeInTheDocument(),
    );
  }

  it("all levels shown by default", async () => {
    await renderWithMixedLevels();
    expect(screen.getByText("warn line")).toBeInTheDocument();
    expect(screen.getByText("error line")).toBeInTheDocument();
    expect(screen.getByText("stats line")).toBeInTheDocument();
  });

  it("clicking INFO filter hides info lines", async () => {
    await renderWithMixedLevels();
    const infoChip = screen.getByRole("button", { name: /info/i });
    fireEvent.click(infoChip);
    await waitFor(() =>
      expect(screen.queryByText("info line")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("warn line")).toBeInTheDocument();
  });

  it("clicking WARN filter hides warn lines", async () => {
    await renderWithMixedLevels();
    const warnChip = screen.getByRole("button", { name: /warn/i });
    fireEvent.click(warnChip);
    await waitFor(() =>
      expect(screen.queryByText("warn line")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("info line")).toBeInTheDocument();
  });

  it("clicking ERROR filter hides error lines", async () => {
    await renderWithMixedLevels();
    const errChip = screen.getByRole("button", { name: "ERROR" });
    fireEvent.click(errChip);
    await waitFor(() =>
      expect(screen.queryByText("error line")).not.toBeInTheDocument(),
    );
  });

  it("re-clicking a filter restores hidden lines", async () => {
    await renderWithMixedLevels();
    const infoChip = screen.getByRole("button", { name: /info/i });
    fireEvent.click(infoChip);
    await waitFor(() =>
      expect(screen.queryByText("info line")).not.toBeInTheDocument(),
    );
    fireEvent.click(infoChip);
    await waitFor(() =>
      expect(screen.getByText("info line")).toBeInTheDocument(),
    );
  });
});

// ─── Toolbar actions ──────────────────────────────────────────────────

describe("LogConsole toolbar", () => {
  it("Pause button toggles paused state", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() => expect(screen.getByText(/Pause/i)).toBeInTheDocument());

    const pauseBtn = screen.getByTitle("Pause auto-scroll");
    fireEvent.click(pauseBtn);
    expect(screen.getByTitle("Resume auto-scroll")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Resume auto-scroll"));
    expect(screen.getByTitle("Pause auto-scroll")).toBeInTheDocument();
  });

  it("Wrap button toggles wrap", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() => expect(screen.getByText("Wrap")).toBeInTheDocument());

    const wrapBtn = screen.getByTitle("Disable word wrap");
    fireEvent.click(wrapBtn);
    expect(screen.getByTitle("Enable word wrap")).toBeInTheDocument();
  });

  it("Clear button calls DELETE API", async () => {
    global.fetch = mockFetch([runningProfile(), runningProfile()]);
    const deleteSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<LogConsole />);
    await waitFor(() => expect(lastWs).not.toBeNull());
    act(() => lastWs!.triggerOpen());
    act(() =>
      lastWs!.triggerMessage({
        type: "history",
        lines: [makeLine({ text: "some log" })],
        exited: false,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("some log")).toBeInTheDocument(),
    );

    // Replace fetch with spy for the DELETE call
    global.fetch = vi
      .fn()
      .mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === "DELETE") {
          deleteSpy(url, opts);
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => makeProfiles() });
      });

    const clearBtn = screen.getByText("Clear");
    fireEvent.click(clearBtn);

    await waitFor(() =>
      expect(screen.queryByText("some log")).not.toBeInTheDocument(),
    );
  });

  it("Download button is present", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() =>
      expect(screen.getByTitle(/Download/i)).toBeInTheDocument(),
    );
  });

  it("Copy button is present", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() => expect(screen.getByTitle(/Copy/i)).toBeInTheDocument());
  });
});

// ─── Regression: existing layout ─────────────────────────────────────

describe("LogConsole regression", () => {
  it("renders without crashing when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    expect(() => render(<LogConsole />)).not.toThrow();
    await waitFor(() =>
      expect(screen.getByTestId("log-console")).toBeInTheDocument(),
    );
  });

  it("renders data-testid log-console element", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    expect(screen.getByTestId("log-console")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search logs...")).toBeInTheDocument(),
    );
  });

  it("renders all five filter chips", async () => {
    global.fetch = mockFetch([makeProfiles()]);
    render(<LogConsole />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const chipLabels = ["INFO", "WARN", "ERROR", "DEBUG", "STATS"];
      for (const label of chipLabels) {
        expect(buttons.some((b) => b.textContent === label)).toBe(true);
      }
    });
  });
});

// ─── Preset filters ───────────────────────────────────────────────────

describe("LogConsole preset filters", () => {
  it("Draft/Spec preset shows only lines matching slot/draft/specul keywords", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 is processing" }),
      makeLine({ text: "server ready on port 8081" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() =>
      expect(
        screen.queryByText("server ready on port 8081"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("slot 0 is processing")).toBeInTheDocument();
  });

  it("Timings preset shows only lines matching timing keywords", async () => {
    await renderWithLines([
      makeLine({ text: "eval time: 152.3 ms per token" }),
      makeLine({ text: "loading model weights" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Timings" }));

    await waitFor(() =>
      expect(
        screen.queryByText("loading model weights"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("eval time: 152.3 ms per token"),
    ).toBeInTheDocument();
  });

  it("Cache preset shows only lines with cache keywords", async () => {
    await renderWithLines([
      makeLine({ text: "kv cache usage: 45.2%" }),
      makeLine({ text: "model loaded successfully" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Cache" }));

    await waitFor(() =>
      expect(
        screen.queryByText("model loaded successfully"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("kv cache usage: 45.2%")).toBeInTheDocument();
  });

  it("Errors preset shows only lines with error/failed keywords", async () => {
    await renderWithLines([
      makeLine({ text: "failed to allocate memory" }),
      makeLine({ text: "model loaded ok" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Errors" }));

    await waitFor(() =>
      expect(screen.queryByText("model loaded ok")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("failed to allocate memory")).toBeInTheDocument();
  });

  it("two presets AND — line must match both to remain visible", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 t/s: 148.2" }), // matches Draft/Spec AND Timings
      makeLine({ text: "slot 0 processing" }), // matches Draft/Spec only
      makeLine({ text: "token generation: 10 t/s" }), // matches Timings only
      makeLine({ text: "model loaded" }), // matches neither
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));
    fireEvent.click(screen.getByRole("button", { name: "Timings" }));

    await waitFor(() =>
      expect(screen.queryByText("slot 0 processing")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("token generation: 10 t/s"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("model loaded")).not.toBeInTheDocument();
    expect(screen.getByText("slot 0 t/s: 148.2")).toBeInTheDocument();
  });

  it("preset AND search both must match", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 is ready" }),
      makeLine({ text: "slot 0 draft tokens: 5" }),
      makeLine({ text: "draft is fast" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));
    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "tokens" } });

    await waitFor(() =>
      expect(screen.queryByText("slot 0 is ready")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("draft is fast")).not.toBeInTheDocument();
    expect(screen.getByText("slot 0 draft tokens: 5")).toBeInTheDocument();
  });

  it("re-clicking a preset deactivates it and restores all lines", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 processing" }),
      makeLine({ text: "server started" }),
    ]);

    const presetBtn = screen.getByRole("button", { name: "Draft/Spec" });
    fireEvent.click(presetBtn);

    await waitFor(() =>
      expect(screen.queryByText("server started")).not.toBeInTheDocument(),
    );

    fireEvent.click(presetBtn);
    await waitFor(() =>
      expect(screen.getByText("server started")).toBeInTheDocument(),
    );
  });
});

// ─── Filter / Highlight mode ───────────────────────────────────────────

describe("LogConsole filter/highlight mode", () => {
  it("Filter mode (default) hides non-matching lines when preset is active", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 ready" }),
      makeLine({ text: "loading tensors" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() =>
      expect(screen.queryByText("loading tensors")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("slot 0 ready")).toBeInTheDocument();
  });

  it("Highlight mode shows ALL lines including non-matching ones", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 ready" }),
      makeLine({ text: "loading tensors" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() =>
      expect(screen.getByText("loading tensors")).toBeInTheDocument(),
    );
    expect(screen.getByText("slot 0 ready")).toBeInTheDocument();
  });

  it("Highlight mode marks matching lines with data-highlighted", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 ready" }),
      makeLine({ text: "loading tensors" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() => {
      const highlighted = document.querySelectorAll(
        '[data-highlighted="true"]',
      );
      expect(highlighted).toHaveLength(1);
    });
  });

  it("Filter mode shows empty state when preset matches nothing", async () => {
    await renderWithLines([
      makeLine({ text: "loading tensors" }),
      makeLine({ text: "model ready" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() =>
      expect(screen.getByText("No matching log lines.")).toBeInTheDocument(),
    );
  });

  it("level chips apply before preset filters", async () => {
    await renderWithLines([
      makeLine({ level: "info", text: "slot 0 info" }),
      makeLine({ level: "debug", text: "slot 0 debug" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "DEBUG" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));

    await waitFor(() =>
      expect(screen.queryByText("slot 0 debug")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("slot 0 info")).toBeInTheDocument();
  });

  it("switching back to Filter mode hides non-matching lines again", async () => {
    await renderWithLines([
      makeLine({ text: "slot 0 ready" }),
      makeLine({ text: "loading tensors" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Draft/Spec" }));
    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));

    await waitFor(() =>
      expect(screen.getByText("loading tensors")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() =>
      expect(screen.queryByText("loading tensors")).not.toBeInTheDocument(),
    );
  });
});

// ─── Hide Idle filter ─────────────────────────────────────────────────

describe("LogConsole hide-idle filter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides update_slots idle lines by default", async () => {
    await renderWithLines([
      makeLine({ text: "loading model..." }),
      makeLine({ text: "update_slots: all slots are idle" }),
    ]);
    expect(screen.getByText("loading model...")).toBeInTheDocument();
    expect(
      screen.queryByText("update_slots: all slots are idle"),
    ).not.toBeInTheDocument();
  });

  it("shows idle lines after toggling Hide Idle off", async () => {
    await renderWithLines([
      makeLine({ text: "loading model..." }),
      makeLine({ text: "update_slots: all slots are idle" }),
    ]);

    expect(
      screen.queryByText("update_slots: all slots are idle"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide Idle"));

    await waitFor(() =>
      expect(
        screen.getByText("update_slots: all slots are idle"),
      ).toBeInTheDocument(),
    );
  });

  it("hides idle lines again after toggling Hide Idle back on", async () => {
    await renderWithLines([
      makeLine({ text: "loading model..." }),
      makeLine({ text: "update_slots: all slots are idle" }),
    ]);

    // Toggle off → idle line visible
    fireEvent.click(screen.getByText("Hide Idle"));
    await waitFor(() =>
      expect(
        screen.getByText("update_slots: all slots are idle"),
      ).toBeInTheDocument(),
    );

    // Toggle on → idle line hidden again
    fireEvent.click(screen.getByText("Hide Idle"));
    await waitFor(() =>
      expect(
        screen.queryByText("update_slots: all slots are idle"),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not filter non-idle log lines", async () => {
    await renderWithLines([
      makeLine({ text: "llm_load_tensors: offloaded 32/32 layers to GPU" }),
    ]);
    expect(
      screen.getByText("llm_load_tensors: offloaded 32/32 layers to GPU"),
    ).toBeInTheDocument();
  });

  it("filters all variants of the idle pattern", async () => {
    const variants = [
      "update_slots: all slots are idle",
      "update_slots: all slot are idle",
    ];
    for (const text of variants) {
      localStorage.clear();
      const { unmount } = render(<LogConsole />);
      await waitFor(() => expect(lastWs).not.toBeNull());
      act(() => lastWs!.triggerOpen());
      act(() =>
        lastWs!.triggerMessage({
          type: "history",
          lines: [makeLine({ text: "init ok" }), makeLine({ text })],
          exited: false,
        }),
      );
      await waitFor(() =>
        expect(screen.getByText("init ok")).toBeInTheDocument(),
      );
      expect(screen.queryByText(text)).not.toBeInTheDocument();
      unmount();
    }
  });
});
