import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useRunModelsSplit,
  clampRunModels,
  heightFromStoredRatio,
  maxRunModels,
  DEFAULT_RUN_MODELS_HEIGHT,
  MIN_RUN_MODELS,
  MIN_CONSOLE,
  SPLIT_GAP,
  SPLIT_STORAGE_KEY,
} from "../hooks/useRunModelsSplit";

/**
 * The work area is viewport-locked; 536 is what it measures in the running app
 * at this viewport. jsdom has no layout, so the container height is stubbed —
 * the drag gesture itself is verified in a browser, not here.
 */
const CONTAINER = 536;

/** A ref-shaped stub whose height is readable without any layout engine. */
function makeContainerRef(getHeight: () => number) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ height: getHeight() }) as DOMRect;
  return { current: el } as React.RefObject<HTMLDivElement>;
}

function useSplitWithContainer(containerHeight = CONTAINER) {
  return useRunModelsSplit(makeContainerRef(() => containerHeight));
}

/** A pointer event carrying only what the hook reads. */
function ptr(clientY: number) {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  };
  return { clientY, pointerId: 1, currentTarget: target } as never;
}

beforeEach(() => {
  localStorage.clear();
});

describe("T238 bounds", () => {
  it("caps Run Models so the console keeps its minimum", () => {
    // The console is flex:1, so its floor is enforced by capping Run Models.
    expect(maxRunModels(CONTAINER)).toBe(CONTAINER - MIN_CONSOLE - SPLIT_GAP);
  });

  it("clamps at both ends rather than collapsing either card", () => {
    expect(clampRunModels(-999, CONTAINER)).toBe(MIN_RUN_MODELS);
    expect(clampRunModels(99999, CONTAINER)).toBe(maxRunModels(CONTAINER));
  });

  it("never returns a height that leaves the console under its minimum", () => {
    for (const h of [0, 120, 300, 427, 500, 10_000]) {
      const clamped = clampRunModels(h, CONTAINER);
      expect(CONTAINER - clamped - SPLIT_GAP).toBeGreaterThanOrEqual(MIN_CONSOLE);
    }
  });
});

describe("T238 stored ratio", () => {
  it("round-trips a legal ratio", () => {
    expect(heightFromStoredRatio(String(300 / CONTAINER), CONTAINER)).toBe(300);
  });

  it("REJECTS a ratio that would leave the console below its minimum", () => {
    // The case that would otherwise open the page with no console at all.
    const tooTall = String(0.98);
    expect(heightFromStoredRatio(tooTall, CONTAINER)).toBeNull();
  });

  it("rejects malformed and out-of-band values", () => {
    for (const bad of ["", "abc", "NaN", "-0.5", "0", "1", "2"]) {
      expect(heightFromStoredRatio(bad, CONTAINER)).toBeNull();
    }
  });

  it("a rejected stored value is cleared so the fault does not persist", () => {
    localStorage.setItem(SPLIT_STORAGE_KEY, "0.98");
    renderHook(() => useSplitWithContainer());
    expect(localStorage.getItem(SPLIT_STORAGE_KEY)).toBeNull();
  });

  it("opens usable when the stored value is rejected", () => {
    localStorage.setItem(SPLIT_STORAGE_KEY, "0.98");
    const { result } = renderHook(() => useSplitWithContainer());
    expect(result.current.height).toBe(DEFAULT_RUN_MODELS_HEIGHT);
    expect(CONTAINER - result.current.height - SPLIT_GAP).toBeGreaterThanOrEqual(
      MIN_CONSOLE,
    );
  });

  it("persists as a ratio, not pixels, and restores across a remount", () => {
    const first = renderHook(() => useSplitWithContainer());
    act(() => {
      first.result.current.onPointerDown(ptr(0));
      first.result.current.onPointerMove(ptr(60));
      first.result.current.onPointerUp(ptr(60));
    });
    const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
    expect(Number(stored)).toBeCloseTo(264 / CONTAINER, 5);
    expect(Number(stored)).toBeLessThan(1); // a ratio, not a pixel count

    const second = renderHook(() => useSplitWithContainer());
    expect(second.result.current.height).toBe(264);
  });
});

