/**
 * The footer stat strip: five figures with sparklines, mirroring the
 * llama.cpp hardware footer's role on that page.
 *
 * Every series is derived from the run's own ordered records, so the strip
 * describes the selected run rather than the machine.
 */
import { fmtUptime } from "../llamaCppUtils";
import { fmtNum } from "../llamacpp/parts";
import { gradedRecords } from "./compute";
import type { BenchRecord, BenchRunDetail } from "./types";

const MONO = '"JetBrains Mono", "Fira Code", monospace';

/** Running totals, without mutating anything during render. */
function cumulative(values: number[]): number[] {
  return values.reduce<number[]>(
    (acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v],
    [],
  );
}

/**
 * The design's sparkline is discrete BARS, not a line
 * (bench-page-design-7.html:388-390 — `.fspark i`, 3px wide, own height).
 * The shared `Sparkline` is line/area-only, and a line through the 1-2
 * points a run has early on is by definition one long diagonal across the
 * whole strip, which is exactly what it drew. Bars degrade honestly: two
 * points look like two bars.
 *
 * Rendered locally rather than by teaching the shared component a bar mode,
 * because that component has other callers and this is the only one the
 * design draws as bars.
 */
function BarSpark({ values }: { values: Array<number | null> }) {
  const real = values.filter((v): v is number => v !== null && isFinite(v));
  // Nothing to say yet — say nothing, rather than draw a shape.
  if (real.length === 0)
    return <span style={{ flex: 1, minWidth: 0, height: 18 }} />;
  const max = Math.max(...real);
  const min = Math.min(...real, 0);
  const span = max - min || 1;
  // Newest last, and only as many bars as there are points.
  return (
    <span
      data-testid="bench-spark"
      data-points={real.length}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 1.5,
        height: 18,
        flex: 1,
        minWidth: 0,
        justifyContent: "flex-end",
        overflow: "hidden",
      }}
    >
      {values.map((v, i) => (
        <i
          key={i}
          data-testid="bench-spark-bar"
          style={{
            width: 3,
            flex: "0 0 3px",
            borderRadius: 1.5,
            // A flat series (server errors at 0) draws a visible floor
            // rather than nothing, without implying a slope.
            height: `${v === null ? 0 : Math.max(8, ((v - min) / span) * 100)}%`,
            background:
              "linear-gradient(180deg, var(--accent-primary), var(--accent-tint-15))",
            opacity: 0.8,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Tokens per second for one sample. `completion_tokens` is the sum over the
 * sample's attempts and `gen_seconds` is the matching generation time, so the
 * two divide cleanly — unlike `total_tokens`, which is a single request.
 */
function genRate(r: BenchRecord): number | null {
  if (r.gen_seconds <= 0) return null;
  return r.completion_tokens / r.gen_seconds;
}

function FooterStat({
  label,
  value,
  data,
}: {
  label: string;
  value: string;
  data: Array<number | null>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderRight: "1px solid var(--border-light)",
        minWidth: 0,
      }}
    >
      <span
        style={{
          font: "600 9px Inter, system-ui, sans-serif",
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{ font: `700 13px ${MONO}`, whiteSpace: "nowrap" }}
        data-testid={`bench-footer-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      >
        {value}
      </span>
      <BarSpark values={data} />
    </div>
  );
}

export function BenchFooter({
  detail,
  elapsedSeconds,
  running,
}: {
  detail: BenchRunDetail | null;
  /**
   * The page's single elapsed clock, shared with the hero and Progress. Not
   * recomputed here: two clocks that can disagree is worse than one shown
   * twice.
   */
  elapsedSeconds: number | null;
  running: boolean;
}) {
  const records = detail?.records ?? [];
  const graded = gradedRecords(records);
  // Nothing running and nothing selected means there is nothing to report.
  // Carrying the last run's figures here would be the stale-Progress bug in
  // a new location.
  const idle = !running && records.length === 0;

  const rates = graded.map(genRate);
  const meanRate =
    rates.filter((r): r is number => r !== null).length > 0
      ? rates
          .filter((r): r is number => r !== null)
          .reduce((a, b) => a + b, 0) /
        rates.filter((r): r is number => r !== null).length
      : null;

  // Cumulative pass rate, so the line shows how the run trended rather than
  // repeating the headline figure.
  const passSeries = cumulative(graded.map((r) => (r.solved ? 1 : 0))).map(
    (solvedSoFar, i) => (solvedSoFar / (i + 1)) * 100,
  );
  const passRate =
    graded.length > 0
      ? (graded.filter((r) => r.solved).length / graded.length) * 100
      : null;

  const elapsedSeries = cumulative(records.map((r) => r.seconds));
  const serverSeries = cumulative(
    records.map((r) => (r.status === "server" ? 1 : 0)),
  );
  const serverTotal = serverSeries[serverSeries.length - 1] ?? 0;
  const totalSeconds = elapsedSeconds ?? 0;
  const samplesPerHour =
    totalSeconds > 0 ? (records.length / totalSeconds) * 3600 : null;
  // Its OWN series: samples completed per elapsed hour, as it evolved.
  // Previously this reused elapsedSeries, so Samples/hr and Elapsed were
  // mathematically guaranteed to draw the same shape.
  const ratePerHourSeries = elapsedSeries.map((cum, i) =>
    cum > 0 ? ((i + 1) / cum) * 3600 : null,
  );

  return (
    <div
      data-testid="bench-footer"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        borderTop: "1px solid var(--border-light)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      <FooterStat
        label="Gen speed"
        value={
          idle || meanRate === null
            ? "—"
            : `${fmtNum(Math.round(meanRate))} t/s`
        }
        data={idle ? [] : rates}
      />
      <FooterStat
        label="Samples/hr"
        value={
          idle || samplesPerHour === null ? "—" : samplesPerHour.toFixed(1)
        }
        data={idle ? [] : ratePerHourSeries}
      />
      <FooterStat
        label="Pass rate"
        value={idle || passRate === null ? "—" : `${Math.round(passRate)}%`}
        data={idle ? [] : passSeries}
      />
      <FooterStat
        label="Elapsed"
        value={idle && elapsedSeconds === null ? "—" : fmtUptime(totalSeconds)}
        data={idle ? [] : elapsedSeries}
      />
      <FooterStat
        label="Server errors"
        value={idle ? "—" : String(serverTotal)}
        data={idle ? [] : serverSeries}
      />
    </div>
  );
}
