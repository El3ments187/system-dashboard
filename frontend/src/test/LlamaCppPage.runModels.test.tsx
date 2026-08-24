import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { RunModelsSection } from "../pages/LlamaCppPage";
import {
  formatCtx,
  formatGB,
  formatTps,
  specLabel,
} from "../pages/llamaCppUtils";
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
  it("converts MB to GB with one decimal", () => {
    expect(formatGB(14540)).toBe("14.2 GB");
    expect(formatGB(1024)).toBe("1.0 GB");
  });

  it("falls back to em-dash for null/undefined, but shows real zero", () => {
    expect(formatGB(null)).toBe("—");
    expect(formatGB(undefined)).toBe("—");
    expect(formatGB(0)).toBe("0.0 GB");
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

  // REWRITTEN red-first (ground rule 3): the old test pinned an information-
  // destroying "Other" bucket. User ruling: report ANY spec type dynamically.
  it("renders ANY unknown spec type dynamically, in the table's own idiom", () => {
    // Real case (user): --spec-type draft-dspark. The family convention is
    // draft-<technique>; the table's own entries (draft-mtp→MTP, eagle→EAGLE)
    // strip the prefix and uppercase the technique — unknowns follow suit.
    expect(specLabel("draft-dspark")).toBe("DSPARK");
    expect(specLabel("draft-some-future-method")).toBe("SOME-FUTURE-METHOD");
    expect(specLabel("ternary")).toBe("TERNARY"); // non-draft-family too
    expect(specLabel("SSM-2p")).toBe("SSM-2p"); // authored mixed case respected
  });

  it("matches the known table case-insensitively", () => {
    expect(specLabel("Draft")).toBe("Draft");
    expect(specLabel("DRAFT-MTP")).toBe("MTP");
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
    expect(screen.getByText("14.2 GB")).toBeInTheDocument();
    expect(screen.getByText("18.6 GB")).toBeInTheDocument();
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

    expect(screen.getByText("15.4 GB")).toBeInTheDocument(); // 15800 / 1024
    expect(screen.getByText("19.8 GB")).toBeInTheDocument(); // 20300 / 1024
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

describe("RunModelsSection search", () => {
  function twoProfiles() {
    return profilesResponse({
      profiles: [
        {
          id: "p1",
          name: "Qwen3.6-35B-A3B-REAM-192-heretic-APEX-ICompact-Q3_K_L",
          script_path: "/a.sh",
          file_hash: "abc",
          parsed_args: null,
          filename_meta: null,
          warning: null,
        },
        {
          id: "p2",
          name: "gemma-4-26B-A4B-it-qat-UD-Q4_K_XL",
          script_path: "/b.sh",
          file_hash: "def",
          parsed_args: null,
          filename_meta: null,
          warning: null,
        },
      ],
      states: {},
      metadata: {},
    });
  }

  it("has a search input for finding models", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("Search models…")).toBeInTheDocument();
  });

  it("filters the table to matching models as the user types", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/gemma-4-26B/)).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search models…");
    fireEvent.change(input, { target: { value: "gemma" } });

    expect(screen.getByText(/gemma-4-26B/)).toBeInTheDocument();
    expect(screen.queryByText(/Qwen3\.6-35B/)).not.toBeInTheDocument();
  });

  it("search is case-insensitive", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText("Search models…");
    fireEvent.change(input, { target: { value: "GEMMA" } });

    expect(screen.getByText(/gemma-4-26B/)).toBeInTheDocument();
  });

  it("shows a distinct empty state when the search matches nothing", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText("Search models…");
    fireEvent.change(input, { target: { value: "nonexistent-xyz" } });

    expect(screen.queryByText(/Qwen3\.6-35B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/gemma-4-26B/)).not.toBeInTheDocument();
    // Must NOT reuse the "No profiles found in scan directory" message —
    // that would falsely imply the scan directory itself is empty, when
    // profiles exist and simply don't match the search.
    expect(
      screen.queryByText("No profiles found in scan directory."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No models match/)).toBeInTheDocument();
    expect(screen.getByText(/nonexistent-xyz/)).toBeInTheDocument();
  });

  it("the clear button resets the search and restores the full list", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText(
      "Search models…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "gemma" } });
    expect(screen.queryByText(/Qwen3\.6-35B/)).not.toBeInTheDocument();

    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);

    expect(input.value).toBe("");
    expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument();
    expect(screen.getByText(/gemma-4-26B/)).toBeInTheDocument();
  });

  it("clear button is absent when the search box is empty", async () => {
    global.fetch = mockFetchOnce(twoProfiles());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText(/Qwen3\.6-35B/)).toBeInTheDocument(),
    );
    // Anti-vacuity: this must fail if the search feature doesn't exist at
    // all, not just pass because neither the input nor the button exist.
    expect(screen.getByPlaceholderText("Search models…")).toBeInTheDocument();
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
  });
});

