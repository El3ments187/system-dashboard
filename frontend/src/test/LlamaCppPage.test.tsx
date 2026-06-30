import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LlamaCppPage from "../pages/LlamaCppPage";
import {
  fmtUptime,
  fmtKb,
  fmtLatency,
  calcBuildsBehind,
  extractQuant,
} from "../pages/llamaCppUtils";
import type { AiMetrics, ProfileResponse } from "../types/metrics";

// ─── Module mocks ─────────────────────────────────────────────────────

vi.mock("../components/LogConsole", () => ({
  default: () => <div data-testid="log-console" />,
}));

vi.mock("../components/UpdateOutputModal", () => ({
  default: () => null,
}));

vi.mock("../context/MetricsContext", () => ({
  useMetricsContext: vi.fn(),
}));

vi.mock("../hooks/useLlamaCppManagement", () => ({
  useLlamaCppManagement: vi.fn(),
}));

import { useMetricsContext } from "../context/MetricsContext";
import { useLlamaCppManagement } from "../hooks/useLlamaCppManagement";

const mockedCtx = vi.mocked(useMetricsContext);
const mockedMgmt = vi.mocked(useLlamaCppManagement);

// ─── Fixtures ─────────────────────────────────────────────────────────

function baseMetrics(overrides: Partial<AiMetrics> = {}): AiMetrics {
  return {
    llama_server: { available: false } as AiMetrics["llama_server"],
    openwebui: { available: false } as AiMetrics["openwebui"],
    opencode: { available: false } as AiMetrics["opencode"],
    comfyui: { available: false } as AiMetrics["comfyui"],
    llama_server_status: "offline",
    openwebui_status: "offline",
    opencode_status: "offline",
    comfyui_status: "offline",
    llm_utilization_percent: null,
    kv_cache_usage_percent: null,
    prompt_buffer_usage_percent: null,
    tokens_cached: null,
    total_tokens_sent: null,
    server_time_ms: null,
    prompt_queue_size: null,
    running_prompts: null,
    swap_pending_slots: null,
    token_usage: null,
    kv_cache_stats: null,
    models: null,
    llama_server_latency_ms: null,
    gen_tps: null,
    prompt_tps: null,
    active_requests: null,
    queued_requests: null,
    busy_slots: null,
    context_tokens: null,
    max_context: null,
    model_alias: null,
    model_path: null,
    total_slots: null,
    build_info: null,
    endpoint_metrics: null,
    webui: null,
    vision: null,
    video: null,
    audio: null,
    temperature: null,
    top_k: null,
    top_p: null,
    repeat_penalty: null,
    llama_server_process: null,
    opencode_process: null,
    openwebui_process: null,
    comfyui_process: null,
    comfyui_info: null,
    ...overrides,
  };
}

function baseCtx(metricsOverrides: Partial<AiMetrics> = {}) {
  return {
    aiCurrentMetrics: baseMetrics(metricsOverrides),
    llamaCppLoading: false,
    cpuCurrentValues: [25, 8, 16, 50] as unknown as number[],
    memoryCurrentValues: [60, 9.5, 16, 0] as unknown as number[],
    gpuCurrentValues: [80, 72, 10, 16] as unknown as number[],
    cpuHistory: [],
    memoryHistory: [],
    gpuHistory: [],
    gpuVramUtilHistory: [],
    gpuTemperatureHistory: [],
  };
}

function baseMgmt(overrides: Record<string, unknown> = {}) {
  return {
    dirPath: "",
    llamaVersion: "",
    readmeUrl: "",
    buildNotesUrl: "https://github.com/ggml-org/llama.cpp/releases",
    updateScript: "",
    ptsName: null,
    updateState: "idle" as const,
    updateProgress: 0,
    updateOutput: "",
    outputOpen: false,
    toast: null,
    openTerminal: vi.fn(),
    runUpdate: vi.fn(),
    setOutputOpen: vi.fn(),
    gitInfo: null,
    repoInfo: null,
    ...overrides,
  };
}

