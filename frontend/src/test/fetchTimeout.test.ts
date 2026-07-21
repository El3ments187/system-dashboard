import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useMultiMetrics } from "../hooks/useMultiMetrics";

// A fetch that never settles unless its signal aborts it.
function stalledFetch() {
  return vi.fn(
    (_: any, init?: any) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener?.("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  );
}

describe("fetchWithTimeout (unit)", () => {
  it("rejects with AbortError after the deadline", async () => {
    vi.useFakeTimers();
    const { fetchWithTimeout } = await import("../services/api");
    global.fetch = stalledFetch() as any;
    const p = fetchWithTimeout("/x", 1500);
    const guarded = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1501);
    await guarded;
    vi.useRealTimers();
  });
});

describe("poll stall protection (hook level)", () => {
  it("bounds in-flight requests when the backend stalls", async () => {
    vi.useFakeTimers();
    const f = stalledFetch();
    global.fetch = f as any;
    renderHook(() =>
      useMultiMetrics("/api/x", [(d: any) => d.v], undefined, 500),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const started = f.mock.calls.length;
    const settled = (
      await Promise.allSettled(
        f.mock.results.map((r: any) =>
          Promise.race([r.value, Promise.resolve("pending")]),
        ),
      )
    ).filter((r: any) => r.value !== "pending").length;
    expect(
      started - settled,
      "in-flight fetches must be bounded (timeout aborts them)",
    ).toBeLessThanOrEqual(3);
    vi.useRealTimers();
  });
});
