import { screen } from "@testing-library/react";
import GpuPage from "../pages/GpuPage";
import { accent, renderGpuPage } from "./fixtures/gpuPageFixtures";
import {
  expectNoBlackElements,
  resetThemeAttributes,
  setAccentMode,
} from "./helpers/themeAssertions";

describe("GpuPage - error state", () => {
  it("renders error boundary when gpuError is set", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [],
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
      gpuError: "Connection failed",
    });
    expect(screen.getByText(/GPU Error/i)).toBeInTheDocument();
  });

  it("provides retry button on error", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [],
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
      gpuError: "Connection failed",
      retryGpu: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls retry function when clicked", async () => {
    const mockRetry = vi.fn();
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [],
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
      gpuError: "Connection failed",
      retryGpu: mockRetry,
    });
    await screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRetry).toHaveBeenCalled();
  });
});

describe("GpuPage - no data state", () => {
  it.each([
    ["empty array", []],
    ["null", null],
    ["undefined", undefined],
  ])("shows no GPU data message when gpuRawData is %s", (_label, value) => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: value as any,
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
    });
    expect(screen.getByText("No GPU data available")).toBeInTheDocument();
  });
});

describe("GpuPage - accent mode does not leak across renders", () => {
  beforeEach(() => resetThemeAttributes());
  afterEach(() => resetThemeAttributes());

  it("Solid mode: renders with no black elements and no stray theme attributes", () => {
    setAccentMode("solid");
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expectNoBlackElements(container);
  });

  it("the GPU summary card never mixes the danger color into a Normal-state card", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />); // utilization 65%, temp 72°C -> Normal
    const statusDot = container.querySelector(
      ".status-dot",
    ) as HTMLElement | null;
    expect(statusDot).toBeTruthy();
    expect(statusDot?.getAttribute("style")).not.toContain("--danger");
  });

  it("applies semantic danger color (not the accent) for a Critical-state card", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 95,
          temperature_celsius: 60,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText("Critical")).toBeInTheDocument();
    const statusDot = container.querySelector(
      ".status-dot",
    ) as HTMLElement | null;
    expect(statusDot?.getAttribute("style")).toContain("--danger");
  });

  it("applies correct temperature thresholds for GPU (Warning)", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 50,
          temperature_celsius: 75,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("applies correct temperature thresholds for GPU (Critical)", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 50,
          temperature_celsius: 92,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});

describe("GpuPage - edge cases", () => {
  it("handles zero utilization", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 0,
          temperature_celsius: 40,
          vram_used_gb: 0,
          vram_total_gb: 8,
          power_usage_watts: 0,
          power_limit_watts: 200,
          fan_speed_rpm: 0,
        },
      ],
    });
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("handles maximum utilization and temperature", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 100,
          temperature_celsius: 120,
          vram_used_gb: 24,
          vram_total_gb: 24,
          power_usage_watts: 300,
          power_limit_watts: 300,
          fan_speed_rpm: 3000,
        },
      ],
    });
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("handles negative utilization gracefully", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: -5,
          temperature_celsius: 40,
          vram_used_gb: 0,
          vram_total_gb: 8,
          power_usage_watts: 0,
          power_limit_watts: 200,
          fan_speed_rpm: 0,
        },
      ],
    });
    expect(screen.getByText("Test GPU")).toBeInTheDocument();
  });

  it("handles negative temperature gracefully", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 50,
          temperature_celsius: -10,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText("Test GPU")).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Minimal GPU",
          utilization_percent: 50,
          temperature_celsius: 60,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText("Minimal GPU")).toBeInTheDocument();
  });

  it("handles very long GPU name gracefully", () => {
    const longName =
      "Super Long GPU Name That Should Be Truncated With Ellipsis Because It Exceeds The Available Space In The Card Header Display Area";
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: longName,
          utilization_percent: 50,
          temperature_celsius: 60,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
        },
      ],
    });
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it("handles gpuRawData as a single object instead of an array", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: undefined,
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
    } as any);
    expect(screen.getByText("No GPU data available")).toBeInTheDocument();
  });
});