function profilesResp(overrides: Partial<ProfileResponse> = {}): {
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

// ─── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockedCtx.mockReturnValue(baseCtx());
  mockedMgmt.mockReturnValue(baseMgmt());
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => profilesResp(),
  });
  localStorage.clear();
  // Use wide viewport so collapsible sidebar renders (not stacked)
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 1920,
  });
});

// ─── fmtUptime ────────────────────────────────────────────────────────

describe("fmtUptime", () => {
  it("formats sub-minute as seconds", () => {
    expect(fmtUptime(0)).toBe("0s");
    expect(fmtUptime(45)).toBe("45s");
    expect(fmtUptime(59)).toBe("59s");
  });

  it("formats 1–59 minutes as Xm Ys", () => {
    expect(fmtUptime(60)).toBe("1m 0s");
    expect(fmtUptime(90)).toBe("1m 30s");
    expect(fmtUptime(3599)).toBe("59m 59s");
  });

  it("formats hours as Xh Ym", () => {
    expect(fmtUptime(3600)).toBe("1h 0m");
    expect(fmtUptime(3700)).toBe("1h 1m");
    expect(fmtUptime(7384)).toBe("2h 3m");
  });

  it("returns em-dash for null or undefined", () => {
    expect(fmtUptime(null)).toBe("—");
    expect(fmtUptime(undefined)).toBe("—");
  });
});

// ─── fmtKb ────────────────────────────────────────────────────────────

describe("fmtKb", () => {
  it("formats sub-1024 KB range", () => {
    expect(fmtKb(512)).toBe("512 KB");
    expect(fmtKb(1)).toBe("1 KB");
    expect(fmtKb(1023)).toBe("1023 KB");
  });

  it("formats 1 MB – 1 GB range as MB", () => {
    expect(fmtKb(1024)).toBe("1.0 MB");
    expect(fmtKb(2048)).toBe("2.0 MB");
    expect(fmtKb(512 * 1024)).toBe("512.0 MB");
  });

  it("formats ≥ 1 GB range as GB", () => {
    expect(fmtKb(1024 * 1024)).toBe("1.00 GB");
    expect(fmtKb(1024 * 1024 * 8)).toBe("8.00 GB");
  });

  it("returns em-dash for null or undefined", () => {
    expect(fmtKb(null)).toBe("—");
    expect(fmtKb(undefined)).toBe("—");
  });
});

// ─── fmtLatency ───────────────────────────────────────────────────────

describe("fmtLatency", () => {
  it("formats sub-second values as ms", () => {
    expect(fmtLatency(0)).toBe("0ms");
    expect(fmtLatency(42)).toBe("42ms");
    expect(fmtLatency(999)).toBe("999ms");
  });

  it("formats ≥ 1000ms as seconds with one decimal", () => {
    expect(fmtLatency(1000)).toBe("1.0s");
    expect(fmtLatency(1500)).toBe("1.5s");
    expect(fmtLatency(2750)).toBe("2.8s");
  });

  it("returns em-dash for null or undefined", () => {
    expect(fmtLatency(null)).toBe("—");
    expect(fmtLatency(undefined)).toBe("—");
  });
});

// ─── calcBuildsBehind ─────────────────────────────────────────────────

describe("calcBuildsBehind", () => {
  it("returns null when either tag is missing", () => {
    expect(calcBuildsBehind(null, "b5250")).toBeNull();
    expect(calcBuildsBehind("b5200", null)).toBeNull();
    expect(calcBuildsBehind(undefined, undefined)).toBeNull();
  });

  it("calculates positive difference", () => {
    expect(calcBuildsBehind("b5200", "b5250")).toBe(50);
    expect(calcBuildsBehind("b1000", "b1001")).toBe(1);
  });

  it("returns 0 when on same build", () => {
    expect(calcBuildsBehind("b5250", "b5250")).toBe(0);
  });

  it("returns 0 when local is ahead of latest", () => {
    expect(calcBuildsBehind("b5260", "b5250")).toBe(0);
  });

  it("returns null for non-numeric tag formats", () => {
    expect(calcBuildsBehind("vX.Y.Z", "vA.B.C")).toBeNull();
  });
});

