import { render } from "@testing-library/react";
import * as MetricsContextModule from "../../context/MetricsContext";
import { TooltipProvider } from "../../components/common/TooltipProvider";

class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

export const accent = { color: "#00B4D8", glow: "rgba(0, 180, 216, 0.3)" };

export const mockMetricsContext = (
  overrides: Partial<MetricsContextModule.MetricsContextValue> = {},
) => ({
  gpuRawData: [
    {
      name: "NVIDIA GeForce RTX 4090",
      utilization_percent: 65,
      temperature_celsius: 72,
      vram_used_gb: 8.5,
      vram_total_gb: 24,
      power_usage_watts: 250,
      power_limit_watts: 300,
      fan_speed_rpm: 1200,
      clock_speed_mhz: 2500,
      memory_clock_mhz: 1000,
      driver_version: "550.0",
    },
  ],
  gpuHistory: [
    { slot: 0, timestamp: new Date(Date.now() - 60000), value: 70 },
    { slot: 1, timestamp: new Date(), value: 65 },
  ],
  gpuVramUtilHistory: [
    { slot: 0, timestamp: new Date(Date.now() - 60000), value: 9.0 },
    { slot: 1, timestamp: new Date(), value: 8.5 },
  ],
  gpuTemperatureHistory: [
    { slot: 0, timestamp: new Date(Date.now() - 60000), value: 75 },
    { slot: 1, timestamp: new Date(), value: 72 },
  ],
  gpuCurrentValues: [65, 72, 8.5, 12.0, 250, 300],
  gpuLoading: false,
  gpuError: null,
  retryGpu: vi.fn(),
  ...overrides,
});

export function renderGpuPage(
  ui: React.ReactElement,
  contextOverrides: Partial<MetricsContextModule.MetricsContextValue> = {},
) {
  return render(
    <TooltipProvider>
      <MetricsContextModule.MetricsContext.Provider
        value={mockMetricsContext(contextOverrides)}
      >
        {ui}
      </MetricsContextModule.MetricsContext.Provider>
    </TooltipProvider>,
  );
}
