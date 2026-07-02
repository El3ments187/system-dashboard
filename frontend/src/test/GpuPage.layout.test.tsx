import { screen } from "@testing-library/react";
import GpuPage from "../pages/GpuPage";
import { accent, renderGpuPage } from "./fixtures/gpuPageFixtures";

describe("GpuPage - layout structure", () => {
  it("renders main dashboard grid container", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelector(".dashboard-grid")).toBeInTheDocument();
  });

  it("renders GPU row layout", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelector(".gpu-row")).toBeInTheDocument();
  });

  it("renders left column with GPU summary card", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelector(".gpu-col-left")).toBeInTheDocument();
  });

  it("renders right column with charts stack", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelector(".gpu-charts")).toBeInTheDocument();
  });

  it("displays GPU index number in card header", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("GPU 1")).toBeInTheDocument();
  });

  it("renders multiple GPUs when provided", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "GPU A",
          utilization_percent: 50,
          temperature_celsius: 60,
          vram_used_gb: 4.0,
          vram_total_gb: 8,
          power_usage_watts: 100,
          power_limit_watts: 200,
          fan_speed_rpm: 800,
          clock_speed_mhz: 1500,
          memory_clock_mhz: 700,
        },
        {
          name: "GPU B",
          utilization_percent: 80,
          temperature_celsius: 85,
          vram_used_gb: 6.0,
          vram_total_gb: 12,
          power_usage_watts: 200,
          power_limit_watts: 300,
          fan_speed_rpm: 1500,
          clock_speed_mhz: 2000,
          memory_clock_mhz: 900,
        },
      ],
    });
    expect(container.querySelectorAll(".gpu-row").length).toBe(2);
  });
});

describe("GpuPage - accent application", () => {
  it("renders GPU name with correct styling", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("NVIDIA GeForce RTX 4090")).toBeInTheDocument();
  });

  it("applies accent color to metric values in summary card", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    const detailValues = container.querySelectorAll(".card-detail-value");
    expect(detailValues.length).toBeGreaterThan(0);
  });

  it("renders vertical progress bars with accent color", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    const progressBars = container.querySelectorAll(
      '[style*="linear-gradient"]',
    );
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it("displays utilization percentage in vertical bar", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("displays temperature with correct unit", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(
      screen.getByText(
        (_text, node) =>
          node?.textContent === "72°C" &&
          node?.className === "card-detail-value",
      ),
    ).toBeInTheDocument();
  });

  it("shows status indicator based on utilization and temperature", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("applies warning state for high utilization", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [
        {
          name: "Test GPU",
          utilization_percent: 75,
          temperature_celsius: 60,
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

  it("applies critical state for very high utilization", () => {
    renderGpuPage(<GpuPage accent={accent} />, {
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
  });

  it("applies critical state for high temperature", () => {
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

describe("GpuPage - history charts", () => {
  it("renders GPU utilization history chart when data exists", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelector(".metric-card")).toBeInTheDocument();
  });

  it("displays GPU Utilization History title", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("GPU Utilization History")).toBeInTheDocument();
  });

  it("renders VRAM utilization history chart", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(
      container.querySelectorAll(".chart-container").length,
    ).toBeGreaterThan(1);
  });

  it("displays VRAM Utilization History title", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("VRAM Utilization History")).toBeInTheDocument();
  });

  it("renders GPU temperature history chart", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(
      container.querySelectorAll(".chart-container").length,
    ).toBeGreaterThan(1);
  });

  it("displays GPU Temperature History title", () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText("GPU Temperature History")).toBeInTheDocument();
  });

  it("does not render history charts when no data available", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuHistory: [],
      gpuVramUtilHistory: [],
      gpuTemperatureHistory: [],
    });
    expect(container.querySelectorAll(".metric-card").length).toBe(1);
  });

  it("applies accent color to chart titles", () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />);
    expect(container.querySelectorAll(".card-header").length).toBeGreaterThan(
      0,
    );
  });
});