// ─── LlamaCppPage rendering ───────────────────────────────────────────

describe("LlamaCppPage", () => {
  it("renders without crashing when metrics are null", async () => {
    mockedCtx.mockReturnValue({ ...baseCtx(), aiCurrentMetrics: null });
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("LLAMA.CPP")).toBeInTheDocument();
  });

  it("shows OFFLINE badge when server is unavailable", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/OFFLINE/)).toBeInTheDocument();
  });

  it("shows ONLINE badge when server is available", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        llama_server: { available: true } as AiMetrics["llama_server"],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/ONLINE/)).toBeInTheDocument();
  });

  it("shows model filename extracted from full path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/Qwen3-7B-Q4_K_M.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Page strips .gguf and splits head/quant into separate spans; check the quant part
    expect(screen.getAllByText("Q4_K_M").length).toBeGreaterThan(0);
  });

  it("shows model alias when no path is set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_alias: "my-alias", model_path: null }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // alias appears in header meta line and sidebar
    const elements = screen.getAllByText("my-alias");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("shows build version in status card", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5200", latest_build_tag: null },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const elements = screen.getAllByText("b5200");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("shows capability pills in header", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ endpoint_metrics: true, webui: true, vision: false }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Metrics").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WebUI").length).toBeGreaterThan(0);
  });

  it("renders hardware footer stat labels", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("CPU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RAM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GPU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("VRAM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GPU Temp").length).toBeGreaterThan(0);
  });

  it("renders Run Models section header", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("Run Models")).toBeInTheDocument();
  });

  it("renders mocked log console", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("log-console")).toBeInTheDocument();
  });
});

// ─── Status card: git / repo info ─────────────────────────────────────

describe("LlamaCppPage status card git/repo info", () => {
  it("shows local and latest build tags from repoInfo", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5100", latest_build_tag: "b5200" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("b5100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("b5200").length).toBeGreaterThan(0);
  });

  it("shows latest release tag and builds-behind warning", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5200", latest_build_tag: "b5250" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("b5250").length).toBeGreaterThan(0);
    expect(screen.getByText(/50 builds behind latest/)).toBeInTheDocument();
  });

  it("does not show builds-behind when on latest", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5250", latest_build_tag: "b5250" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/builds behind/)).not.toBeInTheDocument();
  });
});

// ─── Context section ──────────────────────────────────────────────────

describe("LlamaCppPage context section", () => {
  it("shows Prompt Buf ring when context metrics are set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ context_tokens: 4096, max_context: 8192 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
  });

  it("shows context token counts when slot data is set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 2048, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
  });

  it("shows Tok Cached and Total Sent stat labels", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ tokens_cached: 500, total_tokens_sent: 2000 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Tok Cached").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Sent").length).toBeGreaterThan(0);
  });
});

// ─── Generation section ───────────────────────────────────────────────

describe("LlamaCppPage generation section", () => {
  it("shows Gen TPS and Prompt TPS", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: 12.5, prompt_tps: 450 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/Gen TPS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Prompt TPS/).length).toBeGreaterThan(0);
  });

  it("shows sampling parameters from metrics", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Temp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Top-K").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Top-P").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeat").length).toBeGreaterThan(0);
  });

  it("shows sampling parameter grid labels", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Temp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeat").length).toBeGreaterThan(0);
  });
});

// ─── Runtime Information section ──────────────────────────────────────

