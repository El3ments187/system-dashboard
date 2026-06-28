import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LlamaCppPage, {
  fmtUptime,
  fmtKb,
  fmtLatency,
  calcBuildsBehind,
} from "../pages/LlamaCppPage";
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
    cpuCurrentValues: [25, 8, 16, 50] as unknown as number[],
    memoryCurrentValues: [60, 9.5, 16, 0] as unknown as number[],
    gpuCurrentValues: [80, 72, 10, 16] as unknown as number[],
    cpuHistory: [],
    memoryHistory: [],
    gpuHistory: [],
    gpuVramUtilHistory: [],
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
    // filename appears in header (and possibly sidebar), so expect ≥1 occurrence
    expect(screen.getAllByText("Qwen3-7B-Q4_K_M.gguf").length).toBeGreaterThan(
      0,
    );
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
    mockedMgmt.mockReturnValue(baseMgmt({ llamaVersion: "b5200" }));
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
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("GPU")).toBeInTheDocument();
    expect(screen.getByText("VRAM")).toBeInTheDocument();
    expect(screen.getByText("GPU Temp")).toBeInTheDocument();
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
  it("shows branch and commit from gitInfo", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({ gitInfo: { branch: "master", commit_hash: "abc1234" } }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // branch and commit appear in both status card and sidebar
    expect(screen.getAllByText("master").length).toBeGreaterThan(0);
    expect(screen.getAllByText("abc1234").length).toBeGreaterThan(0);
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
  it("shows Current, Max, Remaining tiles when context metrics are set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ context_tokens: 4096, max_context: 8192 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Verify tile labels — locale-safe (avoids toLocaleString variability)
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Max").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Remaining").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Largest Seen").length).toBeGreaterThan(0);
  });

  it("shows context percentage bar when both tokens are set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ context_tokens: 2048, max_context: 8192 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("25.0%").length).toBeGreaterThan(0);
  });

  it("shows cached and total token tiles when token_usage is set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        token_usage: {
          cached_tokens: 500,
          total_tokens: 2000,
          prompt_tokens: 1000,
          completion_tokens: 1000,
        },
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Cached Tok").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total Tok").length).toBeGreaterThan(0);
  });
});

// ─── Generation section ───────────────────────────────────────────────

describe("LlamaCppPage generation section", () => {
  it("shows Gen TPS and Prompt TPS", async () => {
    mockedCtx.mockReturnValue(baseCtx({ gen_tps: 12.5, prompt_tps: 450 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Gen TPS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prompt TPS").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Top-K").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Top-P").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeat Pen").length).toBeGreaterThan(0);
  });

  it("shows Min-P and Presence Pen tiles", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Min-P").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Presence Pen").length).toBeGreaterThan(0);
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
  it("renders when active_requests is non-null", async () => {
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
    expect(screen.getByText("Server Activity")).toBeInTheDocument();
    expect(screen.getByText("45ms")).toBeInTheDocument();
  });

  it("always renders even when no activity metrics are available", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("Server Activity")).toBeInTheDocument();
  });
});

// ─── KV Cache section ─────────────────────────────────────────────────

describe("LlamaCppPage KV cache section", () => {
  it("renders KV Cache section when kv_cache_usage_percent is available", async () => {
    mockedCtx.mockReturnValue(baseCtx({ kv_cache_usage_percent: 42.5 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("KV Cache").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42.5%").length).toBeGreaterThan(0);
  });

  it("renders GPU memory from kv_cache_stats", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_stats: [
          {
            gpu_cache_usage_pct: 38,
            used_gpu_memory_mb: 8704,
            free_gpu_memory_mb: 7168,
          },
        ],
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("KV Cache").length).toBeGreaterThan(0);
    // 8704 / 1024 = 8.5 GB
    expect(screen.getByText("8.5 GB")).toBeInTheDocument();
    // 7168 / 1024 = 7.0 GB
    expect(screen.getByText("7.0 GB")).toBeInTheDocument();
  });

  it("always shows KV Cache section even when no KV cache metrics are present", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("KV Cache").length).toBeGreaterThan(0);
  });
});

// ─── Model / Build header card ────────────────────────────────────────

