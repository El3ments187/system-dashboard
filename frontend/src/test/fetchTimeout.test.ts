import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useMultiMetrics } from "../hooks/useMultiMetrics";
import { useStorageMetrics } from "../hooks/useStorageMetrics";
import { useLlamaCppMetrics } from "../hooks/useLlamaCppMetrics";

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

describe("fetchWithTimeout timer-leak guard (B6b)", () => {
  it("clears its timeout when the fetch settles (no leaked timers)", async () => {
    vi.useFakeTimers();
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
    const { fetchWithTimeout } = await import("../services/api");
    await fetchWithTimeout("/x", 1500);
    expect(
      vi.getTimerCount(),
      "settled fetch must not leave a pending timer",
    ).toBe(0);
    vi.useRealTimers();
  });
});

describe("one-shot API call uses 8000ms deadline (B6)", () => {
  it("getCpuMetrics aborts at 8000ms not 1500ms", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise(() => {}); // never resolves
    }) as any;
    const { getCpuMetrics } = await import("../services/api");
    getCpuMetrics().catch(() => {});
    // Must NOT abort before 8000ms
    await vi.advanceTimersByTimeAsync(7999);
    expect(capturedSignal?.aborted, "must not abort before deadline").toBe(
      false,
    );
    // Must abort at/after 8000ms
    await vi.advanceTimersByTimeAsync(2);
    expect(capturedSignal?.aborted, "must abort at the 8000ms deadline").toBe(
      true,
    );
    vi.useRealTimers();
  });
});

describe("useStorageMetrics stall bounds (1500ms deadline)", () => {
  it("aborts in-flight storage fetch and sets error when backend stalls", async () => {
    vi.useFakeTimers();
    global.fetch = stalledFetch() as any;
    const { result } = renderHook(() => useStorageMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.loading).toBe(false);
    vi.useRealTimers();
  });
});

describe("useLlamaCppMetrics stall bounds (1500ms deadline)", () => {
  it("aborts in-flight llama fetch and sets error when backend stalls", async () => {
    vi.useFakeTimers();
    global.fetch = stalledFetch() as any;
    const { result } = renderHook(() => useLlamaCppMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.loading).toBe(false);
    vi.useRealTimers();
  });
});
