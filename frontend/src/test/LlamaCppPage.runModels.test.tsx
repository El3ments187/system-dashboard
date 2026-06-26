import { render, screen, waitFor } from "@testing-library/react";
import {
  RunModelsSection,
  formatCtx,
  formatGB,
  formatTps,
  specLabel,
} from "../pages/LlamaCppPage";
import type { ProfileResponse } from "../types/metrics";

function profilesResponse(overrides: Partial<ProfileResponse> = {}): {
  data: ProfileResponse;
} {
  return {
    data: {
      profiles: [],
      states: {},
      metadata: {},
      scan_dir: "/home/gamer/Documents/AI/Start_Scripts",
      ...overrides,
    },
  };
}

function mockFetchOnce(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => response,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── Formatting helper unit tests ────────────────────────────────────

describe("formatCtx", () => {
  it("formats binary context sizes as K", () => {
    expect(formatCtx(32768)).toBe("32K");
    expect(formatCtx(65536)).toBe("64K");
    expect(formatCtx(131072)).toBe("128K");
    expect(formatCtx(262144)).toBe("256K");
  });

  it("rounds non-binary context sizes", () => {
    expect(formatCtx(32000)).toBe("31K");
  });

  it("falls back to em-dash for missing or invalid values", () => {
    expect(formatCtx(null)).toBe("—");
    expect(formatCtx(undefined)).toBe("—");
    expect(formatCtx(0)).toBe("—");
  });
});

describe("formatGB", () => {
  it("converts MB to G with one decimal", () => {
    expect(formatGB(14540)).toBe("14.2G");
    expect(formatGB(1024)).toBe("1.0G");
  });

  it("falls back to em-dash for null/undefined, but shows real zero", () => {
    expect(formatGB(null)).toBe("—");
    expect(formatGB(undefined)).toBe("—");
    expect(formatGB(0)).toBe("0.0G");
  });
});

describe("formatTps", () => {
  it("rounds to the nearest integer", () => {
    expect(formatTps(11.4)).toBe("11");
    expect(formatTps(11.6)).toBe("12");
  });

  it("falls back to em-dash for null/undefined, but shows real zero", () => {
    expect(formatTps(null)).toBe("—");
    expect(formatTps(undefined)).toBe("—");
    expect(formatTps(0)).toBe("0");
  });
});

describe("specLabel", () => {
  it("maps known spec_type values to display labels", () => {
    expect(specLabel("draft")).toBe("Draft");
    expect(specLabel("draft-mtp")).toBe("MTP");
    expect(specLabel("eagle")).toBe("EAGLE");
    expect(specLabel("eagle3")).toBe("EAGLE-3");
  });

  it('returns "Other" for an unrecognized value', () => {
    expect(specLabel("some-unknown-method")).toBe("Other");
  });

  it('returns "None" when no spec_type is present', () => {
    expect(specLabel(null)).toBe("None");
    expect(specLabel(undefined)).toBe("None");
    expect(specLabel("")).toBe("None");
  });
});

// ─── Run Models table rendering ──────────────────────────────────────

describe("RunModelsSection table", () => {
  it("renders all column headers including Status", async () => {
    global.fetch = mockFetchOnce(profilesResponse());
    render(<RunModelsSection />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const sortableHeaders = [
      "STATUS",
      "MODEL",
      "PARAMS",
      "QUANT",
      "CTX",
      "VRAM",
      "RAM",
      "SPEC",
      "TPS",
    ];
    for (const col of sortableHeaders) {
      const buttons = screen.getAllByRole("button");
      const found = buttons.some((b) => b.textContent?.includes(col));
      expect(found).toBe(true);
    }
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("renders a fully-populated row correctly", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "Qwen3.6-35B-RangerX",
            script_path: "/scripts/qwen.sh",
            file_hash: "abc",
            parsed_args: {
              context_size: 131072,
              spec_type: "draft-mtp",
              port: 8081,
            },
            filename_meta: {
              family: "Qwen3.6",
              params: "35B",
              quant: "Q3_K_M",
              variant: "RangerX",
            },
            warning: null,
          },
        ],
        states: {
          "/scripts/qwen.sh": {
            status: "running",
            llama_server_pid: 123,
            start_time: null,
            peak_vram_mb: 14540,
            peak_ram_mb: 19000,
            current_tps: 11,
          },
        },
        metadata: {},
      }),
    );
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("Qwen3.6-35B-RangerX")).toBeInTheDocument(),
    );

    expect(screen.getByText("35B")).toBeInTheDocument();
    expect(screen.getByText("Q3_K_M")).toBeInTheDocument();
    expect(screen.getByText("128K")).toBeInTheDocument();
    expect(screen.getByText("14.2G")).toBeInTheDocument();
    expect(screen.getByText("18.6G")).toBeInTheDocument();
    expect(screen.getByText("MTP")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("falls back to historical metadata values when not running", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "Qwen3.6-35B-Quality",
            script_path: "/scripts/quality.sh",
            file_hash: "abc",
            parsed_args: { context_size: 65536 },
            filename_meta: { params: "35B", quant: "Q4_K_M" },
            warning: null,
          },
        ],
        states: {
          "/scripts/quality.sh": {
            status: "stopped",
            llama_server_pid: null,
            start_time: null,
            peak_vram_mb: null,
            peak_ram_mb: null,
            current_tps: null,
          },
        },
        metadata: {
          "/scripts/quality.sh": {
            script_path: "/scripts/quality.sh",
            peak_vram_mb: 15800,
            peak_ram_mb: 20300,
            avg_gen_tps: 9,
            peak_gen_tps: 9,
            run_count: 3,
          },
        },
      }),
    );
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("Qwen3.6-35B-Quality")).toBeInTheDocument(),
    );

    expect(screen.getByText("15.4G")).toBeInTheDocument(); // 15800 / 1024
    expect(screen.getByText("19.8G")).toBeInTheDocument(); // 20300 / 1024
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument(); // no spec_type configured
  });

  it("renders em-dashes for every metadata column when nothing is known", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "unknown-model",
            script_path: "/scripts/unknown.sh",
            file_hash: "abc",
            parsed_args: null,
            filename_meta: null,
            warning: null,
          },
        ],
        states: {},
        metadata: {},
      }),
    );
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("unknown-model")).toBeInTheDocument(),
    );

    // Params, Quant, Ctx, VRAM, RAM, TPS all unknown -> six "—" cells
    // (Spec still resolves to the literal "None", which is correct per spec.)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("shows an empty state message when no profiles are found", async () => {
    global.fetch = mockFetchOnce(profilesResponse());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/No profiles found/i)).toBeInTheDocument(),
    );
  });

  it("shows an error banner when the profile fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load profiles/i)).toBeInTheDocument(),
    );
  });

  it("does not crash when the API returns a malformed response", async () => {
    global.fetch = mockFetchOnce({ data: null });
    expect(() => render(<RunModelsSection />)).not.toThrow();
  });
});

