import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { GpuBackendStatus } from "../components/settings/GpuBackendStatus";

function mockStatus(payload: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

describe("GpuBackendStatus (Settings indicator)", () => {
  it("shows healthy NVML state", async () => {
    mockStatus({ gpu_backend: "nvml", nvml_available: true });
    render(<GpuBackendStatus />);
    await waitFor(() =>
      expect(screen.getByText(/NVML active/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("gpu-backend-status")).toHaveAttribute(
      "data-state",
      "ok",
    );
  });

  it("shows degraded nvidia-smi fallback state with explanation", async () => {
    mockStatus({ gpu_backend: "nvidia-smi", nvml_available: false });
    render(<GpuBackendStatus />);
    await waitFor(() =>
      expect(screen.getByText(/nvidia-smi fallback/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("gpu-backend-status")).toHaveAttribute(
      "data-state",
      "degraded",
    );
    expect(screen.getByText(/NVML is unavailable/i)).toBeInTheDocument();
  });

  it("shows no-backend state", async () => {
    mockStatus({ gpu_backend: "none", nvml_available: false });
    render(<GpuBackendStatus />);
    await waitFor(() =>
      expect(screen.getByText(/No GPU backend/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("gpu-backend-status")).toHaveAttribute(
      "data-state",
      "error",
    );
  });

  it("shows unreachable state when the request fails", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    render(<GpuBackendStatus />);
    await waitFor(() =>
      expect(screen.getByText(/could not reach backend/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("gpu-backend-status")).toHaveAttribute(
      "data-state",
      "error",
    );
  });
});
