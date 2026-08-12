// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { BenchConsole } from "../pages/bench/BenchConsole";

// H1/F1 — offsetRef must reset to 0 when running transitions false→true,
// and nextOffset must be consumed even when the lines array is empty,
// so a log-clear (new run start) is detected before new lines arrive.

function makeFetch(responses: Array<{ lines: string[]; nextOffset: number }>) {
  let call = 0;
  return vi.fn(() => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(r),
    } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("H1 BenchConsole offset reset on new run", () => {
  it("resets offset to 0 and clears lines when running becomes true", async () => {
    // Phase 1: idle run — returns 3 lines at high offset.
    const fetchMock = makeFetch([
      { lines: ["old-line-1", "old-line-2", "old-line-3"], nextOffset: 200 },
      // Phase 2 (after rerender with running=true): backend cleared its log,
      // returns empty with nextOffset=0. The component MUST update offsetRef
      // to 0 even though lines is empty.
      { lines: [], nextOffset: 0 },
      // Phase 3: new run first real lines at offset 0.
      { lines: ["new-line-A", "new-line-B"], nextOffset: 2 },
    ]);
    global.fetch = fetchMock;

    const { rerender } = render(
      <BenchConsole running={false} active={true} outputFolder="old_run" />,
    );

    // Wait for the initial fetch to populate old lines.
    await waitFor(() =>
      expect(screen.getByTestId("bench-console").textContent).toContain(
        "old-line-1",
      ),
    );

    // Simulate a new run starting — running flips to true.
    await act(async () => {
      rerender(
        <BenchConsole running={true} active={true} outputFolder="new_run" />,
      );
    });

    // Old lines must be gone immediately when running becomes true.
    await waitFor(() =>
      expect(screen.getByTestId("bench-console").textContent).not.toContain(
        "old-line-1",
      ),
    );

    // Advance timer to trigger the interval tick that picks up the new lines.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // New lines from offset 0 must appear.
    await waitFor(() =>
      expect(screen.getByTestId("bench-console").textContent).toContain(
        "new-line-A",
      ),
    );
  });

  it("updates offsetRef when lines is empty so the next fetch advances correctly", async () => {
    // Backend returns empty lines but a new nextOffset. A subsequent fetch
    // must use that new offset, not the stale old one.
    const offsets: number[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const match = /offset=(\d+)/.exec(String(url));
      offsets.push(match ? Number(match[1]) : -1);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ lines: [], nextOffset: 42 }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<BenchConsole running={true} active={true} outputFolder="run" />);

    // First tick: offset=0, response gives nextOffset=42.
    await waitFor(() => expect(offsets.length).toBeGreaterThanOrEqual(1));
    // Second tick after 1s: must use offset=42, not 0.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(offsets.length).toBeGreaterThanOrEqual(2));
    expect(offsets[1]).toBe(42);
  });
});
