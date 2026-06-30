import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import {
  Pause,
  Play,
  Trash2,
  Copy,
  Download,
  WrapText,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  LogLine,
  LogLevel,
  LaunchProfile,
  ProfileState,
} from "../types/metrics";

// ─── Types ───────────────────────────────────────────────────────────

type LogFilter = Record<LogLevel, boolean>;
type ConsoleStatus = "live" | "exited" | "disconnected" | "no_logs";

interface WsMessage {
  type: "history" | "log" | "exited";
  lines?: LogLine[];
  exited?: boolean;
  line?: LogLine;
}

// ─── Constants ───────────────────────────────────────────────────────

const WS_BASE =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:3001";

const LEVEL_BADGE_COLORS: Record<LogLevel, string> = {
  info: "var(--accent-primary)",
  warn: "var(--warning)",
  error: "var(--danger)",
  debug: "var(--text-muted)",
  stats: "var(--success)",
  unknown: "var(--text-muted)",
};

const LEVEL_TEXT_COLORS: Record<LogLevel, string> = {
  info: "var(--text-primary)",
  warn: "var(--warning)",
  error: "var(--danger)",
  debug: "var(--text-muted)",
  stats: "var(--success)",
  unknown: "var(--text-muted)",
};

const LEVEL_LETTERS: Record<LogLevel, string> = {
  info: "I",
  warn: "W",
  error: "E",
  debug: "D",
  stats: "S",
  unknown: "?",
};

const DEFAULT_FILTERS: LogFilter = {
  info: true,
  warn: true,
  error: true,
  debug: true,
  stats: true,
  unknown: true,
};

const FILTER_LEVELS: LogLevel[] = ["info", "warn", "error", "debug", "stats"];

type PresetConfig = { id: string; label: string; keywords: readonly string[] };

