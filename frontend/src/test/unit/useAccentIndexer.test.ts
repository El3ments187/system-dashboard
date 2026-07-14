import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useAccentIndexer } from "../../utils/accentColors";

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("useAccentIndexer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // ── Initial indexing ───────────────────────────────────────────────────

  it("assigns --el-index to [data-accent-el] elements on mount", () => {
    for (let i = 0; i < 3; i++) {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", "");
      document.body.appendChild(el);
    }
    renderHook(() => useAccentIndexer());
    const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
    expect(els[0].style.getPropertyValue("--el-index")).toBe("0");
    expect(els[1].style.getPropertyValue("--el-index")).toBe("1");
    expect(els[2].style.getPropertyValue("--el-index")).toBe("2");
  });

  it("nested tiles each get their own --el-index (per-element spread, no nested-inheritance collapse)", () => {
    const card1 = document.createElement("div");
    card1.setAttribute("data-accent-el", "");

    const tile1 = document.createElement("div");
    tile1.setAttribute("data-accent-el", "");
    card1.appendChild(tile1);

    const tile2 = document.createElement("div");
    tile2.setAttribute("data-accent-el", "");
    card1.appendChild(tile2);

    const card2 = document.createElement("div");
    card2.setAttribute("data-accent-el", "");

    document.body.appendChild(card1);
    document.body.appendChild(card2);

    renderHook(() => useAccentIndexer());

    // Every accent element (card or nested tile) gets its own index.
    expect(card1.style.getPropertyValue("--el-index")).toBe("0");
    expect(tile1.style.getPropertyValue("--el-index")).toBe("1");
    expect(tile2.style.getPropertyValue("--el-index")).toBe("2");
    expect(card2.style.getPropertyValue("--el-index")).toBe("3");
    expect(
      document.documentElement.style.getPropertyValue("--accent-count"),
    ).toBe("4");
  });

  it('skips elements with data-accent-el="inherit" and does not increment the counter for them', () => {
    ["", "inherit", ""].forEach((val) => {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", val);
      document.body.appendChild(el);
    });
    renderHook(() => useAccentIndexer());
    const [a, b, c] =
      document.querySelectorAll<HTMLElement>("[data-accent-el]");
    expect(a.style.getPropertyValue("--el-index")).toBe("0");
    expect(b.style.getPropertyValue("--el-index")).toBe(""); // not set
    expect(c.style.getPropertyValue("--el-index")).toBe("1"); // counter skipped inherit
  });

  // ── Early-exit: mutations without [data-accent-el] nodes ──────────────

  it("does NOT schedule rAF when a mutation contains no [data-accent-el] nodes", async () => {
    let rafScheduled = false;
    vi.stubGlobal("requestAnimationFrame", (_cb: () => void) => {
      rafScheduled = true;
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    renderHook(() => useAccentIndexer());
    rafScheduled = false; // reset after synchronous mount call

    await act(async () => {
      document.body.appendChild(document.createElement("span"));
      await flush();
    });

    expect(rafScheduled).toBe(false);
  });

  it("does NOT schedule rAF when a child element (not accent-el) is added inside a plain div", async () => {
    let rafScheduled = false;
    vi.stubGlobal("requestAnimationFrame", () => {
      rafScheduled = true;
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderHook(() => useAccentIndexer());
    rafScheduled = false;

    await act(async () => {
      container.appendChild(document.createElement("p"));
      await flush();
    });

    expect(rafScheduled).toBe(false);
  });

  // ── rAF scheduling when accent-el nodes change ────────────────────────

  it("schedules rAF when a [data-accent-el] node is added", async () => {
    let pendingCb: (() => void) | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      pendingCb = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      pendingCb = null;
    });

    renderHook(() => useAccentIndexer());
    pendingCb = null; // reset after mount

    await act(async () => {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", "");
      document.body.appendChild(el);
      await flush();
    });

    expect(pendingCb).not.toBeNull();
  });

  it("fires assignIndices when rAF callback runs, updating --el-index", async () => {
    let pendingCb: (() => void) | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      pendingCb = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      pendingCb = null;
    });

    renderHook(() => useAccentIndexer());
    pendingCb = null;

    const el = document.createElement("div");
    el.setAttribute("data-accent-el", "");

    await act(async () => {
      document.body.appendChild(el);
      await flush();
    });

    expect(pendingCb).not.toBeNull();
    pendingCb!(); // simulate rAF firing
    expect(el.style.getPropertyValue("--el-index")).toBe("0");
  });

  // ── rAF coalescing: multiple rapid mutations → one assignIndices call ──

  it("coalesces synchronous DOM mutations into a single rAF callback", async () => {
    // MutationObserver batches all synchronous mutations into one callback invocation,
    // so even N rapid additions produce only 1 rAF schedule (not N).
    let rafCallCount = 0;
    let pendingCb: (() => void) | null = null;

    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      rafCallCount++;
      pendingCb = cb;
      return rafCallCount;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    renderHook(() => useAccentIndexer());
    rafCallCount = 0;
    pendingCb = null;

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        const el = document.createElement("div");
        el.setAttribute("data-accent-el", "");
        document.body.appendChild(el);
      }
      await flush();
    });

    // All 5 synchronous mutations arrive in a single MutationObserver callback → 1 rAF
    expect(rafCallCount).toBe(1);
    expect(pendingCb).not.toBeNull();

    // Fire it — querySelectorAll("[data-accent-el]") called exactly once
    const qsa = vi.spyOn(document, "querySelectorAll");
    pendingCb!();
    const accentElCalls = qsa.mock.calls.filter(
      (c) => c[0] === "[data-accent-el]",
    );
    expect(accentElCalls).toHaveLength(1);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────

  it("cancels pending rAF on unmount", async () => {
    const cancelledIds: number[] = [];
    let lastId = 0;
    vi.stubGlobal("requestAnimationFrame", (_cb: () => void) => {
      lastId++;
      return lastId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelledIds.push(id);
    });

    const { unmount } = renderHook(() => useAccentIndexer());

    // Schedule a pending rAF by adding an accent-el node
    await act(async () => {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", "");
      document.body.appendChild(el);
      await flush();
    });

    const idBeforeUnmount = lastId;
    cancelledIds.length = 0;

    unmount();

    expect(cancelledIds).toContain(idBeforeUnmount);
  });
});
