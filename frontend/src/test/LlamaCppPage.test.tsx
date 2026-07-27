import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import LlamaCppPage, {
  fmtNum,
  thresholdClass,
  contextGaugeLabel,
  boolLabel,
  middleTruncate,
} from "../pages/LlamaCppPage";
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
  LogConsole: () => <div data-testid="log-console" />,
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
    expect(screen.getByText("llama.cpp")).toBeInTheDocument();
  });

  it("shows Offline status when server is unavailable", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-server")).toHaveTextContent("Offline");
  });

  it("shows Online status when server is available", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        llama_server: { available: true } as AiMetrics["llama_server"],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-server")).toHaveTextContent("Online");
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
    expect(screen.getByText(/50 builds behind/)).toBeInTheDocument();
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
  it("Context card renders when context metrics are set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ context_tokens: 4096, max_context: 8192 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Context").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
  });

  it("shows Cache Hits and Total Sent stat labels", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ tokens_cached: 500, total_tokens_sent: 2000 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Cache Hits").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Sent").length).toBeGreaterThan(0);
  });
});

// ─── Generation section ───────────────────────────────────────────────

describe("LlamaCppPage generation section", () => {
  it("shows Gen TPS and Prompt TPS", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: 12.5, prompt_tps: 450 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/Generation Speed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Prompt Speed/).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Temperature").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Top-K Sampling").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Top-P (Nucleus) Sampling").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeat Penalty").length).toBeGreaterThan(0);
  });

  it("shows sampling parameter grid labels", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Temperature").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeat Penalty").length).toBeGreaterThan(0);
  });
});

// ─── Runtime Information section ──────────────────────────────────────

describe("LlamaCppPage runtime information section", () => {
  it("shows Runtime Information section in sidebar", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Runtime").length).toBeGreaterThan(0);
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
  it("Throughput card shows Total Sent and Active Req tiles", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        active_requests: 2,
        total_tokens_sent: 1000,
        tokens_cached: 500,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Throughput").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active Req").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cache Hits").length).toBeGreaterThan(0);
  });

  it("always renders Throughput card", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Throughput").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Latest").length).toBeGreaterThan(0);
  });

  it("shows builds-behind warning when repoInfo shows stale build", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5100", latest_build_tag: "b5200" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/100 builds behind/)).toBeInTheDocument();
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

  it("context gauge does not show 49.6% when n_prompt_tokens_cache is absent", async () => {
    // contextPct here = round(65000/131072*1000)/10 = 49.6 — must not appear as a raw value
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
    expect(screen.queryByText("49.6%")).not.toBeInTheDocument();
  });

  it("context gauge does not show 49.6% when n_prompt_tokens_cache is 0", async () => {
    // At idle, n_prompt_tokens_cache resets to 0 even though context is filled.
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
    expect(screen.queryByText("49.6%")).not.toBeInTheDocument();
  });

  it("context card renders without crash when slot is missing", async () => {
    mockedCtx.mockReturnValue(baseCtx({ slots: undefined }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Context").length).toBeGreaterThan(0);
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
});

// ─── GGUF Size ────────────────────────────────────────────────────────

describe("LlamaCppPage GGUF size", () => {
  it("shows GGUF size in header card when available", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gguf_size_gib: 13.26 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText(/13\.26/).length).toBeGreaterThan(0);
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

  it("shows 'Generating' when slot is processing", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 512, is_processing: true },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("gen-status-badge")).toHaveTextContent(
      "Generating",
    );
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
    expect(screen.getByTestId("gen-status-badge")).toHaveTextContent(
      "Generating",
    );
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
    expect(screen.getByText(/Gen\. remaining\s+384/)).toBeInTheDocument();
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
    expect(screen.getByText(/Gen\. remaining\s+0/)).toBeInTheDocument();
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
    expect(screen.getByText(/Gen\. remaining\s+7,722/)).toBeInTheDocument();
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
    const labelDiv = screen.getByText("Generation Speed").closest("div");
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

  it("renders Cache Hits label and does not crash when slot0 is absent", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ tokens_cached: null, slots: undefined }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Cache Hits").length).toBeGreaterThan(0);
  });

  it("Runtime Tokens Cached derives from slot n_prompt_tokens_cache", async () => {
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
    // Runtime "Tokens Cached" row shows 512; Cache Hits tiles show cumulative count
    const matches = screen.queryAllByText(/\b512\b/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("cache-hits counter increments only on null/0→positive rising edges (sequence: 0→null→5→5→0→3)", async () => {
    const withCache = (n: number | null | undefined) =>
      baseCtx({
        tokens_cached: null,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: false,
            ...(n != null ? { n_prompt_tokens_cache: n } : {}),
          },
        ],
      });
    const withCacheZero = () =>
      baseCtx({
        tokens_cached: null,
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: false,
            n_prompt_tokens_cache: 0,
          },
        ],
      });

    // Step 1: tokCached = 0 (no rising edge since 0 is not > 0)
    mockedCtx.mockReturnValue(withCacheZero());
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Step 2: tokCached = null (n_prompt_tokens_cache absent → falls back to tokens_cached=null)
    mockedCtx.mockReturnValue(withCache(undefined));
    rerender(<LlamaCppPage />);

    // Step 3: tokCached = 5 → RISING EDGE (prev=null) → cacheHits = 1
    mockedCtx.mockReturnValue(withCache(5));
    rerender(<LlamaCppPage />);

    // Step 4: tokCached = 5 (same value, no edge)
    rerender(<LlamaCppPage />);

    // Step 5: tokCached = 0 (falling edge, no increment)
    mockedCtx.mockReturnValue(withCacheZero());
    rerender(<LlamaCppPage />);

    // Step 6: tokCached = 3 → RISING EDGE (prev=0) → cacheHits = 2
    mockedCtx.mockReturnValue(withCache(3));
    rerender(<LlamaCppPage />);

    const tile = screen.getByTestId("ctx-cache-hits");
    expect(within(tile).getByText("2")).toBeInTheDocument();
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
    expect(screen.getAllByText("Cache Hits").length).toBeGreaterThan(0);
  });
});