// ─── T201 Favourites ─────────────────────────────────────────────────

const STORAGE_KEY = "run-models-favorites";

function twoProfilesForFav() {
  return profilesResponse({
    profiles: [
      {
        id: "p1",
        name: "qwen-35b",
        script_path: "/scripts/qwen.sh",
        file_hash: "aaa",
        parsed_args: null,
        filename_meta: null,
        warning: null,
      },
      {
        id: "p2",
        name: "gemma-27b",
        script_path: "/scripts/gemma.sh",
        file_hash: "bbb",
        parsed_args: null,
        filename_meta: null,
        warning: null,
      },
    ],
    states: {},
    metadata: {},
  });
}

describe("T201 favourites — star toggle and filter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("each model row has a star button with aria-pressed=false initially", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const starBtns = screen.getAllByRole("button", { name: /Star qwen-35b|Star gemma-27b/i });
    expect(starBtns.length).toBeGreaterThanOrEqual(1);
    for (const btn of starBtns) {
      expect(btn).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("clicking a star button marks it as pressed and writes to localStorage", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const starBtn = screen.getByRole("button", { name: /Star qwen-35b/i });
    expect(starBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(starBtn);

    expect(starBtn).toHaveAttribute("aria-pressed", "true");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toContain("/scripts/qwen.sh");
  });

  it("clicking the star again removes the favourite", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const starBtn = screen.getByRole("button", { name: /Star qwen-35b/i });
    fireEvent.click(starBtn); // star
    expect(starBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(starBtn); // unstar
    expect(starBtn).toHaveAttribute("aria-pressed", "false");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).not.toContain("/scripts/qwen.sh");
  });

  it("filter toggle button has aria-pressed reflecting state", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const filterBtn = screen.getByRole("button", { name: /favourites/i });
    expect(filterBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(filterBtn);
    expect(filterBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(filterBtn);
    expect(filterBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("filter on with zero favourites shows the favourites empty state", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const filterBtn = screen.getByRole("button", { name: /favourites/i });
    fireEvent.click(filterBtn);
    expect(
      screen.getByText(/No favourites yet/i),
    ).toBeInTheDocument();
    // Must not show "No profiles" or "No models match"
    expect(screen.queryByText(/No profiles found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No models match/i)).not.toBeInTheDocument();
  });

  it("filter on with one favourite shows only that model", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Star qwen only
    fireEvent.click(screen.getByRole("button", { name: /Star qwen-35b/i }));
    // Enable filter
    fireEvent.click(screen.getByRole("button", { name: /favourites/i }));
    expect(screen.getByText("qwen-35b")).toBeInTheDocument();
    expect(screen.queryByText("gemma-27b")).not.toBeInTheDocument();
  });

  it("filter + search composed: only favourites matching the query appear", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Star both
    fireEvent.click(screen.getByRole("button", { name: /Star qwen-35b/i }));
    fireEvent.click(screen.getByRole("button", { name: /Star gemma-27b/i }));
    // Enable filter and search for "gemma"
    fireEvent.click(screen.getByRole("button", { name: /favourites/i }));
    fireEvent.change(screen.getByPlaceholderText("Search models…"), {
      target: { value: "gemma" },
    });
    expect(screen.queryByText("qwen-35b")).not.toBeInTheDocument();
    expect(screen.getByText("gemma-27b")).toBeInTheDocument();
  });

  it("filter on + search that clears favourites shows 'no favourites match' not 'no models match'", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Star only qwen
    fireEvent.click(screen.getByRole("button", { name: /Star qwen-35b/i }));
    // Filter and search for something that doesn't match qwen
    fireEvent.click(screen.getByRole("button", { name: /favourites/i }));
    fireEvent.change(screen.getByPlaceholderText("Search models…"), {
      target: { value: "zzz-no-match" },
    });
    expect(screen.getByText(/No favourites match/i)).toBeInTheDocument();
    expect(screen.queryByText(/No models match/i)).not.toBeInTheDocument();
  });

  it("malformed storage — non-JSON string — renders empty set without throwing", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
    global.fetch = mockFetchOnce(twoProfilesForFav());
    expect(() => render(<RunModelsSection />)).not.toThrow();
  });

  it("malformed storage — wrong JSON type (number) — renders empty set", async () => {
    localStorage.setItem(STORAGE_KEY, "42");
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // No crash; filter button should still work
    const filterBtn = screen.getByRole("button", { name: /favourites/i });
    fireEvent.click(filterBtn);
    expect(screen.getByText(/No favourites yet/i)).toBeInTheDocument();
  });

  it("stored script_path no longer in profiles is ignored (stale entry)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["/scripts/deleted.sh"]));
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Enable filter — stale entry should not cause a crash or show a model
    fireEvent.click(screen.getByRole("button", { name: /favourites/i }));
    expect(screen.getByText(/No favourites yet/i)).toBeInTheDocument();
  });

  it("favourites persist across remounts via localStorage", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    const { unmount } = render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Star qwen-35b/i }));
    unmount();

    // Second mount reads from localStorage
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const starBtn = screen.getByRole("button", { name: /Unstar qwen-35b/i });
    expect(starBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("star is not in SORTABLE_COLUMNS — sorting by name still works with filter on", async () => {
    global.fetch = mockFetchOnce(twoProfilesForFav());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Star both, enable filter
    fireEvent.click(screen.getByRole("button", { name: /Star qwen-35b/i }));
    fireEvent.click(screen.getByRole("button", { name: /Star gemma-27b/i }));
    fireEvent.click(screen.getByRole("button", { name: /favourites/i }));
    // Both visible
    expect(screen.getByText("qwen-35b")).toBeInTheDocument();
    expect(screen.getByText("gemma-27b")).toBeInTheDocument();
    // Click MODEL sort — should not throw and both rows still visible
    const modelSortBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("MODEL"),
    );
    expect(modelSortBtn).toBeDefined();
    fireEvent.click(modelSortBtn!);
    expect(screen.getByText("qwen-35b")).toBeInTheDocument();
    expect(screen.getByText("gemma-27b")).toBeInTheDocument();
  });
});