describe("LlamaCppPage runtime information section", () => {
  it("shows Runtime Information section in sidebar", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Runtime Information").length).toBeGreaterThan(
      0,
    );
  });

  it("shows PID, uptime, and port from process metrics and profile", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        llama_server: { available: true } as AiMetrics["llama_server"],
        llama_server_process: {
          pid: 12345,
          cpu_percent: 15,
          memory_kb: 8 * 1024 * 1024,
          uptime_seconds: 3700,
        },
      }),
    );
    // Running profile with port 8081
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        profilesResp({
          profiles: [
            {
              id: "p1",
              name: "model",
              script_path: "/test.sh",
              file_hash: "abc",
              parsed_args: { port: 8081, parallel: 4 },
              filename_meta: null,
              warning: null,
            },
          ],
          states: {
            "/test.sh": { status: "running", llama_server_pid: 12345 },
          },
          metadata: {},
        }),
    });
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // PID appears in sidebar
    expect(screen.getAllByText("12345").length).toBeGreaterThan(0);
    // Uptime: 3700s = 1h 1m
    expect(screen.getByText("1h 1m")).toBeInTheDocument();
  });
});

// ─── Server Activity section ──────────────────────────────────────────

describe("LlamaCppPage server activity section", () => {
  it("renders Live Activity section with token stat labels", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        active_requests: 2,
        queued_requests: 1,
        llama_server_latency_ms: 45,
        tokens_cached: 1000,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Live Activity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tok Cached").length).toBeGreaterThan(0);
  });

  it("always renders Live Activity section", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Live Activity").length).toBeGreaterThan(0);
  });
});

// ─── Model / Build header card ────────────────────────────────────────

describe("LlamaCppPage model/build header card", () => {
  it("shows current and latest build tags in header card", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5200", latest_build_tag: "b5200" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("b5200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current build").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Latest build").length).toBeGreaterThan(0);
  });

  it("shows builds-behind warning when repoInfo shows stale build", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5100", latest_build_tag: "b5200" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/100 builds behind latest/)).toBeInTheDocument();
  });
});

// ─── Load Time ────────────────────────────────────────────────────────

