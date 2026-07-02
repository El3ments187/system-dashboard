import { render, screen } from "@testing-library/react";
import * as MetricsContext from "../context/MetricsContext";
import GpuCard from "../components/cards/GpuCard";
import { TooltipProvider } from "../components/common/TooltipProvider";

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const mockMetricsContext = (
  overrides: Partial<MetricsContext.MetricsContextValue> = {},
) => ({
  gpuCurrentValues: [65, 72, 8.5, 12.0, 250, 300],
  gpuLoading: false,
  gpuError: null,
  retryGpu: vi.fn(),
  ...overrides,
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MetricsContext.MetricsContext.Provider value={mockMetricsContext()}>
        {ui}
      </MetricsContext.MetricsContext.Provider>
    </TooltipProvider>,
  );
}

describe("GpuCard", () => {
  const accent = { color: "#00B4D8", glow: "rgba(0, 180, 216, 0.3)" };
  const turquoiseAccent = { color: "#00B4D8", glow: "rgba(0, 180, 216, 0.3)" };

  describe("accent color application", () => {
    it("renders GPU icon with accent color", () => {
      renderWithProviders(<GpuCard accent={accent} />);
      expect(screen.getByText("GPU")).toBeInTheDocument();
    });

    it("displays utilization percentage with accent unit", () => {
      const { container } = renderWithProviders(<GpuCard accent={accent} />);
      expect(container.textContent).toMatch(/%/);
    });

    it("displays temperature with accent color when available", () => {
      renderWithProviders(<GpuCard accent={accent} />);
      expect(screen.getByText(/°C/)).toBeInTheDocument();
    });

    it("shows fallback for temperature when null", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, null, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });

    it("displays VRAM usage with accent color", () => {
      renderWithProviders(<GpuCard accent={accent} />);
      expect(screen.getByText(/8\.5 \/ 12\.0 GB/)).toBeInTheDocument();
    });

    it("shows fallback for VRAM when values are null", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, null, null, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });

    it("displays power draw with accent color", () => {
      renderWithProviders(<GpuCard accent={accent} />);
      expect(screen.getByText(/250W \/ 300W/)).toBeInTheDocument();
    });

    it("shows fallback for power when values are null", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, 8.5, 12.0, null, null],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });

    it("shows status indicator with progress-based color", () => {
      const { container } = renderWithProviders(<GpuCard accent={accent} />);
      const statusLabel = container.querySelector(".card-detail-label");
      expect(statusLabel).toBeInTheDocument();
    });

    it("shows Warning status when utilization >= 70%", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [75, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Warning");
    });

    it("shows Critical status when utilization >= 90%", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [95, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Critical");
    });

    it("renders progress bar with correct percentage", () => {
      const { container } = renderWithProviders(<GpuCard accent={accent} />);
      expect(container.querySelector(".card-progress")).toBeInTheDocument();
    });

    it("renders all detail items in card-details section", () => {
      const { container } = renderWithProviders(<GpuCard accent={accent} />);
      const cardDetails = container.querySelector(".card-details");
      expect(cardDetails).toBeInTheDocument();
    });

    it("renders status detail with progress-based color", () => {
      renderWithProviders(<GpuCard accent={accent} />);
      const statusLabel = screen.getByText(/Status/).parentElement;
      expect(statusLabel).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows skeleton loader when loading", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({ gpuLoading: true })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("GPU")).toBeInTheDocument();
    });

    it("applies reduced opacity during loading", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({ gpuLoading: true })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const card = container.querySelector(".metric-card");
      expect(card).toHaveStyle({ opacity: "0.5" });
    });
  });

  describe("error state", () => {
    it("shows error UI when gpuError is set", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({ gpuError: "Connection failed" })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText(/GPU Error/i)).toBeInTheDocument();
    });

    it("provides retry button on error", () => {
      const mockRetry = vi.fn();
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuError: "Connection failed",
              retryGpu: mockRetry,
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const retryBtn = screen.getByRole("button", { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it("calls retry function when retry button is clicked", async () => {
      const mockRetry = vi.fn();
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuError: "Connection failed",
              retryGpu: mockRetry,
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const retryBtn = screen.getByRole("button", { name: /retry/i });
      await retryBtn.click();
      expect(mockRetry).toHaveBeenCalled();
    });
  });

  describe("null data handling", () => {
    it("shows fallback for null GPU utilization", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [null, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });

    it("shows fallback for all null values", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [null, null, null, null, null, null],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const emDashes = screen.getAllByText("\u2014");
      expect(emDashes.length).toBeGreaterThan(3);
    });

    it("shows Normal status when utilization is null", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [null, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Normal");
    });
  });

  describe("Turquoise accent mode", () => {
    it("renders correctly with Turquoise accent", () => {
      const { container } = renderWithProviders(
        <GpuCard accent={turquoiseAccent} />,
      );
      expect(container.textContent).toContain("GPU");
      expect(container.textContent).toMatch(/(Normal|OK)/i);
    });

    it("applies Turquoise color to icon and detail values", () => {
      const { container } = renderWithProviders(
        <GpuCard accent={turquoiseAccent} />,
      );
      expect(container.querySelector(".metric-card")).toBeInTheDocument();
    });

    it("shows correct temperature with Turquoise accent", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 85, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText(/°C/)).toBeInTheDocument();
    });

    it("handles high utilization with Turquoise accent", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [92, 85, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Critical");
    });

    it("renders progress bar with correct state for Turquoise mode", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [75, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const progressBar = container.querySelector(".card-progress-bar");
      expect(progressBar).toHaveClass("progress-bar-warning");
    });

    it("renders progress bar with critical state for high utilization", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [95, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const progressBar = container.querySelector(".card-progress-bar");
      expect(progressBar).toHaveClass("progress-bar-critical");
    });

    it("renders progress bar with normal state for low utilization", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [30, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const progressBar = container.querySelector(".card-progress-bar");
      expect(progressBar).toHaveClass("progress-bar-normal");
    });

    it("displays VRAM percentage correctly", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, 10.0, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText(/10\.0 \/ 12\.0 GB/)).toBeInTheDocument();
    });

    it("displays power limit correctly", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, 8.5, 12.0, 200, 350],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText(/200W \/ 350W/)).toBeInTheDocument();
    });
  });

  describe("theme color leak detection", () => {
    it("the progress bar references the accent CSS variable, not a baked-in spectrum hex, in solid mode", () => {
      const { container } = renderWithProviders(
        <GpuCard accent={turquoiseAccent} />,
      );
      const bar = container.querySelector(".card-progress-bar");
      const style = bar?.getAttribute("style") || "";
      expect(style).toMatch(/var\(--/);
      expect(style).not.toMatch(/#[0-9a-f]{6}/i);
    });

    it("uses the semantic danger color (not the accent) for a Critical-state status dot", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [95, 72, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const statusDot = container.querySelector(".status-dot");
      expect(statusDot?.getAttribute("style")).toContain("--danger");
    });

    it("does not apply the danger color to a Normal-state status dot", () => {
      const { container } = renderWithProviders(
        <GpuCard accent={turquoiseAccent} />,
      ); // 65% / 72°C -> Normal
      const statusDot = container.querySelector(".status-dot");
      expect(statusDot?.getAttribute("style")).not.toContain("--danger");
    });

    it("applies the warning color at the GPU utilization warning threshold (status dot is utilization-driven, not temperature)", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [75, 50, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const statusDot = container.querySelector(".status-dot");
      expect(statusDot?.getAttribute("style")).toContain("--warning");
    });

    it("stays Normal-colored even at a high temperature, since the compact card status dot tracks utilization only", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [50, 95, 8.5, 12.0, 250, 300],
            })}
          >
            <GpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      const statusDot = container.querySelector(".status-dot");
      expect(statusDot?.getAttribute("style")).toContain("--success");
    });
  });

  describe("edge cases", () => {
    it("handles zero utilization", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [0, 40, 0, 12.0, 0, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Normal");
    });

    it("handles maximum utilization", () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [100, 95, 12.0, 12.0, 300, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(container.textContent).toContain("Critical");
    });

    it("handles partial VRAM data", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, 8.5, null, 250, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });

    it("handles partial power data", () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider
            value={mockMetricsContext({
              gpuCurrentValues: [65, 72, 8.5, 12.0, null, 300],
            })}
          >
            <GpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>,
      );
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });
  });
});
