import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LlamaCppHardwareFooter,
  FooterStat,
  updateRing,
  EMPTY_RING,
} from "../pages/llamacpp/FooterStat";
import type { ProcessMetrics } from "../types/metrics";

const BASE_PROPS = {
  cpuPct: 45,
  memUsed: 14,
  memTotal: 16,
  memPct: 87.5,
  gpuPct: 60,
  gpuTemp: 72,
  vramUsed: 20,
  vramTotal: 24,
  cpuHistory: [],
  memoryHistory: [],
  gpuHistory: [],
  gpuVramUtilHistory: [],
  gpuTempHistory: [],
};

const PROCESS_METRICS: ProcessMetrics = {
  pid: 12345,
  cpu_percent: 1.3,
  memory_kb: 6291456, // 6 GiB
  uptime_seconds: 3600,
  vram_mb: 15300, // ~14.9 GiB
  gpu_util_percent: 87,
};

// ── G2: process source swap ──────────────────────────────────────────

describe("LlamaCppHardwareFooter — process source", () => {
  it("shows process CPU% when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    // Process CPU: 1.3%  (system would be 45.0%)
    expect(screen.getByText("1.3%")).toBeInTheDocument();
    expect(screen.queryByText("45.0%")).not.toBeInTheDocument();
  });

  it("shows process GPU% when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    // Process GPU: 87% (system would be 60%)
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.queryByText("60%")).not.toBeInTheDocument();
  });

  it("shows process RAM when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    // 6291456 KB / 1024 / 1024 = 6.0 GB
    expect(screen.getByText(/6\.0 GB/)).toBeInTheDocument();
    // system would be 14 / 16
    expect(screen.queryByText(/14\.0.*16\.0/)).not.toBeInTheDocument();
  });

  it("shows process VRAM when processMetrics provided", () => {
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    // 15300 MB / 1024 ≈ 14.9 GB
    expect(screen.getByText(/14\.9 GB/)).toBeInTheDocument();
    // system would show 20 / 24 GB
    expect(screen.queryByText(/20\.0.*24\.0/)).not.toBeInTheDocument();
  });

  it("GPU Temp tile is always device-wide (process has no per-process temp)", () => {
    render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    expect(screen.getByText("72°C")).toBeInTheDocument();
  });

  it("idle footer (no processMetrics) shows NO values — never system-wide numbers that could be mistaken for llama's own usage", () => {
    // User ruling: either the value comes from the llama process, or there
    // is no value at all. Previously this footer fell back to showing the
    // whole MACHINE's CPU/RAM/GPU/VRAM when no model was running — with no
    // visual distinction from process-mode, easily misread as "llama is
    // using 45% CPU" when llama wasn't running at all. Now: em-dash for
    // each value, and each sparkline gets zero points, which triggers its
    // own existing "Currently Unavailable" empty state — the same
    // mechanism already used by Generation/Prompt Speed when offline.
    render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    expect(screen.queryByText("45.0%")).not.toBeInTheDocument();
    expect(screen.queryByText(/14\.0.*16\.0/)).not.toBeInTheDocument();
    expect(screen.queryByText("60%")).not.toBeInTheDocument();
    expect(screen.queryByText(/20\.0.*24\.0/)).not.toBeInTheDocument();
    // CPU/RAM/GPU/VRAM all show the empty-value dash — 4 occurrences.
    expect(screen.getAllByText("—")).toHaveLength(4);
    // GPU Temp is the one deliberate exception — always a real, device-wide
    // physical measurement, no "per-process" version exists to distinguish
    // it from, so it's untouched by this ruling.
    expect(screen.getByText("72°C")).toBeInTheDocument();
    expect(
      screen.getAllByText("Currently Unavailable").length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("BEFORE and DURING: the SAME footer instance transitions correctly from no-model to model-running as processMetrics arrives", () => {
    // The two tests above/below each check one state in isolation — a
    // fresh render that happens to already have the right props. That
    // doesn't prove a LIVE session behaves correctly: the real app renders
    // ONE component instance that receives a NEW processMetrics prop on
    // each poll once a model starts (idle -> running), and a bug in that
    // TRANSITION (stale values lingering, a value failing to populate on
    // its first real poll) wouldn't be caught by two independent
    // snapshots. This test drives one instance through both states, in
    // order, the way the real page actually does.

    // BEFORE: model not running yet — must show nothing, not system values.
    const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("1.3%")).not.toBeInTheDocument();
    expect(screen.queryByText(/6\.0 GB/)).not.toBeInTheDocument();
    expect(screen.queryByText("87%")).not.toBeInTheDocument();
    expect(screen.queryByText(/14\.9 GB/)).not.toBeInTheDocument();
    // GPU Temp is real and present even before any model runs.
    expect(screen.getByText("72°C")).toBeInTheDocument();

    // DURING: the model just started — processMetrics arrives. Same
    // component instance, new prop, matching a real poll transition.
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={PROCESS_METRICS}
      />,
    );
    // Values update INSTANTLY — they read processMetrics directly, no
    // accumulation needed. This is the user's actual ask: real numbers
    // must appear the moment a model is detected running.
    expect(screen.getByText("1.3%")).toBeInTheDocument();
    expect(screen.getByText(/6\.0 GB/)).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText(/14\.9 GB/)).toBeInTheDocument();
    // Confirms these are PROCESS values, not system fallbacks, by ruling
    // out BASE_PROPS' system numbers appearing instead.
    expect(screen.queryByText("45.0%")).not.toBeInTheDocument();
    expect(screen.queryByText("60%")).not.toBeInTheDocument();
    // The graphs now populate on this SAME first transition: the ring
    // SEEDS with the first sample immediately (user-reported regression
    // fix — a running model previously showed "Currently Unavailable"
    // graphs indefinitely because the old logic reset on the transition
    // and waited for the NEXT distinct update; that lag was even
    // documented in this very comment as "expected, not a bug" — it was
    // a bug). Only GPU Temp's graph remains unavailable here, and only
    // because this fixture's gpuTempHistory is empty — unrelated to
    // isProcess.
    expect(screen.getAllByText("Currently Unavailable")).toHaveLength(1);
    // A second update (matching the NEXT real poll) keeps accumulating:
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    // Exactly ONE "Currently Unavailable" remains at this point: GPU
    // Temp's own graph, which is unrelated to isProcess entirely (its
    // history was never gated on it) — this fixture's gpuTempHistory is
    // simply empty ([]), a pre-existing test-data gap that has nothing to
    // do with this fix. The four PROCESS-gated tiles (CPU/RAM/GPU/VRAM)
    // must have caught up and be showing real graphs by now.
    expect(screen.getAllByText("Currently Unavailable")).toHaveLength(1);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    // GPU Temp stays real and unchanged across the whole transition — it
    // was never gated on isProcess in the first place.
    expect(screen.getAllByText("72°C").length).toBeGreaterThan(0);
  });

  it("shows em-dash (never a 'sys' suffix) when process gpu_util_percent is null", () => {
    // User ruling: there must NEVER be a "sys" suffix anywhere in this
    // footer, including this narrower per-metric case (a model IS
    // running, but the driver doesn't report per-process GPU% for it).
    // No silent substitution of the device-wide reading — just "—",
    // consistent with the broader "llama's own value or nothing" rule.
    const pm: ProcessMetrics = { ...PROCESS_METRICS, gpu_util_percent: null };
    render(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={pm} />);
    expect(screen.queryByText(/sys/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/60/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows em-dash (never a 'sys' suffix) when process vram_mb is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, vram_mb: null };
    render(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={pm} />);
    expect(screen.queryByText(/sys/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/20\.0.*24\.0/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ── I-2: ring ingests the displayed value, not the raw process field ──

describe("updateRing — ring ingests display value", () => {
  it("does NOT push a device-fallback point when process gpu_util_percent is null", () => {
    // The tile shows "—" in this case (per the ruling above) — the ring
    // must match that exactly: no fabricated point, not even the device
    // value. Skipping the push leaves a genuine gap, which Step I-5's
    // gap-honesty logic already renders correctly as a break in the line.
    const pm: ProcessMetrics = { ...PROCESS_METRICS, gpu_util_percent: null };
    const ring = updateRing(EMPTY_RING, pm, {
      gpuPct: 64,
      vramUsedGb: null,
      memTotal: 32,
      vramTotal: 24,
    });
    expect(ring.gpu).toHaveLength(0);
  });

  it("does NOT push a device-fallback point when process vram_mb is null", () => {
    const pm: ProcessMetrics = { ...PROCESS_METRICS, vram_mb: null };
    const ring = updateRing(EMPTY_RING, pm, {
      gpuPct: null,
      vramUsedGb: 20,
      memTotal: 32,
      vramTotal: 24,
    });
    expect(ring.vram).toHaveLength(0);
  });

  it("ring.mem stores percent of memTotal, not raw GB (I-4 unit unification)", () => {
    // 8.3 GB of a 30.5 GB total → ~27.2%
    const memKb = 8.3 * 1024 * 1024;
    const pm: ProcessMetrics = { ...PROCESS_METRICS, memory_kb: memKb };
    const ring = updateRing(EMPTY_RING, pm, {
      gpuPct: null,
      vramUsedGb: null,
      memTotal: 30.5,
      vramTotal: 24,
    });
    const pct = ring.mem[ring.mem.length - 1]!.value;
    expect(Math.abs(pct - (8.3 / 30.5) * 100)).toBeLessThan(0.1);
  });
});

// ── G2b: sparkline stretch + 30s window ──────────────────────────────

describe("LlamaCppHardwareFooter — sparkline stretch mode wiring (process mode)", () => {
  // The two tests this replaces used idle-mode's cpuHistory fallback purely
  // as a convenient vehicle to inject a static history array — not because
  // idle-mode's system fallback was itself the thing under test. That
  // vehicle no longer exists (idle mode now shows nothing, per the new
  // ruling above). The underlying stretch/windowMs MECHANICS are already
  // directly and thoroughly covered in Sparkline.test.tsx (7+ call sites);
  // duplicating that here would be redundant. What's actually specific to
  // THIS file and still worth guarding: that FooterStat's JSX continues to
  // pass `stretch` to its Sparkline calls at all — a future edit could
  // silently drop the prop without any Sparkline-level test catching it.
  it("CPU tile's Sparkline is called with stretch mode (process mode, real data present)", () => {
    // The ring now seeds on the very first render (one point). A second
    // render with a NEW object reference accumulates a second point,
    // matching a genuine second poll — two points guarantee a <path>
    // (not just a single-point dot) for the svg inspection below.
    const { rerender } = render(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    const cpuLabel = screen.getByText("CPU");
    const cpuTile = cpuLabel.closest("[data-accent-el]") as HTMLElement;
    // The tile's icon (lucide-react's <Cpu>) also renders as an <svg> —
    // check ALL svgs in the tile, not just the first, since DOM order
    // isn't guaranteed to put the Sparkline's svg first.
    const svgs = cpuTile ? Array.from(cpuTile.querySelectorAll("svg")) : [];
    expect(
      svgs.length,
      "CPU tile must render at least one svg",
    ).toBeGreaterThan(0);
    const hasStretch = svgs.some(
      (svg) => svg.getAttribute("preserveAspectRatio") === "none",
    );
    expect(
      hasStretch,
      "CPU tile's Sparkline must use stretch mode in process mode",
    ).toBe(true);
  });
});

// ─── value-column width stability ──────────────────────────────────────

describe("ring robustness — seed on transition, debounced reset (user-reported empty-graphs regression)", () => {
  // Helper: the CPU tile's sparkline svg elements. A single-point ring
  // renders a dot (<circle>); two-plus points render a line (<path>);
  // zero points render the "Currently Unavailable" text instead of an
  // svg. That distinction is what separates "history PRESERVED across a
  // flap" (path) from "history LOST and merely reseeded" (circle only).
  const cpuSparklineShapes = () => {
    const cpuTile = screen
      .getByText("CPU")
      .closest("[data-accent-el]") as HTMLElement;
    // The tile contains TWO kinds of svg: the lucide <Cpu> ICON (class
    // "lucide", drawn entirely with <path>s) and the Sparkline chart.
    // Counting paths without excluding the icon made a paths>0 assertion
    // pass vacuously — caught when the stricter paths===0 case turned up
    // 12 icon paths. Filter to non-icon svgs only.
    const svgs = Array.from(cpuTile.querySelectorAll("svg")).filter(
      (v) => !v.classList.contains("lucide"),
    );
    return {
      paths: svgs.flatMap((v) => Array.from(v.querySelectorAll("path"))),
      circles: svgs.flatMap((v) => Array.from(v.querySelectorAll("circle"))),
    };
  };

  it("seeds the ring with the FIRST sample: graphs render on the very first process tick", () => {
    // The user's exact report: model running a full minute, values
    // populated, every ring graph still "Currently Unavailable". Old
    // logic reset the ring on the idle->process transition and only
    // accumulated on the NEXT distinct update — if that never arrives
    // (or references are stable), graphs stay empty forever.
    const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    // Immediately — no second update — only GPU Temp's (fixture-empty,
    // isProcess-unrelated) graph may be unavailable.
    expect(screen.getAllByText("Currently Unavailable")).toHaveLength(1);
  });

  it("an ISOLATED null tick does not destroy accumulated history (debounced reset)", () => {
    // Build real multi-point history, flap null for ONE tick, return.
    const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    for (let i = 0; i < 3; i++) {
      rerender(
        <LlamaCppHardwareFooter
          {...BASE_PROPS}
          processMetrics={{ ...PROCESS_METRICS }}
        />,
      );
    }
    // One flaky tick with no process payload…
    rerender(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    // …then the process is back on the next poll.
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    expect(screen.getAllByText("Currently Unavailable")).toHaveLength(1);
    // History PRESERVED: 3 pre-flap points + the return tick = a line,
    // not a lone reseeded dot. (Old logic: the return tick counted as a
    // fresh transition and threw the history away.)
    expect(cpuSparklineShapes().paths.length).toBeGreaterThan(0);
  });

  it("TWO consecutive no-process updates confirm a real stop and clear the ring", () => {
    // Two distinct null-ish updates (null, then undefined — different
    // references, so both register; exactly how alternating payloads
    // with-field-null / without-field present in the real context) must
    // clear. The subsequent restart then starts from a genuinely fresh
    // ring: its first tick seeds ONE point — a dot, no multi-point path.
    const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
    for (let i = 0; i < 3; i++) {
      rerender(
        <LlamaCppHardwareFooter
          {...BASE_PROPS}
          processMetrics={{ ...PROCESS_METRICS }}
        />,
      );
    }
    rerender(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={null} />,
    );
    rerender(
      <LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={undefined} />,
    );
    rerender(
      <LlamaCppHardwareFooter
        {...BASE_PROPS}
        processMetrics={{ ...PROCESS_METRICS }}
      />,
    );
    const shapes = cpuSparklineShapes();
    expect(
      shapes.paths.length,
      "confirmed stop must clear history — restart should NOT show pre-stop points",
    ).toBe(0);
    expect(shapes.circles.length).toBeGreaterThan(0);
  });

  describe("stale-gap and pid-change fresh starts", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("a restart after a >10s no-data gap starts a FRESH graph even when the null reference never changed", () => {
      // Item 2 (reviewed): after a stop, the real page can deliver the
      // SAME `null` reference every tick (null is a primitive), so the
      // transition gate `processMetrics !== prevProc` fires once and the
      // stop-confirmation streak freezes at 1 — never confirmed. Within
      // the 30s eviction window, a restart then seeds ONTO the previous
      // run's surviving points, splicing the old model's tail into the
      // new run's graph. Reference tricks cannot fix this (a repeated
      // poll and an unrelated re-render are indistinguishable by
      // reference), so the fix is time-based: if the ring's own newest
      // point is older than STALE_GAP_MS (10s — see the constant's
      // comment for the cadence math), a new process starts fresh.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
      const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
      for (let i = 0; i < 3; i++) {
        rerender(
          <LlamaCppHardwareFooter
            {...BASE_PROPS}
            processMetrics={{ ...PROCESS_METRICS }}
          />,
        );
      }
      // One null tick — the ONLY transition the gate will ever see for a
      // reference-stable null; the streak sits at 1, unconfirmed.
      rerender(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={null} />);
      // 15s pass: inside the 30s window (old points still evictable-not-
      // evicted — the splice hazard is live), past the 10s staleness bar.
      vi.setSystemTime(new Date("2026-07-27T12:00:15Z"));
      rerender(
        <LlamaCppHardwareFooter
          {...BASE_PROPS}
          processMetrics={{ ...PROCESS_METRICS }}
        />,
      );
      const shapes = cpuSparklineShapes();
      expect(
        shapes.paths.length,
        "restart after a real gap must NOT splice the previous run's tail into the new graph",
      ).toBe(0);
      expect(shapes.circles.length).toBeGreaterThan(0);
    });

    it("a brief flap (single null tick, ~3s) still PRESERVES the growing graph (guard: staleness must not over-trigger)", () => {
      // Anti-vacuity guard for item 2: this must pass against the code
      // BEFORE the staleness change (proving the scenario was already
      // healthy) and AFTER it (proving 10s was chosen high enough that a
      // one-missed-poll flap at ~3s cadence never trips it).
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
      const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
      for (let i = 0; i < 3; i++) {
        rerender(
          <LlamaCppHardwareFooter
            {...BASE_PROPS}
            processMetrics={{ ...PROCESS_METRICS }}
          />,
        );
      }
      rerender(<LlamaCppHardwareFooter {...BASE_PROPS} processMetrics={null} />);
      vi.setSystemTime(new Date("2026-07-27T12:00:03Z"));
      rerender(
        <LlamaCppHardwareFooter
          {...BASE_PROPS}
          processMetrics={{ ...PROCESS_METRICS }}
        />,
      );
      expect(
        cpuSparklineShapes().paths.length,
        "a brief flap must keep accumulated history — a line, not a reset dot",
      ).toBeGreaterThan(0);
    });

    it("a PID change with NO null gap starts a FRESH graph (gapless hot-swap)", () => {
      // Item 3 (reviewed): two different processes back-to-back with no
      // null tick between them previously merged both models' points
      // into one graph — updateRing never looked at identity. pid is
      // already in ProcessMetrics; a pid change IS a new run.
      const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
      for (let i = 0; i < 3; i++) {
        rerender(
          <LlamaCppHardwareFooter
            {...BASE_PROPS}
            processMetrics={{ ...PROCESS_METRICS, pid: 111 }}
          />,
        );
      }
      rerender(
        <LlamaCppHardwareFooter
          {...BASE_PROPS}
          processMetrics={{ ...PROCESS_METRICS, pid: 222 }}
        />,
      );
      const shapes = cpuSparklineShapes();
      expect(
        shapes.paths.length,
        "pid 111's points must not appear in pid 222's graph",
      ).toBe(0);
      expect(shapes.circles.length).toBeGreaterThan(0);
    });

    it("same-pid ticks still ACCUMULATE (guard: identity check must not over-trigger on reference churn)", () => {
      // Anti-vacuity guard for item 3: distinct object references with
      // the SAME pid are the normal every-poll case and must keep
      // building the line. Passes before and after the change.
      const { rerender } = render(<LlamaCppHardwareFooter {...BASE_PROPS} />);
      for (let i = 0; i < 4; i++) {
        rerender(
          <LlamaCppHardwareFooter
            {...BASE_PROPS}
            processMetrics={{ ...PROCESS_METRICS, pid: 111 }}
          />,
        );
      }
      expect(cpuSparklineShapes().paths.length).toBeGreaterThan(0);
    });
  });
});

describe("FooterStat value column reserves a fixed width (no side-to-side shift)", () => {
  it("the value column's reserved width is the SAME whether the value is short or long", () => {
    // User-reported: "the bar is physically moving, shifting side to
    // side." Root cause: the value column had flexShrink:0 (won't
    // compress) but no actual reserved minWidth — a value crossing a
    // digit-count boundary (e.g. "9%" -> "10%") forced the column wider,
    // and since all 5 footer tiles share flex:1 in one row, the WHOLE
    // row redistributed space to compensate. This test proves the fix
    // mechanically: the column's reserved width must be identical
    // regardless of whether the rendered value is short or long — that's
    // what makes the row's layout independent of content.
    const { container: shortContainer } = render(
      <FooterStat
        icon={<span />}
        label="CPU"
        value="3%"
        color="var(--metric-cpu)"
      />,
    );
    const { container: longContainer } = render(
      <FooterStat
        icon={<span />}
        label="CPU"
        value="9999.9%"
        color="var(--metric-cpu)"
      />,
    );
    // The value column is the parent of the value <span> (identified by
    // the tabular-nums style that's unique to it, per the component).
    const getValueColumn = (container: HTMLElement) => {
      const valueSpan = Array.from(container.querySelectorAll("span")).find(
        (el) => el.style.fontVariantNumeric === "tabular-nums",
      );
      return valueSpan?.parentElement ?? null;
    };
    const shortColumn = getValueColumn(shortContainer);
    const longColumn = getValueColumn(longContainer);
    expect(shortColumn, "short-value column not found").toBeTruthy();
    expect(longColumn, "long-value column not found").toBeTruthy();
    expect(
      shortColumn!.style.minWidth,
      "the reserved width must not depend on content length",
    ).toBe(longColumn!.style.minWidth);
    expect(shortColumn!.style.minWidth).not.toBe("0px");
    expect(shortColumn!.style.minWidth).not.toBe("");
  });
});

// ─── Item 1: missing totals must not fabricate off-scale points ────────

describe("updateRing — missing totals are a gap, not a divide-by-1", () => {
  it("no mem point is pushed when memTotal is missing (CPU unaffected)", () => {
    // Reviewed item 1: `memTotal ?? 1` turned a 6 GiB reading into a
    // ~600 point on a 0–100 graph whenever the total was momentarily
    // null (backend restart, first ticks) — and the bogus point survived
    // up to 30s of eviction. Missing total now gets the SAME treatment
    // this function already gives a missing per-process reading: skip
    // the push, leave an honest gap.
    const seeded = updateRing(EMPTY_RING, { ...PROCESS_METRICS }, {
      gpuPct: null,
      vramUsedGb: null,
      memTotal: 32,
      vramTotal: 24,
    });
    expect(seeded.mem).toHaveLength(1);
    const after = updateRing(seeded, { ...PROCESS_METRICS }, {
      gpuPct: null,
      vramUsedGb: null,
      memTotal: null,
      vramTotal: 24,
    });
    expect(
      after.mem,
      `missing memTotal must not push — got extra point value=${after.mem.at(-1)?.value}`,
    ).toHaveLength(1);
    expect(after.cpu.length).toBeGreaterThan(seeded.cpu.length);
  });

  it("no vram point is pushed when vramTotal is missing (GPU unaffected)", () => {
    const seeded = updateRing(EMPTY_RING, { ...PROCESS_METRICS }, {
      gpuPct: null,
      vramUsedGb: null,
      memTotal: 32,
      vramTotal: 24,
    });
    expect(seeded.vram).toHaveLength(1);
    const after = updateRing(seeded, { ...PROCESS_METRICS }, {
      gpuPct: null,
      vramUsedGb: null,
      memTotal: 32,
      vramTotal: null,
    });
    expect(
      after.vram,
      `missing vramTotal must not push — got extra point value=${after.vram.at(-1)?.value}`,
    ).toHaveLength(1);
    expect(after.gpu.length).toBeGreaterThan(seeded.gpu.length);
  });
});