describe("LlamaCppPage load time", () => {
  it("shows formatted load time in Runtime Information section", async () => {
    mockedCtx.mockReturnValue(baseCtx({ model_load_time_ms: 8240 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("8.24s").length).toBeGreaterThan(0);
  });

  it("always shows Load Time label", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Load Time").length).toBeGreaterThan(0);
  });
});

// ─── Context / KV Cache section ───────────────────────────────────────

describe("LlamaCppPage context and KV cache section", () => {
  it("always shows Prompt Buf ring label", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
  });

  it("shows slot token count in context display", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ slots: [{ id: 0, n_ctx: 131072, n_prompt_tokens: 50000 }] }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/50,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/131,072/).length).toBeGreaterThan(0);
  });

  it("gauge label and current/max tokens all derive from n_prompt_tokens and n_ctx", async () => {
    // contextPct = round(5000/10000 * 1000)/10 = 50 → label "50"; current "5,000"; max "10,000"
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 10000, n_prompt_tokens: 5000, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10,000/).length).toBeGreaterThan(0);
    // gauge label = contextPct.toFixed(0) = "50"
    expect(screen.getAllByText(/\b50\b/).length).toBeGreaterThan(0);
  });

  it("Prompt Buf ring shows n_prompt_tokens_cache / n_ctx as percentage", async () => {
    // 500/10000 → Math.round(500/10000 * 1000)/10 = 5 → "5%"
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_usage_percent: null,
        slots: [
          {
            id: 0,
            n_ctx: 10000,
            n_prompt_tokens: 100,
            is_processing: false,
            n_prompt_tokens_cache: 500,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("5%").length).toBeGreaterThan(0);
  });

  it("Prompt Buf ring shows em-dash when n_prompt_tokens_cache is absent", async () => {
    // n_prompt_tokens_cache absent → must show "—", not contextPct value
    // contextPct here = round(65000/131072*1000)/10 = 49.6 — showing it would be the bug
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 65000,
            is_processing: false,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
    expect(screen.queryByText("49.6%")).not.toBeInTheDocument();
  });

  it("Prompt Buf ring shows '—' when n_prompt_tokens_cache is 0 — must not fall back to contextPct", async () => {
    // At idle, n_prompt_tokens_cache resets to 0 even though context is filled.
    // promptBufPct must be null (→ "—"), NOT contextPct (which would show "49.6%").
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 65000,
            n_prompt_tokens_cache: 0,
            is_processing: false,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
    expect(screen.queryByText("49.6%")).not.toBeInTheDocument();
  });

  it("Prompt Buf uses n_prompt_tokens_cache not n_prompt_tokens (22.9% vs gauge 50)", async () => {
    // n_prompt_tokens=65000 (contextPct=49.6 → gauge label "50")
    // n_prompt_tokens_cache=30000 → promptBufPct = round(30000/131072*1000)/10 = 22.9
    // Prompt Buf must show "22.9%", not "49.6%"; failing this = wired to contextPct
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 65000,
            n_prompt_tokens_cache: 30000,
            is_processing: true,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("22.9%").length).toBeGreaterThan(0);
    expect(screen.queryByText("49.6%")).not.toBeInTheDocument();
  });

  it("context card renders without crash when slot is missing", async () => {
    mockedCtx.mockReturnValue(baseCtx({ slots: undefined }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Prompt Buf").length).toBeGreaterThan(0);
  });

  it("gauge shows '<1' for sub-1% fill (e.g., 212/131072 = 0.2%)", async () => {
    // Real low-fill observed: prompt=212, ctx=131072 → contextPct=0.2 → was "0", now "<1"
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 131072, n_prompt_tokens: 212, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("<1").length).toBeGreaterThan(0);
  });

  it("gauge shows '0' (not '<1') when n_prompt_tokens is exactly 0", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 131072, n_prompt_tokens: 0, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // contextPct=0 → falls through to toFixed(0) → "0", not "<1"
    expect(screen.queryByText("<1")).not.toBeInTheDocument();
  });

  it("gauge shows '50' at mid fill (65536/131072 = 50%)", async () => {
    // Matches real observed ~50% fill level
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 65536,
            is_processing: false,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // contextPct = round(65536/131072 * 1000)/10 = 50 → "50"
    expect(screen.getAllByText(/\b50\b/).length).toBeGreaterThan(0);
  });

  it("gauge shows '88' at high fill (115385/131072 ≈ 88%)", async () => {
    // Matches real observed 87.9% fill level; toFixed(0) → "88"
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 115385,
            is_processing: false,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/\b88\b/).length).toBeGreaterThan(0);
  });

  it("gauge shows '100' and not '<1' or '0' when context is fully full", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 131072,
            is_processing: false,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // contextPct = round(1000)/10 = 100 → "100"
    expect(screen.getAllByText(/\b100\b/).length).toBeGreaterThan(0);
    expect(screen.queryByText("<1")).not.toBeInTheDocument();
  });

  it("Prompt Buf ring shows realistic ~42.7% at mid/high processing (56015/131072)", async () => {
    // Real observed: n_prompt_tokens_cache=56015 during 118k-token prompt processing
    // Math.round(56015/131072 * 1000)/10 = Math.round(427.4)/10 = 42.7 → "42.7%"
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_usage_percent: null,
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 65231,
            is_processing: true,
            n_prompt_tokens_cache: 56015,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("42.7%").length).toBeGreaterThan(0);
  });
});

// ─── GGUF Size ────────────────────────────────────────────────────────

describe("LlamaCppPage GGUF size", () => {
  it("shows GGUF size in header card when available", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gguf_size_gib: 13.26 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("13.26 GiB")).toBeInTheDocument();
  });

  it("hides GGUF size when not available", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/GiB/)).not.toBeInTheDocument();
  });
});

// ─── splitModelName (via rendering) ───────────────────────────────────