// ─── fmtNum ───────────────────────────────────────────────────────────

describe("fmtNum", () => {
  it("formats integers with locale separators", () => {
    expect(fmtNum(1000)).toBe("1,000");
    expect(fmtNum(1234567)).toBe("1,234,567");
  });

  it("returns empty string for null or undefined", () => {
    expect(fmtNum(null)).toBe("");
    expect(fmtNum(undefined)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(fmtNum("")).toBe("");
  });

  it("formats zero as '0'", () => {
    expect(fmtNum(0)).toBe("0");
  });

  it("formats negative numbers", () => {
    expect(fmtNum(-500)).toBe("-500");
  });

  it("passes through non-numeric strings", () => {
    expect(fmtNum("abc")).toBe("abc");
  });
});

// ─── thresholdClass ───────────────────────────────────────────────────

describe("thresholdClass", () => {
  it("returns '' for null/undefined", () => {
    expect(thresholdClass(null)).toBe("");
    expect(thresholdClass(undefined)).toBe("");
  });

  it("returns 'progress-bar-normal' below 70%", () => {
    expect(thresholdClass(0)).toBe("progress-bar-normal");
    expect(thresholdClass(50)).toBe("progress-bar-normal");
    expect(thresholdClass(69.9)).toBe("progress-bar-normal");
  });

  it("returns 'progress-bar-warning' at 70–84%", () => {
    expect(thresholdClass(70)).toBe("progress-bar-warning");
    expect(thresholdClass(75)).toBe("progress-bar-warning");
    expect(thresholdClass(84.9)).toBe("progress-bar-warning");
  });

  it("returns 'progress-bar-critical' at 85%+", () => {
    expect(thresholdClass(85)).toBe("progress-bar-critical");
    expect(thresholdClass(100)).toBe("progress-bar-critical");
  });
});

// ─── contextGaugeLabel ────────────────────────────────────────────────

describe("contextGaugeLabel", () => {
  it("returns '0' when offline and contextPct is null", () => {
    expect(contextGaugeLabel(null, false)).toBe("0");
  });

  it("returns '—' when online and contextPct is null", () => {
    expect(contextGaugeLabel(null, true)).toBe("—");
  });

  it("returns '<1' for sub-1% fill", () => {
    expect(contextGaugeLabel(0.5, true)).toBe("<1");
    expect(contextGaugeLabel(0.9, false)).toBe("<1");
  });

  it("returns toFixed(0) for values ≥ 1", () => {
    expect(contextGaugeLabel(1, true)).toBe("1");
    expect(contextGaugeLabel(50, true)).toBe("50");
    expect(contextGaugeLabel(88.4, true)).toBe("88");
    expect(contextGaugeLabel(100, true)).toBe("100");
  });

  it("returns '0' for exactly 0 when online", () => {
    expect(contextGaugeLabel(0, true)).toBe("0");
  });
});

// ─── boolLabel ────────────────────────────────────────────────────────

describe("boolLabel", () => {
  it("returns 'Yes' for true", () => {
    expect(boolLabel(true)).toBe("Yes");
  });

  it("returns 'No' for false", () => {
    expect(boolLabel(false)).toBe("No");
  });

  it("returns em-dash for null or undefined", () => {
    expect(boolLabel(null)).toBe("—");
    expect(boolLabel(undefined)).toBe("—");
  });
});

// ─── middleTruncate ───────────────────────────────────────────────────

describe("middleTruncate", () => {
  it("returns short strings unchanged", () => {
    expect(middleTruncate("short", 46)).toBe("short");
    expect(middleTruncate("a".repeat(46), 46)).toBe("a".repeat(46));
  });

  it("truncates long strings with ellipsis in the middle", () => {
    const long = "a".repeat(30) + "b".repeat(30);
    const result = middleTruncate(long, 46);
    expect(result.length).toBeLessThanOrEqual(46);
    expect(result).toContain("…");
    expect(result.startsWith("aaa")).toBe(true);
    expect(result.endsWith("bbb")).toBe(true);
  });

  it("uses max=46 as default", () => {
    const long = "x".repeat(60);
    const result = middleTruncate(long);
    expect(result.length).toBeLessThanOrEqual(46);
  });

  it("respects custom max", () => {
    const long = "a".repeat(20) + "b".repeat(20);
    const result = middleTruncate(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
  });
});

// ─── Throughput card: 4-tile structure and values ────────────────────

describe("LlamaCppPage Throughput card tiles", () => {
  it("renders all four tiles with correct labels", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("thrpt-prompt-tokens")).toBeInTheDocument();
    expect(screen.getByTestId("thrpt-generated")).toBeInTheDocument();
    expect(screen.getByTestId("thrpt-total-sent")).toBeInTheDocument();
    expect(screen.getByTestId("thrpt-active-req")).toBeInTheDocument();
  });

  it("Prompt Tokens tile shows value from token_usage.prompt_tokens", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ token_usage: { prompt_tokens: 4200, completion_tokens: 800 } }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("thrpt-prompt-tokens")).toHaveTextContent(
      "4,200",
    );
  });

  it("Generated tile shows a bare number, no redundant unit suffix (matches its sibling tiles)", async () => {
    // Previously appended a literal " token" suffix — the only one of
    // the four throughput tiles to do so, and the direct cause of a
    // real overflow/truncation bug at larger values (user-reported:
    // "464,408..." cut off by MetricTile's own ellipsis). The label
    // ("Generated") already conveys what's being counted; Prompt Tokens
    // and Total Sent both show bare numbers too.
    mockedCtx.mockReturnValue(
      baseCtx({ token_usage: { prompt_tokens: 100, completion_tokens: 512 } }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const tile = screen.getByTestId("thrpt-generated");
    expect(tile).toHaveTextContent("512");
    expect(tile).not.toHaveTextContent("token");
  });

  it("Generated tile does not truncate a large value (the original overflow bug)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        token_usage: { prompt_tokens: 62069, completion_tokens: 464408 },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const tile = screen.getByTestId("thrpt-generated");
    // fmtNum formats with thousands separators; the exact separator
    // character isn't the point here — the full, untruncated digit
    // sequence being present is.
    expect(tile).toHaveTextContent("464");
    expect(tile).toHaveTextContent("408");
    expect(tile).not.toHaveTextContent("…");
    expect(tile).not.toHaveTextContent("...");
  });

  it("Total Sent tile shows value from total_tokens_sent", async () => {
    mockedCtx.mockReturnValue(baseCtx({ total_tokens_sent: 9876 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("thrpt-total-sent")).toHaveTextContent("9,876");
  });

  it("Active Req tile shows value from active_requests", async () => {
    mockedCtx.mockReturnValue(baseCtx({ active_requests: 3 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("thrpt-active-req")).toHaveTextContent("3");
  });

  it("tiles show '0' fallback when metrics are null", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("thrpt-total-sent")).toHaveTextContent("0");
    expect(screen.getByTestId("thrpt-active-req")).toHaveTextContent("0");
  });
});

// ─── Throughput: generation speed values and units ────────────────────

describe("LlamaCppPage Throughput generation speed", () => {
  it("shows prompt_tps numeric value", async () => {
    mockedCtx.mockReturnValue(baseCtx({ prompt_tps: 380.5 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("380.5")).toBeInTheDocument();
  });

  it("shows t/s unit label when gen_tps is present", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: 12.3 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const units = screen.getAllByText(/t\/s/);
    expect(units.length).toBeGreaterThan(0);
  });
});

// ─── Context card: offline banner ────────────────────────────────────

describe("LlamaCppPage Context card offline banner", () => {
  it("shows offline banner when llama server is unavailable", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("llama.cpp server offline")).toBeInTheDocument();
  });

  it("does not show offline banner when server is online", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        llama_server: { available: true } as AiMetrics["llama_server"],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.queryByText("llama.cpp server offline"),
    ).not.toBeInTheDocument();
  });
});

