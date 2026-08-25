import React from "react";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LogConsole } from "../components/LogConsole";
import type { LogLine } from "../types/metrics";

/**
 * T243 task 3 — the console pin must survive a LARGE resize.
 *
 * T238 re-pins via a ResizeObserver when `isAtBottomRef` is true. That ref is
 * written by `handleScroll`, which fires AFTER geometry changes, so the
 * observer has to act on the pre-resize value. Existing coverage was a 60px
 * delta — smaller than nothing, since the "at bottom" threshold is 40px, so
 * wrong ordering would pass it too. 400px cannot be masked that way.
 *
 * jsdom has no layout (scrollHeight/clientHeight are 0) and setup.ts stubs
 * ResizeObserver to a no-op, so both are supplied explicitly here. What this
 * proves is the observer's DECISION — re-pin only when it was already pinned —
 * not the browser's event ordering, which is checked in a real browser.
 */

const AT_BOTTOM_THRESHOLD = 40;

// ── capture the ResizeObserver callback so the resize can be driven ──────────
let roCallbacks: Array<() => void> = [];
class CapturingRO {
  constructor(private cb: () => void) {
    roCallbacks.push(() => this.cb());
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ── minimal WebSocket mock: enough to deliver history lines ─────────────────
const wsInstances: MockWs[] = [];
class MockWs {
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 0;
  constructor(public url: string) {
    wsInstances.push(this);
  }
  close() {
    this.onclose?.(new CloseEvent("close"));
  }
  openWs() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  sendHistory(lines: LogLine[]) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "history", lines, exited: false }),
      }),
    );
  }
}

function syntheticLines(n: number): LogLine[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: `12:００:${String(i % 60).padStart(2, "0")}`,
    level: "info",
    text: `synthetic log line ${i} — enough content to overflow the viewport`,
  })) as unknown as LogLine[];
}

/** Give an element the layout jsdom refuses to compute. */
function stubGeometry(
  el: HTMLElement,
  geo: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, "scrollHeight", {
    value: geo.scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: geo.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, "scrollTop", {
    value: geo.scrollTop,
    writable: true,
    configurable: true,
  });
}

let origRO: typeof globalThis.ResizeObserver;
let origWs: typeof globalThis.WebSocket;
/** jsdom has no scrollIntoView; this both supplies it and IS the re-pin spy. */
let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  roCallbacks = [];
  wsInstances.length = 0;
  origRO = globalThis.ResizeObserver;
  origWs = globalThis.WebSocket;
  globalThis.ResizeObserver = CapturingRO as unknown as typeof ResizeObserver;
  scrollIntoViewSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewSpy as unknown as () => void;
  globalThis.WebSocket = MockWs as unknown as typeof WebSocket;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => "",
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.ResizeObserver = origRO;
  globalThis.WebSocket = origWs;
  vi.restoreAllMocks();
});

/**
 * Mount with enough lines to overflow, and return the scroller plus a spy on
 * the re-pin mechanism (`logEndRef.scrollIntoView`).
 */
async function mountOverflowingConsole() {
  const { container } = render(<LogConsole />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  const ws = wsInstances[wsInstances.length - 1];
  if (ws) {
    act(() => {
      ws.openWs();
      ws.sendHistory(syntheticLines(300));
    });
  }

  // The element that actually carries scrollRef + onScroll. Selecting any
  // other div means handleScroll never runs and isAtBottomRef keeps its
  // initial value — which would make these tests pass without testing anything.
  const scroller = container.querySelector<HTMLElement>(
    '[data-testid="log-area"]',
  );
  if (!scroller) throw new Error("log-area scroller not found");

  // 300 lines at ~18px against a 500px viewport, so a 400px shrink still
  // leaves a real (100px) console rather than a degenerate zero.
  stubGeometry(scroller, {
    scrollHeight: 5400,
    clientHeight: 500,
    scrollTop: 0,
  });

  return { scroller, scrollIntoView: scrollIntoViewSpy };
}

/** Drive a resize: change the geometry, then run the observer callbacks. */
function resizeTo(el: HTMLElement, clientHeight: number) {
  Object.defineProperty(el, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  act(() => {
    roCallbacks.forEach((cb) => cb());
  });
}

describe("T243 task 3 — console pin survives a large resize", () => {
  it("the fixture actually overflows (precondition, not assumed)", async () => {
    const { scroller } = await mountOverflowingConsole();
    // The last attempt passed vacuously on an empty console; this is the guard.
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(roCallbacks.length).toBeGreaterThan(0);
  });

  it("a pinned console is STILL pinned after a 400px shrink", async () => {
    const { scroller, scrollIntoView } = await mountOverflowingConsole();

    // Pin to the bottom and let handleScroll record it.
    scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
    fireEvent.scroll(scroller);
    const distPinned =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    expect(distPinned).toBeLessThan(AT_BOTTOM_THRESHOLD);

    scrollIntoView.mockClear();
    resizeTo(scroller, 100); // 500 → 100: a 400px shrink

    expect(
      scrollIntoView,
      "a 400px shrink pushes distFromBottom far past the 40px threshold — " +
        "the observer must re-pin, or the console silently stops following",
    ).toHaveBeenCalled();
  });

  it("a deliberately scrolled-up console is NOT yanked to the bottom", async () => {
    const { scroller, scrollIntoView } = await mountOverflowingConsole();

    // Read an earlier line: far from the bottom.
    scroller.scrollTop = 1000;
    fireEvent.scroll(scroller);
    expect(
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
    ).toBeGreaterThan(AT_BOTTOM_THRESHOLD);

    scrollIntoView.mockClear();
    resizeTo(scroller, 100); // same 400px shrink

    expect(
      scrollIntoView,
      "the user is reading an earlier line — a resize must not steal their place",
    ).not.toHaveBeenCalled();
  });
});