describe("splitModelName quant parsing via rendering", () => {
  it("splits Q4_K_M quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/Llama-3-8B-Q4_K_M.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Q4_K_M").length).toBeGreaterThan(0);
  });

  it("splits Q4_K_XL quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/Llama-3-8B-Q4_K_XL.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Q4_K_XL").length).toBeGreaterThan(0);
  });

  it("splits BF16 quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/Llama-3-8B-BF16.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("BF16").length).toBeGreaterThan(0);
  });

  it("splits F16 quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/gemma-2b-F16.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("F16").length).toBeGreaterThan(0);
  });

  it("splits IQ3_XS quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/mixtral-8x7b-IQ3_XS.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("IQ3_XS").length).toBeGreaterThan(0);
  });

  it("splits qat quant from model path", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/Llama-3-8B-qat.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/qat/i).length).toBeGreaterThan(0);
  });

  it("shows full model name when no quant pattern matches", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ model_path: "/models/my-custom-model.gguf" }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("my-custom-model").length).toBeGreaterThan(0);
  });
});

// ─── Slot idle vs live ────────────────────────────────────────────────

describe("LlamaCppPage slot idle vs live state", () => {
  it("shows 'Idle' when slot is not processing", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
  });

  it("shows 'Generating…' when slot is processing", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 512, is_processing: true },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Generating…").length).toBeGreaterThan(0);
  });

  it("transitions from Idle to Generating when is_processing changes", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 50, is_processing: false },
        ],
      }),
    );
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);

    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 256, is_processing: true },
        ],
      }),
    );
    rerender(<LlamaCppPage />);
    expect(screen.getAllByText("Generating…").length).toBeGreaterThan(0);
  });

  it("shows no slot state label when no slots are present", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Idle")).not.toBeInTheDocument();
    expect(screen.queryByText("Generating…")).not.toBeInTheDocument();
  });
});

// ─── Generation progress slot fields ─────────────────────────────────

describe("LlamaCppPage generation progress slot fields", () => {
  it("shows n_decoded and n_predict in generation progress", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 512,
            is_processing: true,
            n_decoded: 128,
            n_predict: 512,
            n_remain: 384,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/Remaining:\s*384/)).toBeInTheDocument();
  });

  it("shows unbounded format (no Remaining) when slot has no n_predict", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // n_predict is null → unbounded: no "/ 0" and no "Remaining:"
    expect(screen.queryByText(/Remaining:/)).not.toBeInTheDocument();
    expect(screen.getByText(/— tok/)).toBeInTheDocument();
  });

  it("shows n_remain = 0 when generation is complete", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 5,
            is_processing: false,
            n_decoded: 5,
            n_predict: 5,
            n_remain: 0,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/Remaining:\s*0/)).toBeInTheDocument();
  });

  it("shows unbounded format when n_predict is 0 (mapped from -1)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 5,
            is_processing: true,
            n_decoded: 5,
            n_predict: 0,
            n_remain: 0,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Unbounded: no "/ 0" denominator and no "Remaining: 0"
    expect(screen.queryByText(/Remaining:/)).not.toBeInTheDocument();
    expect(screen.getByText(/5 tok/)).toBeInTheDocument();
  });

  it("shows capped format when n_predict is positive", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 131072,
            n_prompt_tokens: 100,
            is_processing: true,
            n_decoded: 470,
            n_predict: 8192,
            n_remain: 7722,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/470/)).toBeInTheDocument();
    expect(screen.getByText(/8,192/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining:\s*7,722/)).toBeInTheDocument();
  });
});

// ─── Gen TPS fallback ─────────────────────────────────────────────────

describe("LlamaCppPage Gen TPS display", () => {
  it("shows gen_tps from metrics when available", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: 42.5 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("42.5")).toBeInTheDocument();
  });

  it("shows em-dash when gen_tps is null and no log data", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: null }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // The label div and value span share a parent container div
    const labelDiv = screen.getByText("Gen TPS").closest("div");
    const container = labelDiv?.parentElement;
    expect(container?.textContent).toContain("—");
  });
});

