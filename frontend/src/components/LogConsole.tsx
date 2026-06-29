import React, {
  useState,
  useEffect,
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

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: "var(--text-primary)",
  warn: "var(--warning)",
  error: "var(--danger)",
  debug: "var(--text-muted)",
  stats: "var(--accent-primary)",
  unknown: "var(--text-muted)",
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

// ─── Sub-components ──────────────────────────────────────────────────

const LogLineRow = memo(function LogLineRow({
  log,
  wrap,
}: {
  log: LogLine;
  wrap: boolean;
}) {
  const color = LEVEL_COLORS[log.level];
  const isError = log.level === "error";
  const isStderr = log.stream === "stderr";

  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        padding: "1px 8px",
        background: isError
          ? "rgba(var(--danger-rgb, 239,68,68), 0.05)"
          : undefined,
        borderLeft: isError
          ? "2px solid var(--danger)"
          : "2px solid transparent",
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          flexShrink: 0,
          userSelect: "none",
          fontFamily: "monospace",
          paddingTop: 1,
          minWidth: 60,
        }}
      >
        {formatTimestamp(log.timestamp)}
      </span>
      {isStderr && (
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: "var(--danger)",
            background: "rgba(var(--danger-rgb, 239,68,68), 0.15)",
            borderRadius: 2,
            padding: "0 3px",
            flexShrink: 0,
            lineHeight: "16px",
          }}
        >
          E
        </span>
      )}
      <span
        style={{
          flex: 1,
          color,
          fontFamily: "monospace",
          fontSize: 10,
          lineHeight: 1.5,
          minWidth: 0,
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-all" : undefined,
          overflowX: wrap ? undefined : "visible",
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

export function LogConsole() {
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

  // Auto-scroll to bottom when new lines arrive (unless paused or user scrolled up).
  useEffect(() => {
    if (!paused && isAtBottomRef.current && logEndRef.current) {
      logEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [logs, paused]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < 80;
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

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (!filters[log.level]) return false;
        if (search && !log.text.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      }),
    [logs, filters, search],
  );

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
              color={LEVEL_COLORS[level]}
              onClick={() => toggleFilter(level)}
            />
          ))}
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
          filteredLogs.map((log, idx) => (
            <LogLineRow key={idx} log={log} wrap={wrap} />
          ))
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