// ─── T235 script-declared launch options ─────────────────────────────

const OPTIONS_STORAGE_KEY = "run-models-options";

function profileWithOptions() {
  return profilesResponse({
    profiles: [
      {
        id: "p1",
        name: "qwen-35b",
        script_path: "/scripts/qwen.sh",
        file_hash: "aaa",
        parsed_args: {
          options: [
            {
              name: "PRESET",
              values: ["fast", "balanced", "quality"],
              default: "balanced",
            },
            { name: "GPU_SPLIT", values: ["auto", "manual"], default: "auto" },
          ],
        },
        filename_meta: null,
        warning: null,
      },
    ],
    states: {
      "/scripts/qwen.sh": {
        status: "stopped",
        llama_server_pid: null,
        start_time: null,
        peak_vram_mb: null,
        peak_ram_mb: null,
        current_tps: null,
      },
    },
    metadata: {},
  });
}

function profileWithOptionsRunning() {
  return profilesResponse({
    profiles: [
      {
        id: "p1",
        name: "qwen-35b",
        script_path: "/scripts/qwen.sh",
        file_hash: "aaa",
        parsed_args: {
          options: [
            {
              name: "PRESET",
              values: ["fast", "balanced", "quality"],
              default: "balanced",
            },
          ],
        },
        filename_meta: null,
        warning: null,
      },
    ],
    states: {
      "/scripts/qwen.sh": {
        status: "running",
        llama_server_pid: 123,
        start_time: null,
        peak_vram_mb: null,
        peak_ram_mb: null,
        current_tps: null,
      },
    },
    metadata: {},
  });
}

