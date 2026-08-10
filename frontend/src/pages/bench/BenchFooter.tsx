/**
 * The footer stat strip: five figures with sparklines, mirroring the
 * llama.cpp hardware footer's role on that page.
 *
 * Every series is derived from the run's own ordered records, so the strip
 * describes the selected run rather than the machine.
 */
import Sparkline from "../../components/shared/Sparkline";
import { fmtUptime } from "../llamaCppUtils";
import { fmtNum } from "../llamacpp/parts";
import { gradedRecords } from "./compute";
import type { BenchRecord, BenchRunDetail } from "./types";
import type { MetricHistoryPoint } from "../../types/metrics";

const MONO = '"JetBrains Mono", "Fira Code", monospace';

/** Running totals, without mutating anything during render. */
function cumulative(values: number[]): number[] {
  return values.reduce<number[]>(
    (acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v],
    [],
  );
}

function series(values: Array<number | null>): MetricHistoryPoint[] {
  return values.map((value, slot) => ({
    slot,
    timestamp: new Date(slot * 1000),
    value,
  }));
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
  data: MetricHistoryPoint[];
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
      <span style={{ flex: 1, minWidth: 0, height: 18 }}>
        <Sparkline data={data} stretch height={18} />
      </span>
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
        data={idle ? [] : series(rates)}
      />
      <FooterStat
        label="Samples/hr"
        value={
          idle || samplesPerHour === null ? "—" : samplesPerHour.toFixed(1)
        }
        data={idle ? [] : series(elapsedSeries)}
      />
      <FooterStat
        label="Pass rate"
        value={idle || passRate === null ? "—" : `${Math.round(passRate)}%`}
        data={idle ? [] : series(passSeries)}
      />
      <FooterStat
        label="Elapsed"
        value={idle && elapsedSeconds === null ? "—" : fmtUptime(totalSeconds)}
        data={idle ? [] : series(elapsedSeries)}
      />
      <FooterStat
        label="Server errors"
        value={idle ? "—" : String(serverTotal)}
        data={idle ? [] : series(serverSeries)}
      />
    </div>
  );
}
