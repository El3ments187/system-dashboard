/**
 * Hidden-tab gating regression pins for the two hooks that never had them.
 * The useMultiMetrics gating test exists; without these, the 500ms storage
 * poll (the hottest loop in the app) or the llama poll could silently regress
 * to fetching while the tab is hidden and nothing would go red.
 * Assertions are on FETCH CALL COUNTS only (the gating contract), never on
 * payload shape, so backend schema changes can't false-fail these.
 */
import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useStorageMetrics } from "../hooks/useStorageMetrics";
import { useLlamaCppMetrics } from "../hooks/useLlamaCppMetrics";

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};
const okJson = (payload: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

describe("hidden-tab poll gating (storage + llama)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("useStorageMetrics stops fetching while hidden and resumes on visible", async () => {
    global.fetch = okJson([]) as unknown as typeof fetch;
    renderHook(() => useStorageMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    const visibleCalls = (global.fetch as any).mock.calls.length;
    expect(visibleCalls).toBeGreaterThan(2); // 500ms cadence => several ticks

    act(() => setHidden(true));
    const before = (global.fetch as any).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(
      (global.fetch as any).mock.calls.length - before,
      "storage polls must be no-ops while hidden",
    ).toBeLessThanOrEqual(2); // tolerance: at most the visibilitychange tick pair

    act(() => setHidden(false));
    const resumedFrom = (global.fetch as any).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect((global.fetch as any).mock.calls.length).toBeGreaterThan(
      resumedFrom + 1,
    );
  });

  it("useLlamaCppMetrics does not fetch while hidden (pin of existing behavior)", async () => {
    global.fetch = okJson({}) as unknown as typeof fetch;
    renderHook(() => useLlamaCppMetrics());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    act(() => setHidden(true));
    const before = (global.fetch as any).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(
      (global.fetch as any).mock.calls.length - before,
      "llama polls must be no-ops while hidden",
    ).toBeLessThanOrEqual(2);
  });
});
