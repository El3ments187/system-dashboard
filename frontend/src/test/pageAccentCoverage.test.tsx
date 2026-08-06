// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import * as MetricsContextModule from "../context/MetricsContext";
import { TooltipProvider } from "../components/common/TooltipProvider";
import CpuPage from "../pages/CpuPage";
import GpuPage from "../pages/GpuPage";
import OverviewPage from "../pages/OverviewPage";
import SettingsPage from "../pages/SettingsPage";
import LlamaCppPage from "../pages/LlamaCppPage";

// ─── Environment setup ─────────────────────────────────────────────────────

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
  getAiSettings: vi.fn().mockResolvedValue({
    llama_server_url: "http://localhost:8081",
    openwebui_url: "http://localhost:3000",
    opencode_url: "http://localhost:4000",
    comfyui_url: "http://localhost:8188",
  }),
  updateAiSettings: vi.fn().mockResolvedValue({}),
  testConnection: vi.fn().mockResolvedValue({ available: true }),
  getRepoInfo: vi.fn().mockResolvedValue(null),
  getSettingsLocation: vi.fn().mockResolvedValue({
    path: "/home/user/.config/model-deck/settings.json",
    exists: false,
  }),
}));

vi.mock("../components/LogConsole", () => ({ LogConsole: () => null }));
vi.mock("../components/UpdateOutputModal", () => ({ default: () => null }));
vi.mock("../components/DirectoryBrowserModal", () => ({ default: () => null }));
vi.mock("../components/EditUpdateScriptModal", () => ({ default: () => null }));

vi.mock("../hooks/useLlamaCppManagement", () => ({
  useLlamaCppManagement: vi.fn().mockReturnValue({
    isRunning: false,
    activeModelPath: null,
    serverPid: null,
    startServer: vi.fn(),
    stopServer: vi.fn(),
    runningModels: [],
    isLoading: false,
    error: null,
    logs: [],
    clearLogs: vi.fn(),
    updateStatus: null,
    runUpdate: vi.fn(),
    updateProgress: 0,
    isUpdating: false,
    profiles: [],
    activeProfile: null,
    fetchProfiles: vi.fn(),
    setActiveProfile: vi.fn(),
  }),
}));

// ─── Shared mock MetricsContext value ──────────────────────────────────────

const mockCtx = {
  cpuCurrentValues: [25, 45, 3200, 85],
  cpuRawData: {
    model: "Test CPU",
    cores: [{ usage_percent: 25, frequency_mhz: 3200, core_index: 0 }],
    temperature_celsius: 45,
    usage_percent: 25,
  },
  memoryCurrentValues: [40, 10, 16, 64],
  gpuCurrentValues: [65, 72, 8.5, 24, 250, 300],
  gpuRawData: [
    {
      name: "Test GPU",
      utilization_percent: 65,
      temperature_celsius: 72,
      vram_used_gb: 8.5,
      vram_total_gb: 24,
      power_usage_watts: 250,
      power_limit_watts: 300,
      fan_speed_rpm: 1200,
      clock_speed_mhz: 2500,
      memory_clock_mhz: 1000,
    },
  ],
  cpuHistories: [],
  memoryHistories: [],
  gpuHistories: [],
  cpuHistory: null,
  cpuTemperatureHistory: null,
  memoryHistory: null,
  swapHistory: null,
  gpuHistory: null,
  gpuTemperatureHistory: null,
  gpuVramUtilHistory: null,
  perCoreCpuHistories: [],
  perGpuHistories: {
    utilHistories: [],
    tempHistories: [],
    vramUtilHistories: [],
  },
  cpuCurrentFrequency: 3200,
  cpuMaxFrequency: 4200,
  cpuLoading: false,
  memoryLoading: false,
  gpuLoading: false,
  cpuError: null,
  memoryError: null,
  gpuError: null,
  storageDevices: [],
  storageHistories: new Map(),
  storageLoading: false,
  storageError: null,
  aiCurrentMetrics: null,
  aiGenTpsHistory: null,
  aiPromptTpsHistory: null,
  aiActiveRequestsHistory: null,
  aiQueuedRequestsHistory: null,
  aiContextTokensHistory: null,
  llamaCppLoading: false,
  aiError: null,
  retryLlamaCpp: vi.fn(),
  retryCpu: vi.fn(),
  retryMemory: vi.fn(),
  retryGpu: vi.fn(),
  retryStorage: vi.fn(),
  isPaused: false,
  pause: vi.fn(),
  resume: vi.fn(),
  toggle: vi.fn(),
} as unknown as ReturnType<typeof MetricsContextModule.useMetricsContext>;

const accent = { color: "var(--accent-primary)", glow: "var(--accent-glow)" };

function renderWithCtx(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MetricsContextModule.MetricsContext.Provider value={mockCtx}>
        {ui}
      </MetricsContextModule.MetricsContext.Provider>
    </TooltipProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("pageAccentCoverage — canonical spine on every non-AI page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("CpuPage: renders at least one .card-accent-spine.accent-glow-target", () => {
    const { container } = renderWithCtx(<CpuPage accent={accent} />);
    expect(
      container.querySelectorAll(".card-accent-spine.accent-glow-target")
        .length,
    ).toBeGreaterThan(0);
  });

  it("GpuPage: renders at least one .card-accent-spine.accent-glow-target", () => {
    const { container } = renderWithCtx(<GpuPage accent={accent} />);
    expect(
      container.querySelectorAll(".card-accent-spine.accent-glow-target")
        .length,
    ).toBeGreaterThan(0);
  });

  it("OverviewPage: renders at least one .card-accent-spine.accent-glow-target", () => {
    const { container } = renderWithCtx(<OverviewPage accent={accent} />);
    expect(
      container.querySelectorAll(".card-accent-spine.accent-glow-target")
        .length,
    ).toBeGreaterThan(0);
  });

  it("SettingsPage: renders at least one .card-accent-spine.accent-glow-target", async () => {
    const { container } = renderWithCtx(<SettingsPage accent={accent} />);
    await waitFor(() => {
      expect(
        container.querySelectorAll(".card-accent-spine.accent-glow-target")
          .length,
      ).toBeGreaterThan(0);
    });
  });

  it("LlamaCppPage: renders at least one .card-accent-spine.accent-glow-target", () => {
    const { container } = renderWithCtx(<LlamaCppPage />);
    expect(
      container.querySelectorAll(".card-accent-spine.accent-glow-target")
        .length,
    ).toBeGreaterThan(0);
  });

  it("every spine has .bright-breathe and .bright-surge children (CpuPage)", () => {
    const { container } = renderWithCtx(<CpuPage accent={accent} />);
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines.length).toBeGreaterThan(0);
    spines.forEach((spine) => {
      expect(spine.querySelector(".bright-breathe")).not.toBeNull();
      expect(spine.querySelector(".bright-surge")).not.toBeNull();
    });
  });

  it("every spine is inside a [data-accent-el] element (GpuPage)", () => {
    const { container } = renderWithCtx(<GpuPage accent={accent} />);
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines.length).toBeGreaterThan(0);
    spines.forEach((spine) => {
      expect(spine.closest("[data-accent-el]")).not.toBeNull();
    });
  });
});