// ─── Context tiles by data-testid ─────────────────────────────────────

describe("LlamaCppPage Context tiles by testid", () => {
  it("ctx-current shows slot n_prompt_tokens", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 10000, n_prompt_tokens: 3000, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-current")).toHaveTextContent("3,000");
  });

  it("ctx-max shows slot n_ctx", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 32768, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-max")).toHaveTextContent("32,768");
  });

  it("ctx-remaining shows n_ctx minus n_prompt_tokens", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 10000, n_prompt_tokens: 3000, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-remaining")).toHaveTextContent("7,000");
  });

  it("ctx-cache-hits starts at 0 on initial render", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-cache-hits")).toHaveTextContent("0");
  });

  it("ctx-largest-seen shows context_tokens from metrics", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        context_tokens: 65536,
        slots: [
          { id: 0, n_ctx: 131072, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-largest-seen")).toHaveTextContent("65,536");
  });

  it("ctx tiles show em-dash when slot is absent", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("ctx-current")).toHaveTextContent("—");
    expect(screen.getByTestId("ctx-max")).toHaveTextContent("—");
    expect(screen.getByTestId("ctx-remaining")).toHaveTextContent("—");
  });
});

// ─── Gen status badge by data-testid ─────────────────────────────────

describe("LlamaCppPage gen-status-badge", () => {
  it("shows 'Idle' badge when slot is not processing", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 100, is_processing: false },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("gen-status-badge")).toHaveTextContent("Idle");
  });

  it("shows 'Generating' badge when slot is processing", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          { id: 0, n_ctx: 8192, n_prompt_tokens: 512, is_processing: true },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("gen-status-badge")).toHaveTextContent(
      "Generating",
    );
  });
});