describe("LlamaCppPage model/build header card", () => {
  it("shows version and working directory in header card", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({ llamaVersion: "b5200", dirPath: "/opt/llama.cpp" }),
    );
    mockedCtx.mockReturnValue(baseCtx({ build_info: "b5200 (cuda)" }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Version appears in header right card
    expect(screen.getAllByText("b5200").length).toBeGreaterThan(0);
    // Working directory path appears in header right card
    expect(screen.getByText("/opt/llama.cpp")).toBeInTheDocument();
    // Build & Management sidebar section is gone
    expect(screen.queryByText("Build & Management")).not.toBeInTheDocument();
  });

  it("shows git branch and commit in header card when available", async () => {
    mockedMgmt.mockReturnValue(
      baseMgmt({
        gitInfo: { branch: "main", commit_hash: "def5678" },
        dirPath: "/opt/llama.cpp",
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const branchEls = screen.getAllByText("main");
    expect(branchEls.length).toBeGreaterThan(0);
    const commitEls = screen.getAllByText("def5678");
    expect(commitEls.length).toBeGreaterThan(0);
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

  it("hides load time row when not available", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Load Time")).not.toBeInTheDocument();
  });
});

// ─── Context usage progress bar ───────────────────────────────────────

describe("LlamaCppPage context usage bar", () => {
  it("shows Usage label and token counts when max_context is set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ context_tokens: 50000, max_context: 131072 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Usage").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/131,072 tokens/).length).toBeGreaterThan(0);
  });

  it("shows 0% bar when max_context is set but context_tokens is null", async () => {
    mockedCtx.mockReturnValue(baseCtx({ max_context: 131072 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Usage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0%").length).toBeGreaterThan(0);
  });

  it("always shows Usage bar even when max_context is null", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("Usage").length).toBeGreaterThan(0);
  });
});

// ─── KV Cache memory metrics ──────────────────────────────────────────

describe("LlamaCppPage KV cache memory metrics", () => {
  it("shows Memory Reserved when kv_cache_reserved_mib is set", async () => {
    mockedCtx.mockReturnValue(baseCtx({ kv_cache_reserved_mib: 720 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("720.0 MiB").length).toBeGreaterThan(0);
  });

  it("shows Memory Used derived from reserved * contextPct", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 1000,
        context_tokens: 50000,
        max_context: 100000,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // contextPct = 50%, kvUsedMib = 1000 * 0.5 = 500.0
    expect(screen.getAllByText("500.0 MiB").length).toBeGreaterThan(0);
  });

  it("shows '—' for memory rows when kv_cache_reserved_mib is null", async () => {
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("Memory Reserved")).toBeInTheDocument();
    expect(screen.getByText("Memory Used")).toBeInTheDocument();
  });
});

// ─── KV Cache inline section in Context card ─────────────────────────

describe("LlamaCppPage KV Cache inline section in Context card", () => {
  it("shows KV Cache label and Memory Reserved when reserved is set", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 832.5,
        context_tokens: 50000,
        max_context: 131072,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("KV Cache").length).toBeGreaterThan(0);
    expect(screen.getAllByText("832.5 MiB").length).toBeGreaterThan(0);
  });

  it("shows Memory Used as '—' when context_tokens is null (empty state)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({ kv_cache_reserved_mib: 832.5, max_context: 131072 }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // No context data → kvUsedMib is null → Memory Used always shows with "—"
    expect(screen.getByText("Memory Used")).toBeInTheDocument();
    expect(screen.getAllByText("832.5 MiB").length).toBeGreaterThan(0);
  });

  it("shows reserved MiB as Memory Used when context is 100% (full state)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 832.5,
        context_tokens: 131072,
        max_context: 131072,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Both Memory Used and Memory Reserved show 832.5 MiB
    expect(screen.getAllByText("832.5 MiB").length).toBeGreaterThanOrEqual(2);
  });

  it("is synchronized with context utilization (25%)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 1000,
        context_tokens: 25000,
        max_context: 100000,
      }),
    );
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // contextPct = 25 → kvUsedMib = 1000 * 0.25 = 250
    expect(screen.getAllByText("250.0 MiB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1000.0 MiB").length).toBeGreaterThan(0);
  });

  it("shows '—' for Memory Reserved when kv_cache_reserved_mib is null", async () => {
    mockedCtx.mockReturnValue(baseCtx({ max_context: 131072 }));
    render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText("Memory Reserved")).toBeInTheDocument();
  });

  it("updates live when context changes between renders", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 1000,
        context_tokens: 10000,
        max_context: 100000,
      }),
    );
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // 10% → 100.0 MiB used
    expect(screen.getAllByText("100.0 MiB").length).toBeGreaterThan(0);

    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 1000,
        context_tokens: 50000,
        max_context: 100000,
      }),
    );
    rerender(<LlamaCppPage />);
    // 50% → 500.0 MiB used
    expect(screen.getAllByText("500.0 MiB").length).toBeGreaterThan(0);
  });

  it("shows '—' for Memory Reserved when model stops (kv_cache_reserved_mib becomes null)", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 832.5,
        context_tokens: 50000,
        max_context: 131072,
      }),
    );
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("832.5 MiB").length).toBeGreaterThan(0);

    // Model stops — reserved becomes null, Memory Reserved still shows with "—"
    mockedCtx.mockReturnValue(baseCtx({ max_context: 131072 }));
    rerender(<LlamaCppPage />);
    expect(screen.getByText("Memory Reserved")).toBeInTheDocument();
  });

  it("reflects new model's reserved memory after model switch", async () => {
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 832.5,
        context_tokens: 0,
        max_context: 131072,
      }),
    );
    const { rerender } = render(<LlamaCppPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText("832.5 MiB").length).toBeGreaterThan(0);

    // New model with different KV reserved
    mockedCtx.mockReturnValue(
      baseCtx({
        kv_cache_reserved_mib: 400,
        context_tokens: 0,
        max_context: 65536,
      }),
    );
    rerender(<LlamaCppPage />);
    expect(screen.getAllByText("400.0 MiB").length).toBeGreaterThan(0);
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
