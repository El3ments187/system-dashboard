import React, { useState } from "react";
import { Cpu, MemoryStick, Gauge, Database, Thermometer } from "lucide-react";
import Sparkline from "../../components/shared/Sparkline";
import type { MetricHistoryPoint, ProcessMetrics } from "../../types/metrics";

const FOOTER_WINDOW_MS = 30_000;

function sliceHistory(
  history: MetricHistoryPoint[] | null | undefined,
): MetricHistoryPoint[] {
  if (!history) return [];
  const cutoff = Date.now() - FOOTER_WINDOW_MS;
  return history.filter(
    (p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff,
  );
}

function formatProcessGpu(procGpu: number | null): string {
  // User ruling: there must NEVER be a "sys" suffix anywhere in this
  // footer. Previously, if the per-process GPU% specifically wasn't
  // available (a driver limitation), this silently substituted the
  // device-wide reading labeled "X% sys" — a partial exception to the
  // broader "llama's own value or nothing" rule. Now: no exception.
  if (procGpu != null) return `${procGpu.toFixed(0)}%`;
  return "—";
}

function formatProcessVram(vramMb: number | null): string {
  if (vramMb != null) return `${(vramMb / 1024).toFixed(1)} GB`;
  return "—";
}

type ProcRing = {
  cpu: MetricHistoryPoint[];
  mem: MetricHistoryPoint[];
  gpu: MetricHistoryPoint[];
  vram: MetricHistoryPoint[];
};

export const EMPTY_RING: ProcRing = { cpu: [], mem: [], gpu: [], vram: [] };

type SysFallback = {
  // gpuPct/vramUsedGb are no longer READ inside updateRing (Step W removed
  // the sys-fallback ring push entirely) but are kept in this type
  // deliberately, not as an oversight: 3 existing test call sites already
  // construct objects with these fields, and TS's excess-property check
  // would force editing every one of them for a purely cosmetic gain —
  // the fields are already provably inert at runtime (see Step W's
  // "does NOT push a device-fallback point" tests, which pass regardless
  // of these values). Real cleanup, real risk, zero behavioral benefit —
  // left alone on purpose.
  gpuPct: number | null | undefined;
  vramUsedGb: number | null | undefined;
  memTotal: number | null | undefined;
  vramTotal: number | null | undefined;
};

export function updateRing(
  ring: ProcRing,
  pm: ProcessMetrics,
  sys: SysFallback,
): ProcRing {
  const now = Date.now();
  const cutoff = now - FOOTER_WINDOW_MS;
  const evict = (arr: MetricHistoryPoint[]) =>
    arr.filter(
      (p) => p.timestamp instanceof Date && p.timestamp.getTime() > cutoff,
    );
  const pt = (val: number): MetricHistoryPoint => ({
    slot: 0,
    timestamp: new Date(now),
    value: val,
  });
  // I-2's rule (the ring must ingest exactly what the tile displays) now
  // means: when the per-process GPU%/VRAM reading isn't available, the
  // tile shows "—", so the ring must NOT push a point either — pushing a
  // sys-fallback value here would put a real number on the graph for a
  // metric the tile is simultaneously calling unavailable. Skipping the
  // push (rather than pushing a fabricated 0 or the device value) leaves
  // a genuine gap, which Step I-5's gap-honesty logic already renders
  // correctly as a break in the line, not a lie about continuity.
  const gpuPoints =
    pm.gpu_util_percent != null
      ? [...evict(ring.gpu), pt(pm.gpu_util_percent)]
      : evict(ring.gpu);
  // Reviewed item 1: a missing TOTAL gets the same treatment as a missing
  // per-process reading — skip the push, leave an honest gap. The old
  // `?? 1` fallbacks turned a 6 GiB reading into a ~600 point (and a
  // 15 GB VRAM reading into ~1494) on a 0–100 graph whenever a total was
  // momentarily null, and the bogus point survived up to 30s of
  // eviction. Any `?? 1` reappearing in this function is that bug
  // regrowing. Graph unit note (user ruling 2026-07-27): these points
  // are PERCENT OF TOTAL on the fixed 0–100 axis (how full), while the
  // tiles show absolute GB (how much) — a deliberate pairing, not an
  // inconsistency.
  const vramPoints =
    pm.vram_mb != null && sys.vramTotal != null
      ? [...evict(ring.vram), pt((pm.vram_mb / 1024 / sys.vramTotal) * 100)]
      : evict(ring.vram);
  const memPoints =
    sys.memTotal != null
      ? [
          ...evict(ring.mem),
          pt((pm.memory_kb / (1024 * 1024) / sys.memTotal) * 100),
        ]
      : evict(ring.mem);
  return {
    cpu: [...evict(ring.cpu), pt(pm.cpu_percent)],
    mem: memPoints,
    gpu: gpuPoints,
    vram: vramPoints,
  };
}

export function FooterStat({
  icon,
  label,
  value,
  color,
  history,
  domain,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  history?: MetricHistoryPoint[];
  domain?: [number, number];
}) {
  return (
    <div
      data-accent-el=""
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flex: 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // User-reported: "the bar is physically moving, shifting side
          // to side." tabular-nums (below) keeps SAME-length numbers
          // stable, but flexShrink:0 alone doesn't reserve any actual
          // width — if the value's CHARACTER COUNT changes even briefly
          // (crossing a digit boundary, a decimal point appearing or
          // disappearing), this column is forced wider, and since all
          // five tiles share flex:1 in one row, the whole row has to
          // redistribute space to compensate — every tile visibly
          // shifting, not just this one. A real reserved minWidth (not
          // just shrink-prevention) makes the column's footprint
          // constant regardless of what text is actually rendered
          // inside it. Sized generously for the longest realistic value
          // across any of the five metrics (e.g. "9999.9%", "999.9 GB").
          minWidth: 72,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      </div>
      {history && (
        <div style={{ flex: 1, minWidth: 0, height: 32 }}>
          <Sparkline
            data={history}
            color={color}
            stretch
            height={32}
            windowMs={FOOTER_WINDOW_MS}
            domain={domain ?? [0, 100]}
          />
        </div>
      )}
    </div>
  );
}

export interface LlamaCppHardwareFooterProps {
  cpuPct: number | null | undefined;
  memUsed: number | null | undefined;
  memTotal: number | null | undefined;
  memPct: number | null | undefined;
  gpuPct: number | null | undefined;
  gpuTemp: number | null | undefined;
  vramUsed: number | null | undefined;
  vramTotal: number | null | undefined;
  cpuHistory: MetricHistoryPoint[];
  memoryHistory: MetricHistoryPoint[];
  gpuHistory: MetricHistoryPoint[];
  gpuVramUtilHistory: MetricHistoryPoint[];
  gpuTempHistory: MetricHistoryPoint[];
  processMetrics?: ProcessMetrics | null;
}

const NULL_TICKS_TO_CONFIRM_STOP = 2;

// Reviewed item 2: 10s staleness bar. Poll cadence is ~1–3s, so a genuine
// isolated flap (one missed poll — the exact case the debounce exists to
// survive) spans at most ~2 intervals (~6s); 10s clears that with margin
// while still catching any real stop-then-restart, and stays well under
// the 30s eviction window that previously bounded the splice damage.
const STALE_GAP_MS = 10_000;

/** Pure fresh-start decision for a new process tick. Extracted to module
 * scope (a) because the hook already sits near the lint complexity
 * ceiling and each reviewed item adds a trigger, and (b) so the three
 * triggers are testable and readable as one flat list:
 * 1. confirmed stop — the null-streak reached its threshold (belt and
 *    braces with the clear that already ran at confirmation);
 * 2. pid change — two different processes back-to-back with NO null gap
 *    (gapless hot-swap) are two runs, never one graph (reviewed item 3;
 *    pid already exists in ProcessMetrics);
 * 3. stale data — the ring's own newest point is older than
 *    STALE_GAP_MS. This is the ONLY reliable restart signal when the
 *    page delivers a reference-stable null after a stop (null is a
 *    primitive, so the `!==` transition gate fires exactly once and the
 *    streak freezes at 1, unconfirmed) — a repeated poll and an
 *    unrelated re-render are indistinguishable by reference, so time,
 *    not identity, has to carry this case (reviewed item 2).
 */
function shouldStartFresh(
  prevProc: ProcessMetrics | null | undefined,
  pm: ProcessMetrics,
  ring: ProcRing,
  nullStreak: number,
): boolean {
  if (nullStreak >= NULL_TICKS_TO_CONFIRM_STOP) return true;
  if (prevProc != null && prevProc.pid !== pm.pid) return true;
  const newest =
    ring.cpu.length > 0 ? ring.cpu[ring.cpu.length - 1].timestamp : null;
  return newest instanceof Date && Date.now() - newest.getTime() > STALE_GAP_MS;
}

/** Owns the per-process sparkline ring: seeds on a new process's first
 * sample, debounces resets (an isolated no-process tick is ignored; two
 * consecutive ones confirm a real stop), and evicts stale points via
 * updateRing's 30s window. Extracted from the component body when the
 * ring's robustness logic (a genuine fix for user-reported permanently
 * empty graphs) pushed the component past the lint complexity ceiling —
 * the extraction is behavior-preserving and the hook is the natural
 * seam: everything ring-related lives here, the component just consumes
 * the result. Uses React's "adjust state during render on prop change"
 * pattern (react.dev: You Might Not Need an Effect) — prevProc guards
 * against loops.
 */
function useProcessRing(
  processMetrics: ProcessMetrics | null | undefined,
  sys: SysFallback,
): ProcRing {
  const [ring, setRing] = useState<ProcRing>(EMPTY_RING);
  const [prevProc, setPrevProc] = useState<ProcessMetrics | null | undefined>(
    undefined,
  );
  const [nullStreak, setNullStreak] = useState(0);
  // User-reported: a full minute into a running model, every ring-driven
  // graph still read "Currently Unavailable" (values populated, graphs
  // never). Two robustness gaps in the old transition logic conspired:
  // (1) on the null->process transition it RESET the ring and only began
  // accumulating on the NEXT distinct update — if updates arrive slowly,
  // are reference-stable, or the mode flaps, the ring can sit empty
  // indefinitely (our own test suite had documented this one-update lag
  // as a workaround rather than fixing it); (2) a SINGLE null tick wiped
  // all history instantly — the same hair-trigger the LogConsole
  // active-profile clear had, fixed here the same way: require
  // consecutive null updates before treating a stop as real. Now the
  // ring SEEDS with the first sample of a new process immediately (a dot
  // renders on the very first tick), and an isolated null tick is
  // ignored rather than destructive.

  if (processMetrics !== prevProc) {
    setPrevProc(processMetrics);
    if (processMetrics != null) {
      setNullStreak(0);
      // Base-ring selection is where the debounce actually bites: keep
      // the existing ring unless a stop was CONFIRMED (nullStreak
      // reached the threshold — which already cleared it, so this term
      // is belt-and-braces). Two traps this exact line has already
      // caught, preserved here so they stay caught: (1) computing a
      // "wasProcess" flag from prevProc alone discarded history on
      // exactly the isolated flap the debounce exists to survive; (2) a
      // `prevProc === undefined` mount-detector could not distinguish
      // "never updated" from "last tick's payload was undefined" — and
      // the real page passes undefined, not null, when the metrics
      // object lacks the field, so an undefined-flap reseeded from
      // empty. The mount case needs NO term at all: the ring's initial
      // state IS EMPTY_RING, so preserving `prev` on the first update
      // seeds from empty naturally. Stale-point safety: updateRing's
      // evict() drops anything older than the 30s window, so a ring
      // retained across a long gap self-empties rather than showing
      // ancient data.
      const startFresh = shouldStartFresh(
        prevProc,
        processMetrics,
        ring,
        nullStreak,
      );
      setRing((prev) =>
        updateRing(startFresh ? EMPTY_RING : prev, processMetrics, {
          ...sys }),
      );
    } else if (prevProc != null || nullStreak > 0) {
      // Count EVERY no-process update toward the stop confirmation — not
      // only the first one after a process. The real page alternates
      // between null (field present, no process) and undefined (field
      // absent), which are DIFFERENT references: a null tick followed by
      // an undefined tick is two consecutive no-process updates and must
      // confirm a stop. The earlier `prevProc != null` guard alone
      // counted only the first (prevProc was null-ish for the second, so
      // the streak froze at 1 and a real stop never cleared the ring).
      // The `nullStreak > 0` disjunct is what lets subsequent null-ish
      // updates keep counting; on mount (prevProc undefined, streak 0)
      // neither side is true, so pre-process null churn stays a no-op.
      const streak = nullStreak + 1;
      setNullStreak(streak);
      if (streak >= NULL_TICKS_TO_CONFIRM_STOP) {
        setRing(EMPTY_RING);
      }
    }
  }

  return ring;
}

export function LlamaCppHardwareFooter({
  memTotal,
  gpuPct,
  gpuTemp,
  vramUsed,
  vramTotal,
  gpuTempHistory,
  processMetrics,
}: LlamaCppHardwareFooterProps) {
  const ring = useProcessRing(processMetrics, {
    gpuPct,
    vramUsedGb: vramUsed,
    memTotal,
    vramTotal,
  });

  const isProcess = processMetrics != null;

  // User ruling: these four tiles must show either llama's OWN usage, or
  // nothing at all — never a system-wide number that could be mistaken
  // for llama's. `null`/empty-history here isn't a missing-data bug, it's
  // the deliberate absence: the existing "—" (value) and "Currently
  // Unavailable" (Sparkline's own zero-point empty state, already proven
  // for Generation/Prompt Speed) do the rest with no new UI needed.
  const dispCpuPct = isProcess ? processMetrics.cpu_percent : null;
  // Tile/graph unit pairing (user ruling 2026-07-27): the RAM and VRAM
  // TILE values are absolute GB ("how much"), while their graphs plot
  // percent-of-total on the fixed 0–100 axis ("how full") — deliberate,
  // not an inconsistency; do not "unify" them.
  const dispMemValue = isProcess
    ? `${(processMetrics.memory_kb / 1024 / 1024).toFixed(1)} GB`
    : null;
  const dispGpuValue = isProcess
    ? formatProcessGpu(processMetrics.gpu_util_percent)
    : null;
  const dispVramValue = isProcess
    ? formatProcessVram(processMetrics.vram_mb)
    : null;

  // Same ruling applies to the graphs: an empty array is what drives
  // Sparkline's existing "Currently Unavailable" state (0 points), the
  // exact text already shown for Generation/Prompt Speed when offline —
  // reusing that mechanism rather than falling back to system history.
  const cpuHist = isProcess ? ring.cpu : [];
  const memHist = isProcess ? ring.mem : [];
  const gpuHist = isProcess ? ring.gpu : [];
  const vramHist = isProcess ? ring.vram : [];
  // GPU TEMP is intentionally untouched (still always device-wide,
  // regardless of isProcess) — per the original design ruling: temperature
  // has no "per-process" reading to distinguish it from; it's always a
  // real physical measurement of the card, not usage attribution.
  const tempHist = sliceHistory(gpuTempHistory);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderTop: "1px solid var(--border-color)",
        padding: "8px 14px",
        background: "var(--bg-secondary)",
      }}
    >
      <FooterStat
        icon={<Cpu size={13} />}
        label="CPU"
        value={dispCpuPct != null ? `${dispCpuPct.toFixed(1)}%` : "—"}
        color="var(--metric-cpu)"
        history={cpuHist}
      />
      <FooterStat
        icon={<MemoryStick size={13} />}
        label="RAM"
        value={dispMemValue ?? "—"}
        color="var(--metric-ram)"
        history={memHist}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={dispGpuValue ?? "—"}
        color="var(--metric-gpu)"
        history={gpuHist}
      />
      <FooterStat
        icon={<Database size={13} />}
        label="VRAM"
        value={dispVramValue ?? "—"}
        color="var(--metric-vram)"
        history={vramHist}
      />
      <FooterStat
        icon={<Thermometer size={13} />}
        label="GPU Temp"
        value={gpuTemp != null ? `${gpuTemp.toFixed(0)}°C` : "—"}
        color="var(--metric-temp)"
        history={tempHist}
        domain={[20, 120]}
      />
    </div>
  );
}