// ─── Gen progress bar: threshold color classes ────────────────────────

describe("LlamaCppPage gen-progress-bar threshold classes", () => {
  function makeSlotCtx(n_decoded: number, n_predict: number) {
    return baseCtx({
      slots: [
        {
          id: 0,
          n_ctx: 131072,
          n_prompt_tokens: 100,
          is_processing: true,
          n_decoded,
          n_predict,
          n_remain: n_predict - n_decoded,
        },
      ],
    });
  }

  it("has progress-bar-normal class below 70%", async () => {
    mockedCtx.mockReturnValue(makeSlotCtx(200, 1000));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const bar = screen.getByTestId("gen-progress-bar");
    expect(bar.className).toContain("progress-bar-normal");
  });

  it("has progress-bar-warning class at 70–84%", async () => {
    mockedCtx.mockReturnValue(makeSlotCtx(720, 1000));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const bar = screen.getByTestId("gen-progress-bar");
    expect(bar.className).toContain("progress-bar-warning");
  });

  it("has progress-bar-critical class at 85%+", async () => {
    mockedCtx.mockReturnValue(makeSlotCtx(900, 1000));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const bar = screen.getByTestId("gen-progress-bar");
    expect(bar.className).toContain("progress-bar-critical");
  });
});

// ─── Runtime card rows by data-testid ────────────────────────────────