describe("T238 drag", () => {
  it("dragging DOWN grows Run Models (and so shrinks the flex:1 console)", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    act(() => {
      result.current.onPointerDown(ptr(100));
      result.current.onPointerMove(ptr(160));
    });
    expect(result.current.height).toBe(DEFAULT_RUN_MODELS_HEIGHT + 60);
  });

  it("dragging UP shrinks it again — both directions, not just one", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    act(() => {
      result.current.onPointerDown(ptr(100));
      result.current.onPointerMove(ptr(40));
    });
    expect(result.current.height).toBe(DEFAULT_RUN_MODELS_HEIGHT - 60);
  });

  it("a far drag stops at the bound instead of collapsing the console", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    act(() => {
      result.current.onPointerDown(ptr(0));
      result.current.onPointerMove(ptr(5000));
    });
    expect(result.current.height).toBe(maxRunModels(CONTAINER));
  });

  it("takes pointer capture, so a drag past the window edge is not dropped", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    const down = ptr(100);
    act(() => result.current.onPointerDown(down));
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });
});

describe("T238 text selection", () => {
  it("suppresses selection during the drag and restores it after", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    expect(document.body.style.userSelect).toBe("");

    act(() => {
      result.current.onPointerDown(ptr(100));
      result.current.onPointerMove(ptr(140));
    });
    expect(document.body.style.userSelect).toBe("none");
    expect(document.body.style.cursor).toBe("row-resize");

    act(() => result.current.onPointerUp(ptr(140)));
    // Restored, or the console's Copy button could never be used again.
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");
  });

  it("restores selection when the pointer is released outside the window", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    act(() => {
      result.current.onPointerDown(ptr(100));
      result.current.onPointerMove(ptr(9999));
    });
    act(() => result.current.onPointerCancel(ptr(9999)));
    expect(document.body.style.userSelect).toBe("");
  });
});

describe("T238 reset", () => {
  it("returns to the default and clears the stored ratio", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    act(() => {
      result.current.onPointerDown(ptr(0));
      result.current.onPointerMove(ptr(80));
      result.current.onPointerUp(ptr(80));
    });
    expect(localStorage.getItem(SPLIT_STORAGE_KEY)).not.toBeNull();

    act(() => result.current.reset());
    expect(result.current.height).toBe(DEFAULT_RUN_MODELS_HEIGHT);
    expect(localStorage.getItem(SPLIT_STORAGE_KEY)).toBeNull();
  });

  it("isModified drives the visible control — false at rest, true once dragged", () => {
    const { result } = renderHook(() => useSplitWithContainer());
    expect(result.current.isModified).toBe(false);

    act(() => {
      result.current.onPointerDown(ptr(0));
      result.current.onPointerMove(ptr(40));
    });
    expect(result.current.isModified).toBe(true);

    act(() => result.current.reset());
    expect(result.current.isModified).toBe(false);
  });
});

describe("T238 window resize", () => {
  it("re-clamps on resize, not only on drag", () => {
    // A height legal at 536 must not survive into a container that cannot hold it.
    let containerHeight = CONTAINER;
    const ref = makeContainerRef(() => containerHeight);
    const { result } = renderHook(() => useRunModelsSplit(ref));

    act(() => {
      result.current.onPointerDown(ptr(0));
      result.current.onPointerMove(ptr(200));
    });
    const tall = result.current.height;
    expect(tall).toBeGreaterThan(300);

    containerHeight = 300; // shrink the viewport
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.height).toBeLessThan(tall);
    expect(300 - result.current.height - SPLIT_GAP).toBeGreaterThanOrEqual(
      MIN_CONSOLE,
    );
  });
});