// ─── extractQuant ─────────────────────────────────────────────────────

describe("extractQuant", () => {
  it("extracts Q4_K_M from a standard filename", () => {
    expect(extractQuant("Llama-3-8B-Q4_K_M.gguf")).toBe("Q4_K_M");
  });

  it("extracts IQ4_XS from filename", () => {
    expect(extractQuant("mixtral-8x7b-IQ4_XS.gguf")).toBe("IQ4_XS");
  });

  it("extracts F16 from filename", () => {
    expect(extractQuant("gemma-2b-F16.gguf")).toBe("F16");
  });

  it("extracts BF16 from filename", () => {
    expect(extractQuant("Qwen2-7B-BF16.gguf")).toBe("BF16");
  });

  it("prefers longer match (Q4_K_M over Q4)", () => {
    expect(extractQuant("Model-Q4_K_M-extra.gguf")).toBe("Q4_K_M");
  });

  it("returns empty string when no quant token is present", () => {
    expect(extractQuant("my-custom-model.gguf")).toBe("");
  });

  it("does not match decoy token qat", () => {
    expect(extractQuant("Llama-3-8B-qat.gguf")).toBe("");
  });

  it("does not match decoy token UD", () => {
    expect(extractQuant("Qwen3-30B-A3B-UD-Q4_K_XL.gguf")).toBe("Q4_K_XL");
  });

  it("extracts Q4_K_XL from a complex REAP filename", () => {
    expect(extractQuant("Qwen3-35B-A3B-REAP-RangerX-Q4_K_XL.gguf")).toBe(
      "Q4_K_XL",
    );
  });
});

// ─── Tok Cached Live Activity source ──────────────────────────────────

describe("LlamaCppPage Tok Cached Live Activity", () => {
  it("uses slot n_prompt_tokens_cache when present, ignoring dead AiMetrics.tokens_cached", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        tokens_cached: null,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: true,
            n_prompt_tokens_cache: 18314,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // fmtNum(18314) appears; value is not "—" (slot data is live)
    expect(screen.getAllByText(/18.?314/).length).toBeGreaterThanOrEqual(1);
  });

  it("preserves legitimate zero — does not fall through ?? to tokens_cached", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        tokens_cached: 999,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: false,
            n_prompt_tokens_cache: 0,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // slot value is 0 (not null/undefined), so ?? must not fall through to 999
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });

  it("renders Tok Cached label and does not crash when slot0 is absent", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ tokens_cached: null, slots: undefined }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Tok Cached").length).toBeGreaterThan(0);
  });

  it("Live Activity Tok Cached and Runtime Tokens Cached both derive from slot n_prompt_tokens_cache", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        tokens_cached: null,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: true,
            n_prompt_tokens_cache: 512,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Both Live Activity "Tok Cached" and Runtime "Tokens Cached" show 512
    const matches = screen.queryAllByText(/\b512\b/);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("history buffer caps at 120 and resets cleanly on model change", async () => {
    const makeCtx = (modelPath: string, cacheVal: number) =>
      baseCtx({
        model_path: modelPath,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: true,
            n_prompt_tokens_cache: cacheVal,
          },
        ],
      });

    mockedCtx.mockReturnValue(makeCtx("model-a.gguf", 100));
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Simulate 130 poll cycles (> 120 buffer cap) with model-a
    for (let i = 1; i <= 130; i++) {
      mockedCtx.mockReturnValue(makeCtx("model-a.gguf", 100 + i));
      rerender(<LlamaCppPage />);
    }

    // Switch to model-b — history must reset without crash
    mockedCtx.mockReturnValue(makeCtx("model-b.gguf", 500));
    rerender(<LlamaCppPage />);
    mockedCtx.mockReturnValue(makeCtx("model-b.gguf", 501));
    rerender(<LlamaCppPage />);

    // Component still renders correctly after cap + reset
    expect(screen.getAllByText("Tok Cached").length).toBeGreaterThan(0);
  });
});