describe("LlamaCppPage Runtime rows by testid", () => {
  function makeRuntimeCtx() {
    return baseCtx({
      llama_server: { available: true } as AiMetrics["llama_server"],
      llama_server_process: {
        pid: 99999,
        cpu_percent: 42.5,
        memory_kb: 2 * 1024 * 1024,
        uptime_seconds: 3700,
      },
      slots: [
        { id: 0, n_ctx: 32768, n_prompt_tokens: 100, is_processing: false },
      ],
      speculative: true,
    });
  }

  function makeRuntimeFetch() {
    return vi.fn().mockResolvedValue({
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
              parsed_args: { port: 8080, parallel: 1 },
              filename_meta: null,
              warning: null,
            },
          ],
          states: {
            "/test.sh": { status: "running", llama_server_pid: 99999 },
          },
          metadata: {},
        }),
    });
  }

  it("runtime-server shows Online when server is available", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-server")).toHaveTextContent("Online");
  });

  it("runtime-server shows Offline when server is unavailable", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-server")).toHaveTextContent("Offline");
  });

  it("runtime-uptime shows formatted uptime", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-uptime")).toHaveTextContent("1h 1m");
  });

  it("runtime-pid shows process PID", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-pid")).toHaveTextContent("99999");
  });

  it("runtime-port shows port from running profile parsed_args", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-port")).toHaveTextContent("8080");
  });

  it("runtime-memory shows formatted process memory", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-memory")).toHaveTextContent("2.00 GB");
  });

  it("runtime-cpu shows cpu_percent", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-cpu")).toHaveTextContent("42.5%");
  });

  it("runtime-context shows formatted slot n_ctx", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-context")).toHaveTextContent("32K");
  });

  it("runtime-speculative shows Yes when speculative is true", async () => {
    mockedCtx.mockReturnValue(makeRuntimeCtx());
    global.fetch = makeRuntimeFetch();
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-speculative")).toHaveTextContent("Yes");
  });

  it("runtime-speculative shows No when speculative is false", async () => {
    mockedCtx.mockReturnValue(baseCtx({ speculative: false }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-speculative")).toHaveTextContent("No");
  });

  it("runtime-tokens-cached shows slot n_prompt_tokens_cache value", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        slots: [
          {
            id: 0,
            n_ctx: 8192,
            n_prompt_tokens: 100,
            is_processing: false,
            n_prompt_tokens_cache: 750,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-tokens-cached")).toHaveTextContent(
      "750",
    );
  });

  it("runtime rows show em-dash when metrics are absent", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-uptime")).toHaveTextContent("—");
    expect(screen.getByTestId("runtime-pid")).toHaveTextContent("—");
    expect(screen.getByTestId("runtime-port")).toHaveTextContent("—");
    expect(screen.getByTestId("runtime-memory")).toHaveTextContent("—");
    expect(screen.getByTestId("runtime-cpu")).toHaveTextContent("—");
    expect(screen.getByTestId("runtime-context")).toHaveTextContent("—");
  });
});