// ─── STATUS column ───────────────────────────────────────────────────

describe("STATUS column", () => {
  function profileWithStatus(status: string) {
    return profilesResponse({
      profiles: [
        {
          id: "p1",
          name: "test-model",
          script_path: "/test.sh",
          file_hash: "abc",
          parsed_args: null,
          filename_meta: null,
          warning: null,
        },
      ],
      states: {
        "/test.sh": {
          status,
          llama_server_pid: status !== "stopped" ? 1234 : null,
          start_time: null,
          peak_vram_mb: null,
          peak_ram_mb: null,
          current_tps: null,
        },
      },
    });
  }

  it("shows Stopped when no process is running", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("stopped"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("shows Starting when launch is in progress and health is not yet available", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("starting"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Starting")).toBeInTheDocument();
  });

  it("shows Loading when process is spawned and model is loading", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("loading"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows Running when health endpoint is responding", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("running"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows Failed when process exits unexpectedly", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("failed"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  // Port conflict (e.g. "couldn't bind HTTP server socket") causes the process
  // to exit → the backend detects process death during loading → status = "failed".
  it("shows Failed on port conflict (process exits with non-zero code)", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("failed"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows only one Running indicator when multiple profiles are loaded", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "model-a",
            script_path: "/a.sh",
            file_hash: "abc",
            parsed_args: null,
            filename_meta: null,
            warning: null,
          },
          {
            id: "p2",
            name: "model-b",
            script_path: "/b.sh",
            file_hash: "def",
            parsed_args: null,
            filename_meta: null,
            warning: null,
          },
        ],
        states: {
          "/a.sh": {
            status: "running",
            llama_server_pid: 1234,
            start_time: null,
            peak_vram_mb: null,
            peak_ram_mb: null,
            current_tps: null,
          },
          "/b.sh": {
            status: "stopped",
            llama_server_pid: null,
            start_time: null,
            peak_vram_mb: null,
            peak_ram_mb: null,
            current_tps: null,
          },
        },
      }),
    );
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("model-a")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Running")).toHaveLength(1);
    expect(screen.getAllByText("Stopped")).toHaveLength(1);
  });

  // After a page refresh the backend recovers the running process via port
  // scanning; the frontend displays whatever state the API returns.
  it("restores Running status after page refresh when backend reports running state", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "running-model",
            script_path: "/run.sh",
            file_hash: "abc",
            parsed_args: null,
            filename_meta: null,
            warning: null,
          },
        ],
        states: {
          "/run.sh": {
            status: "running",
            llama_server_pid: 5678,
            start_time: null,
            peak_vram_mb: null,
            peak_ram_mb: null,
            current_tps: null,
          },
        },
      }),
    );
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("Running")).toBeInTheDocument(),
    );
  });

  it("shows Stop button for starting profiles", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("starting"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("shows Stop button for loading profiles", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("loading"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("shows Run button for failed profiles", async () => {
    global.fetch = mockFetchOnce(profileWithStatus("failed"));
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("test-model")).toBeInTheDocument(),
    );
    expect(screen.getByText("Run")).toBeInTheDocument();
  });
});