const PRESETS: readonly PresetConfig[] = [
  { id: "draft", label: "Draft/Spec", keywords: ["slot", "draft", "specul"] },
  {
    id: "timings",
    label: "Timings",
    keywords: ["t/s", "tokens/s", "timing", "eval", "ms per"],
  },
  {
    id: "cache",
    label: "Cache",
    keywords: ["kv cache", "prefix", "cached", "n_cache"],
  },
  {
    id: "errors",
    label: "Errors",
    keywords: ["error", "failed", "abort", "fatal", "exception"],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function lineMatchesFilters(
  text: string,
  presets: Set<string>,
  query: string,
): boolean {
  const lower = text.toLowerCase();
  for (const pid of presets) {
    const p = PRESETS.find((x) => x.id === pid);
    if (p && !p.keywords.some((kw) => lower.includes(kw))) return false;
  }
  return !query || lower.includes(query.toLowerCase());
}

// ─── Sub-components ──────────────────────────────────────────────────

const LogLineRow = memo(function LogLineRow({
  log,
  wrap,
  onCopy,
  highlighted,
}: {
  log: LogLine;
  wrap: boolean;
  onCopy?: (text: string) => void;
  highlighted?: boolean;
}) {
  const badgeColor = LEVEL_BADGE_COLORS[log.level];
  const textColor = LEVEL_TEXT_COLORS[log.level];
  const isError = log.level === "error";
  const letter = LEVEL_LETTERS[log.level];

  let rowBg: string | undefined;
  if (isError) {
    rowBg = "rgba(var(--danger-rgb, 239,68,68), 0.05)";
  } else if (highlighted) {
    rowBg = "rgba(var(--warning-rgb, 234,179,8), 0.07)";
  }

  let rowBorder = "2px solid transparent";
  if (isError) {
    rowBorder = "2px solid var(--danger)";
  } else if (highlighted) {
    rowBorder = "2px solid var(--warning)";
  }

  return (
    <div
      data-highlighted={highlighted ? "true" : undefined}
      onClick={() => onCopy?.(log.text)}
      style={{
        display: "flex",
        gap: 5,
        padding: "1px 8px",
        background: rowBg,
        borderLeft: rowBorder,
        alignItems: "flex-start",
        cursor: onCopy ? "pointer" : undefined,
        minWidth: 0,
      }}
      title={onCopy ? "Click to copy line" : undefined}
    >
      <span
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          flexShrink: 0,
          userSelect: "none",
          fontFamily: "monospace",
          paddingTop: 1,
          minWidth: 66,
          opacity: 0.7,
        }}
      >
        {formatTimestamp(log.timestamp)}
      </span>
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          color: badgeColor,
          background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`,
          borderRadius: 2,
          padding: "0 3px",
          flexShrink: 0,
          lineHeight: "17px",
          userSelect: "none",
          minWidth: 12,
          textAlign: "center",
        }}
      >
        {letter}
      </span>
      <span
        style={{
          flex: 1,
          color: textColor,
          fontFamily: "monospace",
          fontSize: 10,
          lineHeight: 1.5,
          minWidth: 0,
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-all" : undefined,
        }}
      >
        {log.text}
      </span>
    </div>
  );
});

function ToolbarBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: "2px 6px",
        background: active ? "var(--accent-primary)" : "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        borderRadius: 3,
        color: active ? "#fff" : "var(--text-primary)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        lineHeight: "16px",
        display: "flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {children}
    </button>
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: 8,
        fontWeight: 700,
        padding: "1px 5px",
        background: active
          ? `color-mix(in srgb, ${color} 15%, transparent)`
          : "var(--bg-secondary)",
        border: `1px solid ${active ? color : "var(--border-color)"}`,
        borderRadius: 2,
        color: active ? color : "var(--text-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        lineHeight: "14px",
      }}
    >
      {label}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function LogConsole({
  expanded,
  onToggleExpand,
}: {
  expanded?: boolean;
  onToggleExpand?: () => void;
} = {}) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [wrap, setWrap] = useState(true);
  const [filters, setFilters] = useState<LogFilter>(DEFAULT_FILTERS);
  const [status, setStatus] = useState<ConsoleStatus>("no_logs");
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(
    null,
  );
  const [hideIdle, setHideIdle] = useState(() => {
    try {
      return localStorage.getItem("log_console_hide_idle") !== "false";
    } catch {
      return true;
    }
  });
  const [activePresets, setActivePresets] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"filter" | "highlight">(
    "filter",
  );
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(
        "log_console_hide_idle",
        hideIdle ? "true" : "false",
      );
    } catch {
      // ignore storage errors
    }
  }, [hideIdle]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(id);
  }, [search]);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const activeProfileIdRef = useRef<string | null>(null);
  const pendingLogsRef = useRef<LogLine[]>([]);
  const rafRef = useRef<number | null>(null);

  // Flush batched log lines on the next animation frame to avoid excessive
  // re-renders while the process is printing many lines rapidly.
  const flushPending = useCallback(() => {
    rafRef.current = null;
    const batch = pendingLogsRef.current.splice(0);
    if (batch.length === 0) return;
    setLogs((prev) => {
      const combined = [...prev, ...batch];
      return combined.length > 5000
        ? combined.slice(combined.length - 5000)
        : combined;
    });
  }, []);

  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 40;
    isAtBottomRef.current = atBottom;
    setIsScrolledUp(!atBottom);
  }, []);

  const connectWs = useCallback(
    (profileId: string) => {
      wsRef.current?.close();
      wsRef.current = null;

      const url = `${WS_BASE}/api/launch/logs/ws?profile_id=${encodeURIComponent(profileId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setStatus("live");

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type === "history") {
            setLogs(msg.lines ?? []);
            if (msg.exited) setStatus("exited");
          } else if (msg.type === "log" && msg.line) {
            pendingLogsRef.current.push(msg.line);
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(flushPending);
            }
          } else if (msg.type === "exited") {
            setStatus("exited");
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === "live" ? "disconnected" : prev));
      };

      ws.onerror = () => setStatus("disconnected");
    },
    [flushPending],
  );

  // Poll for the active (running/loading/starting) profile every 3 s and
  // reconnect the WebSocket whenever it changes.
  useEffect(() => {
    let cancelled = false;

    const checkActive = async () => {
      try {
        const res = await fetch("/api/launch/profiles");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          data?: {
            profiles?: LaunchProfile[];
            states?: Record<string, ProfileState>;
          };
        };
        const profiles = json.data?.profiles ?? [];
        const states = json.data?.states ?? {};

        const active = profiles.find((p) => {
          const s = states[p.script_path]?.status;
          return s === "running" || s === "loading" || s === "starting";
        });

        const newId = active?.id ?? null;
        if (newId !== activeProfileIdRef.current) {
          activeProfileIdRef.current = newId;
          setActiveProfileId(newId);
          setActiveProfileName(active?.name ?? null);
          if (newId) {
            connectWs(newId);
          } else {
            wsRef.current?.close();
            wsRef.current = null;
            setStatus("no_logs");
            setLogs([]);
          }
        }
      } catch {
        // network errors ignored — next poll will retry
      }
    };

    checkActive();
    const interval = setInterval(checkActive, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      wsRef.current?.close();
      wsRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [connectWs]);

  const handleClear = useCallback(async () => {
    if (activeProfileId) {
      try {
        await fetch(
          `/api/launch/logs?profile_id=${encodeURIComponent(activeProfileId)}`,
          { method: "DELETE" },
        );
      } catch {
        // ignore
      }
    }
    setLogs([]);
  }, [activeProfileId]);

  const levelFilteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (!filters[log.level]) return false;
        if (
          hideIdle &&
          /update_slots:\s*all\s+slots?\s+are\s+idle/i.test(log.text)
        )
          return false;
        return true;
      }),
    [logs, filters, hideIdle],
  );

  const hasActiveSecondaryFilters =
    activePresets.size > 0 || debouncedSearch.length > 0;

  const filteredLogs = useMemo(() => {
    if (!hasActiveSecondaryFilters || filterMode === "highlight")
      return levelFilteredLogs;
    return levelFilteredLogs.filter((log) =>
      lineMatchesFilters(log.text, activePresets, debouncedSearch),
    );
  }, [
    levelFilteredLogs,
    activePresets,
    debouncedSearch,
    filterMode,
    hasActiveSecondaryFilters,
  ]);

  const highlightSet = useMemo((): Set<number> | null => {
    if (filterMode !== "highlight" || !hasActiveSecondaryFilters) return null;
    const s = new Set<number>();
    filteredLogs.forEach((log, i) => {
      if (lineMatchesFilters(log.text, activePresets, debouncedSearch))
        s.add(i);
    });
    return s;
  }, [
    filterMode,
    filteredLogs,
    activePresets,
    debouncedSearch,
    hasActiveSecondaryFilters,
  ]);

  // Auto-scroll after DOM update when pinned to bottom. Uses filteredLogs so
  // toggling hide-idle or wrap also re-anchors when the user is at the bottom.
  useLayoutEffect(() => {
    if (!paused && isAtBottomRef.current && logEndRef.current) {
      logEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [filteredLogs, paused]);

  const handleCopy = useCallback(() => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.text}`)
      .join("\n");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }, [filteredLogs]);

  const handleDownload = useCallback(() => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.stream.toUpperCase()}] [${l.level.toUpperCase()}] ${l.text}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `llama-console-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  const toggleFilter = useCallback((level: LogLevel) => {
    setFilters((prev) => ({ ...prev, [level]: !prev[level] }));
  }, []);

  const handleCopyLine = useCallback((text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }, []);

  const statusLabel: Record<ConsoleStatus, string> = {
    live: "● Live",
    exited: "● Process Exited",
    disconnected: "● Disconnected",
    no_logs: "○ No Logs",
  };

  const statusColor: Record<ConsoleStatus, string> = {
    live: "var(--success)",
    exited: "var(--text-muted)",
    disconnected: "var(--danger)",
    no_logs: "var(--text-muted)",
  };

  const hasNoLogs = logs.length === 0;
  const hasNoMatches = logs.length > 0 && filteredLogs.length === 0;

  return (
    <div
      data-testid="log-console"
      style={{
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        height: "100%",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: "1px solid var(--border-color)",
          minHeight: 36,
          flexShrink: 0,
          gap: 8,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
            }}
          >
            LLAMA.CPP Console
          </span>
          <span
            data-testid="console-status"
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: statusColor[status],
              whiteSpace: "nowrap",
            }}
          >
            {statusLabel[status]}
          </span>
          {activeProfileName && (
            <span
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 120,
              }}
              title={activeProfileName}
            >
              {activeProfileName}
            </span>
          )}
        </div>
        {/* Toolbar */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          <ToolbarBtn
            active={paused}
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
          >
            {paused ? (
              <>
                <Play size={9} /> Resume
              </>
            ) : (
              <>
                <Pause size={9} /> Pause
              </>
            )}
          </ToolbarBtn>
          <ToolbarBtn onClick={handleClear} title="Clear logs">
            <Trash2 size={9} /> Clear
          </ToolbarBtn>
          <ToolbarBtn
            onClick={handleCopy}
            title="Copy visible logs to clipboard"
          >
            <Copy size={9} /> Copy
          </ToolbarBtn>
          <ToolbarBtn onClick={handleDownload} title="Download logs as .txt">
            <Download size={9} /> Save
          </ToolbarBtn>
          <ToolbarBtn
            active={wrap}
            onClick={() => setWrap((w) => !w)}
            title={wrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText size={9} /> Wrap
          </ToolbarBtn>
          <ToolbarBtn
            active={hideIdle}
            onClick={() => setHideIdle((h) => !h)}
            title={hideIdle ? "Show idle lines" : "Hide idle lines"}
          >
            Hide Idle
          </ToolbarBtn>
          {onToggleExpand && (
            <ToolbarBtn
              onClick={onToggleExpand}
              title={expanded ? "Collapse console" : "Expand console"}
            >
              {expanded ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
            </ToolbarBtn>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-tertiary)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            flex: "0 0 auto",
          }}
        >
          <Search
            size={10}
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          />
          <input
            type="search"
            name="log-search"
            id="log-console-search"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search logs"
            style={{
              width: 130,
              fontSize: 10,
              padding: "2px 6px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 3,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {FILTER_LEVELS.map((level) => (
            <FilterChip
              key={level}
              label={level.toUpperCase()}
              active={filters[level]}
              color={LEVEL_BADGE_COLORS[level]}
              onClick={() => toggleFilter(level)}
            />
          ))}
        </div>
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "var(--border-color)",
            flexShrink: 0,
            opacity: 0.6,
          }}
        />
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {PRESETS.map((preset) => (
            <FilterChip
              key={preset.id}
              label={preset.label}
              active={activePresets.has(preset.id)}
              color="var(--accent-primary)"
              onClick={() => {
                setActivePresets((prev) => {
                  const next = new Set(prev);
                  if (next.has(preset.id)) next.delete(preset.id);
                  else next.add(preset.id);
                  return next;
                });
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <ToolbarBtn
            active={filterMode === "filter"}
            onClick={() => setFilterMode("filter")}
            title="Filter: only show matching lines"
          >
            Filter
          </ToolbarBtn>
          <ToolbarBtn
            active={filterMode === "highlight"}
            onClick={() => setFilterMode("highlight")}
            title="Highlight: show all lines, emphasize matches"
          >
            Highlight
          </ToolbarBtn>
        </div>
      </div>

      {/* Log Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="log-area"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: wrap ? "hidden" : "auto",
          background: "var(--bg-secondary)",
          padding: "2px 0",
          minWidth: 0,
        }}
      >
        {hasNoLogs || hasNoMatches ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 80,
              color: "var(--text-muted)",
              gap: 4,
              padding: 16,
              textAlign: "center",
            }}
          >
            {hasNoMatches ? (
              <span style={{ fontSize: 11 }}>No matching log lines.</span>
            ) : (
              <>
                <span style={{ fontSize: 11 }}>No logs available.</span>
                {status === "no_logs" && (
                  <span style={{ fontSize: 10 }}>
                    Start a model to view llama.cpp output.
                  </span>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={wrap ? undefined : { minWidth: "max-content" }}>
            {filteredLogs.map((log, idx) => (
              <LogLineRow
                key={idx}
                log={log}
                wrap={wrap}
                onCopy={handleCopyLine}
                highlighted={highlightSet?.has(idx)}
              />
            ))}
          </div>
        )}
        {isScrolledUp && !paused && (
          <div
            style={{
              position: "sticky",
              bottom: 8,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <button
              onClick={() => {
                isAtBottomRef.current = true;
                setIsScrolledUp(false);
                logEndRef.current?.scrollIntoView({ block: "end" });
              }}
              style={{
                pointerEvents: "auto",
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                opacity: 0.9,
              }}
            >
              <ChevronDown size={10} />
              Jump to latest
            </button>
          </div>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export default LogConsole;
