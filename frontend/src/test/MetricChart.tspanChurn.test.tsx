/**
 * Leak-detection test (cause level, real recharts).
 *
 * The Overview renderer leak = recharts remounting axis <tspan>s every poll
 * (content-keyed <tspan> in recharts' <Text>), leaving detached nodes behind.
 * jsdom cannot count DETACHED nodes — but it can count CREATIONS. A leaking
 * chart creates fresh <tspan>s on every data slide; a fixed chart creates its
 * axis label nodes once and reuses them.
 *
 * This test renders MetricChart with REAL recharts (no mock), slides the data
 * window 30 times (the app's exact per-poll update pattern), and counts
 * createElementNS calls for "tspan" AFTER the initial render settles.
 * Pre-fix: ~1 tspan per visible tick per slide (dozens+). Post-fix: ~0.
 */
import { render, waitFor, act } from "@testing-library/react";
import MetricChart from "../charts/MetricChart";
import type { MetricHistoryPoint } from "../types/metrics";

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function makeHistory(n = 120): MetricHistoryPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i,
    timestamp: new Date(Date.now() - (n - i) * 500),
    value: i % 100,
  }));
}

function slide(data: MetricHistoryPoint[], step: number): MetricHistoryPoint[] {
  const next: MetricHistoryPoint = {
    slot: data[data.length - 1].slot + 1,
    timestamp: new Date(
      data[data.length - 1].timestamp.getTime() + 500 * (step + 1),
    ),
    value: step % 100,
  };
  return [...data.slice(1), next].map((p, idx) => ({ ...p, slot: idx }));
}

describe("MetricChart axis <tspan> churn (leak canary, real recharts)", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      value: () => ({
        width: 400,
        height: 200,
        top: 0,
        left: 0,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
  });

  it("does not create new axis <tspan> nodes across 30 data slides", async () => {
    let data = makeHistory();
    const { rerender, container } = render(
      <MetricChart
        accent={{ color: "#3b82f6", glow: "#60a5fa" }}
        title="Leak canary"
        data={data}
      />,
    );

    // Wait for the lazy recharts import + sized chart to actually paint an axis.
    await waitFor(
      () => {
        expect(
          container.querySelectorAll("text.recharts-cartesian-axis-tick-value")
            .length,
        ).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    // Start counting AFTER initial mount: only churn from slides is a leak.
    const realCreateNS = Document.prototype.createElementNS;
    let tspanCreations = 0;
    Document.prototype.createElementNS = function (
      this: Document,
      ...args: Parameters<typeof realCreateNS>
    ) {
      if (String(args[1]).toLowerCase() === "tspan") tspanCreations++;
      return realCreateNS.apply(this, args);
    } as typeof realCreateNS;

    try {
      for (let i = 0; i < 30; i++) {
        data = slide(data, i);
        await act(async () => {
          rerender(
            <MetricChart
              accent={{ color: "#3b82f6", glow: "#60a5fa" }}
              title="Leak canary"
              data={data}
            />,
          );
        });
      }
    } finally {
      Document.prototype.createElementNS = realCreateNS;
    }

    // Fixed behavior: axis labels are plain <text> reconciled in place — zero
    // new tspans per slide. The leaking behavior creates one per visible tick
    // per slide (~6 x 30 = ~180). Threshold 10 tolerates incidental noise while
    // failing hard on per-slide churn.
    expect(
      tspanCreations,
      `axis <tspan> nodes were re-created during data slides (${tspanCreations} creations across 30 slides) — this is the detached-node leak pattern`,
    ).toBeLessThan(10);
  });
});
