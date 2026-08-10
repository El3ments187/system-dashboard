/**
 * T60 — Toolchains as a Settings-page concern.
 *
 * The tool-level diagnostic moved off the Bench page: it answers "which
 * binary is missing", which is the same question the connection fields above
 * it already answer for network services. What Bench keeps is the
 * consequence for a run — covered by the language-toggle guards in
 * bench.page.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ToolchainStatus } from "../components/settings/ToolchainStatus";

const TRACKS = [
  { lang: "js", tasks: 4, available: true, reason: "" },
  { lang: "ts", tasks: 7, available: true, reason: "" },
  { lang: "java", tasks: 8, available: true, reason: "" },
  {
    lang: "gdscript",
    tasks: 8,
    available: false,
    reason: "godot not on PATH",
  },
];

function installFetch(payload: unknown, ok = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve({ data: payload, success: true }),
    } as Response),
  ) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("T60 toolchain status on Settings", () => {
  it("renders one row per language, from --check's own availability", async () => {
    installFetch({ tracks: TRACKS });
    render(<ToolchainStatus />);

    await waitFor(() =>
      expect(screen.getByTestId("toolchain-js")).toBeTruthy(),
    );
    for (const t of TRACKS) {
      expect(screen.getByTestId(`toolchain-${t.lang}`)).toBeTruthy();
    }
    expect(screen.getByTestId("toolchain-status").textContent).toContain(
      "1 of 4 unavailable",
    );
    // The failing binary's reason is shown inline, as the connection fields
    // above already do for an unreachable service.
    expect(screen.getByTestId("toolchain-gdscript").textContent).toContain(
      "godot not on PATH",
    );
  });

  it("says so when bench.py cannot be reached at all", async () => {
    installFetch(null, false);
    render(<ToolchainStatus />);
    await waitFor(() =>
      expect(
        screen.getByTestId("toolchain-status").getAttribute("data-state"),
      ).toBe("error"),
    );
    expect(screen.getByTestId("toolchain-status").textContent).toContain(
      "bench_dir",
    );
  });
});