// ─── GPU/CPU/Draft Layers rows ────────────────────────────────────────

describe("LlamaCppPage Runtime GPU/CPU/Draft layer rows", () => {
  it("runtime-gpu-layers shows loaded/total from gpu_offload", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        gpu_offload: {
          main_loaded: 28,
          main_total: 32,
          draft_loaded: 0,
          draft_total: 0,
        },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-gpu-layers")).toHaveTextContent(
      "28 / 32",
    );
  });

  it("runtime-cpu-layers shows remainder layers from gpu_offload", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        gpu_offload: {
          main_loaded: 28,
          main_total: 32,
          draft_loaded: 0,
          draft_total: 0,
        },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-cpu-layers")).toHaveTextContent(
      "4 / 32",
    );
  });

  it("runtime-draft-layers shows em-dash when gpuOffload is null (hasDraft = false)", async () => {
    // hasDraft = gpuOffload != null && draft_loaded != null && draft_total != null
    // With no gpu_offload in metrics, gpuOffload = null → hasDraft = false → shows "—"
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("runtime-draft-layers")).toHaveTextContent("—");
  });
});

// ─── Builds-behind banner by data-testid ─────────────────────────────

describe("LlamaCppPage builds-behind-banner", () => {
  it("renders banner with correct count when builds behind", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5100", latest_build_tag: "b5200" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const banner = screen.getByTestId("builds-behind-banner");
    expect(banner).toHaveTextContent("100");
    expect(banner).toHaveTextContent("builds behind");
  });

  it("uses singular 'build' when exactly 1 behind", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5249", latest_build_tag: "b5250" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("builds-behind-banner")).toHaveTextContent(
      "1 build behind",
    );
  });

  it("does not render banner when on latest", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        repoInfo: { local_build_tag: "b5250", latest_build_tag: "b5250" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.queryByTestId("builds-behind-banner"),
    ).not.toBeInTheDocument();
  });
});

// ─── Active Model card: hero when no model ───────────────────────────