describe("T235 script-declared launch options", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("Options button is absent for profiles with no declared options", async () => {
    global.fetch = mockFetchOnce(
      profilesResponse({
        profiles: [
          {
            id: "p1",
            name: "simple-model",
            script_path: "/scripts/simple.sh",
            file_hash: "aaa",
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
      expect(screen.getByText("simple-model")).toBeInTheDocument(),
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent?.includes("Options"))).toBe(false);
  });

  it("Options button appears for profiles with declared options", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent === "Options")).toBe(true);
  });

  it("Options button is disabled while the model is running", async () => {
    global.fetch = mockFetchOnce(profileWithOptionsRunning());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const optBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Options"));
    expect(optBtn).toBeDefined();
    expect(optBtn).toBeDisabled();
    expect(optBtn).toHaveAttribute(
      "title",
      expect.stringContaining("Stop the model first"),
    );
  });

  it("clicking Options button shows the options panel", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("run-models-options-panel"),
    ).not.toBeInTheDocument();
    const optBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Options")!;
    fireEvent.click(optBtn);
    expect(screen.getByTestId("run-models-options-panel")).toBeInTheDocument();
  });

  it("clicking Options button again hides the panel", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const optBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Options")!;
    fireEvent.click(optBtn);
    expect(screen.getByTestId("run-models-options-panel")).toBeInTheDocument();
    fireEvent.click(optBtn);
    expect(
      screen.queryByTestId("run-models-options-panel"),
    ).not.toBeInTheDocument();
  });

  it("options panel contains a select for each declared option", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    expect(
      screen.getByTestId("run-models-option-select-PRESET"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("run-models-option-select-GPU_SPLIT"),
    ).toBeInTheDocument();
  });

  it("each select defaults to its declared default value", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    const preset = screen.getByTestId(
      "run-models-option-select-PRESET",
    ) as HTMLSelectElement;
    expect(preset.value).toBe("balanced");
    const gpuSplit = screen.getByTestId(
      "run-models-option-select-GPU_SPLIT",
    ) as HTMLSelectElement;
    expect(gpuSplit.value).toBe("auto");
  });

  it("changing a select writes the chosen value to localStorage", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    fireEvent.change(screen.getByTestId("run-models-option-select-PRESET"), {
      target: { value: "quality" },
    });
    const stored = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) ?? "{}");
    expect(stored["/scripts/qwen.sh"]?.PRESET).toBe("quality");
  });

  it("Options badge shows (N) for N options that differ from their defaults", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    const optBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Options")!;
    fireEvent.click(optBtn);

    fireEvent.change(screen.getByTestId("run-models-option-select-PRESET"), {
      target: { value: "fast" },
    });
    expect(
      screen.getAllByRole("button").some((b) => b.textContent === "Options (1)"),
    ).toBe(true);

    fireEvent.change(screen.getByTestId("run-models-option-select-GPU_SPLIT"), {
      target: { value: "manual" },
    });
    expect(
      screen.getAllByRole("button").some((b) => b.textContent === "Options (2)"),
    ).toBe(true);

    // Resetting one back to its default decrements the badge
    fireEvent.change(screen.getByTestId("run-models-option-select-PRESET"), {
      target: { value: "balanced" },
    });
    expect(
      screen.getAllByRole("button").some((b) => b.textContent === "Options (1)"),
    ).toBe(true);
  });

  it("non-default options are included in the launch request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => profileWithOptions(),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => profileWithOptions(),
      });
    global.fetch = fetchMock;
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    fireEvent.change(screen.getByTestId("run-models-option-select-PRESET"), {
      target: { value: "quality" },
    });
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const launchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(launchCall[0]).toContain("launch");
    const body = JSON.parse(launchCall[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body.options).toEqual({ PRESET: "quality" });
  });

  it("all-default options are NOT included in the launch request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => profileWithOptions(),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => profileWithOptions(),
      });
    global.fetch = fetchMock;
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // All options at their defaults — click Run without changing anything
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const launchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(launchCall[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body.options).toBeUndefined();
  });

  it("stale stored value (not in declared values list) is ignored", async () => {
    localStorage.setItem(
      OPTIONS_STORAGE_KEY,
      JSON.stringify({
        "/scripts/qwen.sh": { PRESET: "ultra-stale-value" },
      }),
    );
    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Stale value is not in declared values → badge must not appear
    expect(
      screen
        .getAllByRole("button")
        .some((b) => /Options \(\d\)/.test(b.textContent ?? "")),
    ).toBe(false);
    // Select must show declared default, not the stale value
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    const preset = screen.getByTestId(
      "run-models-option-select-PRESET",
    ) as HTMLSelectElement;
    expect(preset.value).toBe("balanced");
  });

  it("selected options persist across remounts via localStorage", async () => {
    global.fetch = mockFetchOnce(profileWithOptions());
    const { unmount } = render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Options")!,
    );
    fireEvent.change(screen.getByTestId("run-models-option-select-PRESET"), {
      target: { value: "fast" },
    });
    unmount();

    global.fetch = mockFetchOnce(profileWithOptions());
    render(<RunModelsSection />);
    await waitFor(() =>
      expect(screen.getByText("qwen-35b")).toBeInTheDocument(),
    );
    // Badge (1) must be visible after remount — value was persisted
    expect(
      screen.getAllByRole("button").some((b) => b.textContent === "Options (1)"),
    ).toBe(true);
  });

  it("malformed OPTIONS_KEY storage does not throw", () => {
    localStorage.setItem(OPTIONS_STORAGE_KEY, "not-json{{{");
    global.fetch = mockFetchOnce(profileWithOptions());
    expect(() => render(<RunModelsSection />)).not.toThrow();
  });
});
