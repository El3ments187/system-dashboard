/**
 * bench.py's stdout, as the fifth Tasks & Runs tab.
 *
 * Deliberately NOT `LogConsole`: that component has no lines/source prop —
 * it discovers its source by polling /api/launch/profiles and opens a
 * llama-specific WebSocket — and rewiring its llama plumbing is out of
 * scope. This reads the bench offset API instead.
 *
 * It stays MOUNTED while another tab is showing: the log is a background
 * process's output, not view-scoped, so hiding the pane must not stop the
 * stream, reset the level filters, or lose the scroll position.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { classifyBenchLine, type BenchLogLevel } from "./compute";
import { MONO } from "./parts";

const LEVELS: BenchLogLevel[] = ["info", "warn", "error"];

const LEVEL_COLOR: Record<BenchLogLevel, string> = {
  info: "var(--text-secondary)",
  warn: "var(--warning)",
  error: "var(--danger)",
};

export function BenchConsole({
  running,
  active,
  outputFolder,
}: {
  running: boolean;
  /** Whether the Console tab is the one on screen. */
  active: boolean;
  /**
   * The run folder bench.py is writing to. It lives here rather than in the
   * hero because the folder and the stdout of the process filling it are
   * one subject — anyone reading the log has the path to open right there.
   */
  outputFolder: string;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<BenchLogLevel, boolean>>({
    info: true,
    warn: true,
    error: true,
  });
  const [query, setQuery] = useState("");
  const offsetRef = useRef(0);
  const areaRef = useRef<HTMLDivElement | null>(null);
  // Scroll survives the hide/show: display:none can drop scrollTop, so it is
  // captured on the way out and restored on the way back in.
  const savedScrollRef = useRef<number | null>(null);
  const followRef = useRef(true);

  // Polls regardless of `active` — a background process keeps producing
  // output whether or not anyone is looking at this tab.
  // When running becomes true a new run has started: clear the old output
  // and reset the offset so the new run's lines are fetched from the start.
  // When not running: one fetch to collect any tail output, then stop.
  useEffect(() => {
    let cancelled = false;
    let freshStart = running;
    const tick = async () => {
      if (freshStart) {
        freshStart = false;
        offsetRef.current = 0;
        followRef.current = true;
        if (!cancelled) setLines([]);
      }
      try {
        const res = await fetch(`/api/bench/log?offset=${offsetRef.current}`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          lines?: string[];
          nextOffset?: number;
        };
        if (cancelled) return;
        // Always advance the offset when the server provides one — including
        // empty responses, which signal a log-clear (new run start).
        if (body.nextOffset !== undefined) {
          offsetRef.current = body.nextOffset;
        }
        if (body.lines && body.lines.length > 0) {
          setLines((prev) => [...prev, ...(body.lines ?? [])].slice(-2000));
        }
      } catch {
        // A console gap must not take the page down.
      }
    };
    void tick();
    if (!running) {
      // Single fetch is enough once idle — the log won't change.
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(() => {
      if (!document.hidden) void tick();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running]);

  // Save on hide, restore on show.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    if (active) {
      if (savedScrollRef.current !== null)
        el.scrollTop = savedScrollRef.current;
    } else {
      savedScrollRef.current = el.scrollTop;
    }
  }, [active]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines
      .map((l): [BenchLogLevel, string] => [classifyBenchLine(l), l])
      .filter(([level, l]) => {
        if (!filters[level]) return false;
        return !q || l.toLowerCase().includes(q);
      });
  }, [lines, filters, query]);

  // Follow the tail unless the reader has scrolled away from it.
  useEffect(() => {
    const el = areaRef.current;
    if (!el || !active || !followRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visible, active]);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px 6px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            font: "11px Inter, system-ui, sans-serif",
            color: "var(--text-muted)",
          }}
        >
          bench.py output
          {outputFolder && (
            <span data-testid="bench-console-output" style={{ opacity: 0.85 }}>
              {" · "}
              <span style={{ fontFamily: MONO }}>runs/{outputFolder}</span>
            </span>
          )}
        </span>
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            aria-pressed={filters[lvl]}
            data-testid={`bench-log-level-${lvl}`}
            onClick={() => setFilters((f) => ({ ...f, [lvl]: !f[lvl] }))}
            style={{
              background: filters[lvl] ? "var(--bg-secondary)" : "none",
              font: `600 9px ${MONO}`,
              letterSpacing: "0.5px",
              border: `1px solid ${filters[lvl] ? "var(--border-light)" : "transparent"}`,
              borderRadius: 4,
              padding: "2px 7px",
              color: filters[lvl] ? LEVEL_COLOR[lvl] : "var(--text-muted)",
              opacity: filters[lvl] ? 1 : 0.5,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {lvl}
          </button>
        ))}
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            marginLeft: "auto",
          }}
        >
          <Search
            size={12}
            style={{
              position: "absolute",
              left: 7,
              top: 6,
              color: "var(--text-muted)",
            }}
          />
          <input
            id="bench-search-logs"
            name="bench-search-logs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs…"
            aria-label="Search bench logs"
            data-testid="bench-log-search"
            style={{
              font: `11px ${MONO}`,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              padding: "4px 9px 4px 24px",
              width: 150,
            }}
          />
        </span>
      </div>
      <div
        ref={areaRef}
        data-testid="bench-console"
        onScroll={(e) => {
          const el = e.currentTarget;
          followRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        style={{
          background: "color-mix(in srgb, var(--bg-secondary) 70%, black)",
          font: `11px/1.6 ${MONO}`,
          padding: "10px 14px",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          color: "var(--text-secondary)",
        }}
      >
        {visible.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>
            {lines.length === 0
              ? "bench.py output appears here while a run is active."
              : "No lines match the current filters."}
          </div>
        ) : (
          visible.map(([level, l], i) => (
            <div key={i} style={{ color: LEVEL_COLOR[level] }}>
              {l}
            </div>
          ))
        )}
      </div>
    </>
  );
}