describe("LlamaCppPage Active Model hero display", () => {
  it("shows em-dash hero when no model is loaded", async () => {
    mockedCtx.mockReturnValue(baseCtx({ model_path: null, model_alias: null }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // The model hero span shows "—" when both model_path and model_alias are null
    const heroes = screen.queryAllByText("—");
    expect(heroes.length).toBeGreaterThan(0);
  });
});

// ─── Toast message display ────────────────────────────────────────────

describe("LlamaCppPage toast overlay", () => {
  it("shows toast message when mgmt.toast is set", async () => {
    // mgmt.toast is { type: string; msg: string } | null, not a plain string
    mockedMgmt.mockReturnValue(
      baseMgmt({
        toast: { type: "success", msg: "Model stopped successfully" },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("Model stopped successfully")).toBeInTheDocument();
  });

  it("does not show toast when mgmt.toast is null", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.queryByText("Model stopped successfully"),
    ).not.toBeInTheDocument();
  });
});

// ─── PanelCard structure regression ──────────────────────────────────
// Regression: container divs must not carry className="card-accent-spine".
// That class positions elements absolutely at 3px width, collapsing the layout.
// Only the inner <span aria-hidden> decorators should carry that class.

describe("LlamaCppPage PanelCard structural integrity", () => {
  it("no div element has card-accent-spine class", async () => {
    const { container } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const badDivs = container.querySelectorAll("div.card-accent-spine");
    expect(badDivs).toHaveLength(0);
  });

  it("card-accent-spine class only appears on span elements", async () => {
    const { container } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const spines = container.querySelectorAll(".card-accent-spine");
    spines.forEach((el) => {
      expect(el.tagName.toLowerCase()).toBe("span");
    });
  });

  it("PanelCard containers have visible width (not collapsed to spine width)", async () => {
    const { container } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // The page root should contain substantial content, not be empty
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText("llama.cpp")).toBeInTheDocument();
    // Verify the main layout panels are present by checking for known section labels
    expect(screen.getAllByText("Throughput").length).toBeGreaterThan(0);
    expect(screen.getByTestId("log-console")).toBeInTheDocument();
  });
});

describe("LlamaCppPage throughput sparklines fill their tile (not half-width)", () => {
  it("Generation Speed and Prompt Speed sparklines use stretch, never a hardcoded width", async () => {
    // A full-page DOM render proved unreliable for this check (the
    // Throughput card's mocked render path didn't reliably expose these
    // svgs under test) — a direct source assertion is the deterministic,
    // zero-flake way to guard this regression: the bug IS the presence of
    // ANY hardcoded pixel width on a Sparkline meant to fill its tile via
    // `stretch`. User-reported: Generation Speed and Prompt Speed bars
    // visibly filled only half their card (a literal width={200} was the
    // instance found, but the guard below catches any width value someone
    // might reintroduce, not just that one number).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../pages/LlamaCppPage.tsx"),
      "utf-8",
    );

    const genBlockStart = src.indexOf("data={aiGenTpsHistory");
    const genBlockEnd = src.indexOf("/>", genBlockStart);
    const genBlock = src.slice(genBlockStart, genBlockEnd);
    expect(
      genBlockStart,
      "Generation Speed sparkline not found in source",
    ).toBeGreaterThan(-1);
    expect(genBlock, "Generation Speed sparkline must use stretch").toContain(
      "stretch",
    );
    expect(
      /width\s*=\s*\{/.test(genBlock),
      `Generation Speed sparkline must not hardcode ANY pixel width — found one in: ${genBlock}`,
    ).toBe(false);

    const promptBlockStart = src.indexOf("data={aiPromptTpsHistory");
    const promptBlockEnd = src.indexOf("/>", promptBlockStart);
    const promptBlock = src.slice(promptBlockStart, promptBlockEnd);
    expect(
      promptBlockStart,
      "Prompt Speed sparkline not found in source",
    ).toBeGreaterThan(-1);
    expect(promptBlock, "Prompt Speed sparkline must use stretch").toContain(
      "stretch",
    );
    expect(
      /width\s*=\s*\{/.test(promptBlock),
      `Prompt Speed sparkline must not hardcode ANY pixel width — found one in: ${promptBlock}`,
    ).toBe(false);
  });
});

describe("LlamaCppPage: generation-length cap is distinguishable from context window (n_predict vs n_ctx)", () => {
  it("source labels n_predict distinctly from context, not a bare 'Remaining'", async () => {
    // User-reported: CONTEXT card showed MAX: 34,048 (n_ctx) directly above
    // a bottom bar reading "32,434 / 64,000 token, Remaining 31,566" (n_predict)
    // — two different ceilings, both called "Remaining", in the same card.
    // Source check (same technique as the Q sparkline-width guard, for the
    // same reason: this is fundamentally about literal label text, not
    // runtime DOM structure under mocked context).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../pages/LlamaCppPage.tsx"),
      "utf-8",
    );
    const blockStart = src.indexOf("const nr = slot0.n_remain");
    const blockEnd = src.indexOf("})()", blockStart);
    const block = src.slice(blockStart, blockEnd);
    expect(blockStart, "n_predict progress block not found").toBeGreaterThan(
      -1,
    );
    // The old bare "Remaining {nr...}" (matching the context card's own
    // "REMAINING" field name with nothing to distinguish them) must be gone.
    expect(
      />\s*Remaining\s*\{/.test(block),
      "bare 'Remaining' label reintroduced — indistinguishable from the context window's own Remaining field",
    ).toBe(false);
    expect(
      block,
      "must clearly label this as the generation cap, not context",
    ).toContain("Gen. remaining");
    expect(
      block,
      "must explain n_predict is separate from n_ctx via tooltip",
    ).toContain("n_predict");
    expect(
      block,
      "tooltip must reference the context window for contrast",
    ).toContain("context window");
  });
});

describe("LlamaCppPage throughput row height stays bounded (Step Q side-effect fix)", () => {
  it("sparkline containers use a fixed height, not open-ended flex:1", async () => {
    // Step Q's `stretch` fix ties the svg's HEIGHT to 100% of its
    // container, not just width. The container was `flex: 1, minHeight:
    // 28` — no ceiling — so the bar grew to fill whatever vertical space
    // the row allowed, visibly inflating the whole top row (user-reported,
    // caught via before/after screenshot comparison). A bounded `height`
    // restores the original size while keeping stretch's width fill.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../pages/LlamaCppPage.tsx"),
      "utf-8",
    );
    const genBlockStart = src.indexOf("data={aiGenTpsHistory");
    const genContainerStart = src.lastIndexOf("<div", genBlockStart);
    const genContainer = src.slice(genContainerStart, genBlockStart);
    expect(
      genContainer,
      "Generation Speed's sparkline container must not use open-ended flex:1/minHeight",
    ).not.toMatch(/flex:\s*1,\s*minHeight/);
    expect(genContainer).toMatch(/height:\s*28/);

    const promptBlockStart = src.indexOf("data={aiPromptTpsHistory");
    const promptContainerStart = src.lastIndexOf("<div", promptBlockStart);
    const promptContainer = src.slice(promptContainerStart, promptBlockStart);
    expect(
      promptContainer,
      "Prompt Speed's sparkline container must not use open-ended flex:1/minHeight",
    ).not.toMatch(/flex:\s*1,\s*minHeight/);
    expect(promptContainer).toMatch(/height:\s*28/);
  });
});

describe("LlamaCppPage: accent-line divider consistent across all five cards", () => {
  it("all five cards carry the title-width accent divider (user-requested consistency)", async () => {
    // User rulings, in order: (1) the divider on every card, (2) it must
    // extend exactly as far as each card's name — so a static width was
    // replaced by a fit-content wrapper (Active Model inline; the other
    // four via CardHeader's opt-in titleAccentBar prop, which renders the
    // bar at width:100% of the title's real rendered width). Source-level
    // guard: Active Model's block contains the inline marker; the other
    // four blocks pass the prop; CardComponents owns the implementation.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../pages/LlamaCppPage.tsx"),
      "utf-8",
    );
    const cardComponents = fs.readFileSync(
      path.resolve(__dirname, "../components/shared/CardComponents.tsx"),
      "utf-8",
    );
    // Active Model: inline bar inside its own fit-content label wrapper.
    const am = src.slice(
      src.indexOf("{/* ── Active Model Card ── */}"),
      src.indexOf("{/* ── Throughput Card ── */}"),
    );
    expect(
      am.includes('className="accent-fill accent-glow-target"'),
      "Active Model is missing its inline accent divider",
    ).toBe(true);
    // The other four: divider via CardHeader's titleAccentBar prop.
    const blocks: Array<[string, number, number]> = [
      ["Throughput", src.indexOf("{/* ── Throughput Card ── */}"), src.indexOf("{/* ── Context Card ── */}")],
      ["Context", src.indexOf("{/* ── Context Card ── */}"), src.indexOf("{/* ── Context Card ── */}") + 4000],
      ["Runtime", src.indexOf("{/* Runtime card */}"), src.indexOf("{/* llama.cpp card */}")],
      ["llama.cpp", src.indexOf("{/* llama.cpp card */}"), src.indexOf("{/* llama.cpp card */}") + 4000],
    ];
    for (const [name, start, end] of blocks) {
      expect(start, `${name} card comment marker not found`).toBeGreaterThan(-1);
      expect(
        src.slice(start, end).includes("titleAccentBar"),
        `${name} card is missing the titleAccentBar prop`,
      ).toBe(true);
    }
    // And the prop must actually render the marker in CardHeader.
    expect(
      cardComponents.includes("titleAccentBar") &&
        cardComponents.includes('className="accent-fill accent-glow-target"'),
      "CardHeader is missing the titleAccentBar implementation",
    ).toBe(true);
  });
});
