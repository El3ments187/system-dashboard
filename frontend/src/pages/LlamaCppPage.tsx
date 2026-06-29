import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { useMetricsContext } from "../context/MetricsContext";
import LogConsole from "../components/LogConsole";
import Sparkline from "../components/shared/Sparkline";
import UpdateOutputModal from "../components/UpdateOutputModal";
import { useLlamaCppManagement } from "../hooks/useLlamaCppManagement";
import {
  Cpu,
  MemoryStick,
  Thermometer,
  RefreshCw,
  Play,
  Square,
  FolderOpen,
  AlertCircle,
  Terminal as TermIcon,
  ExternalLink,
  Loader2,
  Activity,
  Globe,
  Eye,
  AudioLines,
  Video as VideoIcon,
  BookOpen,
  Server,
  Package,
  Brain,
  Gauge,
  Database,
  Clock3,
  Fingerprint,
  Zap,
  Tag,
  Layers,
  MonitorCog,
  SlidersHorizontal,
  RotateCcw,
  Send,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GitBranch,
} from "lucide-react";
import type {
  ProfileResponse,
  LaunchProfile,
  ProfileState,
  ProfileMetadata,
  MetricHistoryPoint,
  ParsedScriptArgs,
  GpuOffloadInfo,
} from "../types/metrics";
import {
  sortProfiles,
  type SortConfig,
  type SortColumn,
} from "../utils/sorting";

// ─── Constants ────────────────────────────────────────────────────────────────

import {
  formatCtx,
  formatGB,
  formatTps,
  specLabel,
  fmtUptime,
  fmtKb,
  calcBuildsBehind,
} from "./llamaCppUtils";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fmtNum(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString();
}

function getCtxColor(pct: number | null): string {
  if (pct != null && pct > 90) return "var(--danger)";
  if (pct != null && pct > 70) return "var(--warning)";
  return "var(--accent-primary)";
}

function thresholdClass(pct: number | null | undefined): string {
  if (pct == null) return "";
  if (pct >= 85) return "progress-bar-critical";
  if (pct >= 70) return "progress-bar-warning";
  return "progress-bar-normal";
}

function thresholdColor(pct: number | null | undefined): string {
  if (pct == null) return "var(--accent-primary)";
  if (pct >= 85) return "var(--danger)";
  if (pct >= 70) return "var(--warning)";
  return "var(--accent-primary)";
}

function updateStateColor(state: string): string {
  if (state === "error") return "var(--danger)";
  if (state === "done") return "var(--success)";
  return "var(--accent-primary)";
}

// ─── Model name quant splitter ────────────────────────────────────────────────

const QUANT_RE = /(?:^|[-_.])(I?Q\d[A-Z0-9_]*|B?F\d+|qat|fp\d+)$/i;

function splitModelName(name: string): { head: string; quant: string } {
  const m = name.match(QUANT_RE);
  if (!m) return { head: name, quant: "" };
  const i = name.length - m[1].length;
  return { head: name.slice(0, i), quant: name.slice(i) };
}

function boolLabel(val: boolean | null | undefined): string {
  if (val == null) return "\u2014";
  return val ? "Yes" : "No";
}

function updateStateText(state: string): string {
  if (state === "running") return "Updating\u2026";
  if (state === "done") return "Update complete";
  return "Update failed";
}

function middleTruncate(s: string, max = 46): string {
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return s.slice(0, head) + "\u2026" + s.slice(s.length - tail);
}

function useFitText(
  value: string,
  maxPx = 26,
  minPx = 13,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = maxPx;
      el.style.fontSize = size + "px";
      el.style.whiteSpace = "nowrap";
      while (el.scrollWidth > el.clientWidth && size > minPx) {
        size -= 0.5;
        el.style.fontSize = size + "px";
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, maxPx, minPx]);
  return ref;
}

// ─── Card layout primitives ───────────────────────────────────────────────────

// Spine uses var(--accent-fill) + var(--accent-fill-size) so animated accent
// modes (rainbow-wave, animated-gradient, spectrum) work on the spine bar.
const SPINE_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 3,
  background: "var(--accent-fill)",
  backgroundSize: "var(--accent-fill-size, 200% 200%)",
  zIndex: 2,
  pointerEvents: "none",
  flexShrink: 0,
};

function PanelCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="card-accent-spine"
      style={{
        background: `linear-gradient(90deg, var(--accent-tint-10), transparent 200px), var(--bg-card)`,
        border: "1px solid var(--border-light, var(--border-color))",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      <span className="accent-spine" style={SPINE_STYLE} />
      {children}
    </div>
  );
}

function PanelHead({
  icon,
  title,
  right,
}: {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 15px",
        borderBottom: "1px solid var(--border-light, var(--border-color))",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "1.1px",
        }}
      >
        {icon && (
          <span
            style={{
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {icon}
          </span>
        )}
        {title}
      </div>
      {right}
    </div>
  );
}

// ─── StatusIndicator ──────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: string }) {
  let color: string;
  let bg: string;
  let label: string;
  switch (status) {
    case "running":
      color = "var(--success)";
      bg = "rgba(34,197,94,0.12)";
      label = "Running";
      break;
    case "starting":
      color = "var(--warning)";
      bg = "rgba(234,179,8,0.12)";
      label = "Starting";
      break;
    case "loading":
      color = "var(--accent-primary)";
      bg = "rgba(59,130,246,0.12)";
      label = "Loading";
      break;
    case "failed":
      color = "var(--danger)";
      bg = "rgba(239,68,68,0.12)";
      label = "Failed";
      break;
    default:
      color = "var(--text-muted)";
      bg = "rgba(255,255,255,0.06)";
      label = "Stopped";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: bg,
        borderRadius: 6,
        padding: "2px 6px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation:
            status === "running"
              ? "dot-pulse 1.8s ease-in-out infinite"
              : undefined,
        }}
      />
      {label}
    </span>
  );
}

// ─── FooterStat ───────────────────────────────────────────────────────────────

function FooterStat({
  icon,
  label,
  value,
  color,
  history,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  history?: MetricHistoryPoint[];
}) {
  return (
    <div
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
          minWidth: 0,
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
          <Sparkline data={history} color={color} width={160} height={32} />
        </div>
      )}
    </div>
  );
}

// ─── CapPill ──────────────────────────────────────────────────────────────────

function CapPill({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled?: boolean | null;
}) {
  const on = !!enabled;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 12px",
        borderRadius: 999,
        background: on
          ? "rgba(var(--success-rgb, 34,197,94),0.1)"
          : "var(--bg-secondary)",
        border: `1px solid ${on ? "rgba(var(--success-rgb, 34,197,94),0.3)" : "var(--border-color)"}`,
        color: on ? "var(--success)" : "var(--text-muted)",
        fontSize: 12,
        fontWeight: 600,
        boxShadow: on ? "0 0 8px rgba(34,197,94,0.15)" : "none",
      }}
    >
      <span
        style={{ display: "flex", alignItems: "center", width: 13, height: 13 }}
      >
        {icon}
      </span>
      {label}
    </div>
  );
}



// ─── InfoCell ─────────────────────────────────────────────────────────────────

function InfoCell({
  label,
  value,
  accent,
  success,
}: {
  label: string;
  value: string;
  important?: boolean;
  accent?: boolean;
  success?: boolean;
}) {
  let valueColor: string;
  if (accent) {
    valueColor = "var(--accent-primary)";
  } else if (success) {
    valueColor = "var(--success)";
  } else {
    valueColor = "var(--text-primary)";
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 500,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: valueColor,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── RadialGauge ──────────────────────────────────────────────────────────────

function RadialGauge({
  pct,
  color,
  size = 110,
  children,
}: {
  pct: number | null;
  color?: string;
  size?: number;
  children?: React.ReactNode;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startDeg = 135;
  const totalDeg = 270;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number) => {
    const a = toRad(startDeg + deg);
    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  };
  const pctClamped = Math.min(100, Math.max(0, pct ?? 0));
  const progressDeg = (pctClamped / 100) * totalDeg;
  const trackPath = `M ${pt(0)} A ${r} ${r} 0 1 1 ${pt(totalDeg)}`;
  const progPath =
    progressDeg > 0
      ? `M ${pt(0)} A ${r} ${r} 0 ${progressDeg > 180 ? 1 : 0} 1 ${pt(progressDeg)}`
      : "";
  const gaugeColor = color ?? "var(--accent-primary)";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
      >
        <path
          d={trackPath}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {progPath && (
          <path
            d={progPath}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
      </svg>
      {children && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─── MiniRing ─────────────────────────────────────────────────────────────────

function MiniRing({
  pct,
  color,
  size = 42,
  label,
  value,
}: {
  pct: number | null;
  color?: string;
  size?: number;
  label: string;
  value: string;
}) {
  const stroke = 3.5;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct != null ? Math.min(1, pct / 100) * circ : 0;
  const ringColor = color ?? "var(--accent-primary)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 56,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ display: "block", transform: "rotate(-90deg)" }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--bg-secondary)"
            strokeWidth={stroke}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            color: ringColor,
          }}
        >
          {pct != null ? `${Math.round(pct)}` : "\u2014"}
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-muted)",
          textAlign: "center",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          color: ringColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── RunModelsSection (export, preserved) ─────────────────────────────────────

const SORTABLE_COLUMNS: SortColumn[] = [
  "status",
  "model",
  "params",
  "quant",
  "ctx",
  "vram",
  "ram",
  "spec",
  "tps",
];

function cycleSortDirection(
  current: SortConfig["direction"],
): SortConfig["direction"] {
  if (current === "none" || current === "desc") return "asc";
  if (current === "asc") return "desc";
  return "none";
}

export function RunModelsSection() {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [states, setStates] = useState<Record<string, ProfileState>>({});
  const [metadata, setMetadata] = useState<Record<string, ProfileMetadata>>({});
  const [scanDir, setScanDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: "none",
  });
  const originalOrderRef = useRef<string[]>([]);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/launch/profiles");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: ProfileResponse = (await res.json()).data;
      setProfiles(data.profiles);
      setStates(data.states);
      setScanDir(data.scan_dir);
      setMetadata(data.metadata || {});
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[RunModels] Failed to load profiles:", e);
      setError("Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadProfiles, 0);
    return () => clearTimeout(t);
  }, [loadProfiles]);

  useEffect(() => {
    if (profiles.length > 0 && originalOrderRef.current.length === 0) {
      originalOrderRef.current = profiles.map((p) => p.id);
    }
  }, [profiles]);

  const handleSort = useCallback((column: SortColumn) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        const nextDir = cycleSortDirection(prev.direction);
        return {
          column: nextDir === "none" ? null : column,
          direction: nextDir,
        };
      }
      return { column, direction: "asc" };
    });
  }, []);

  const getSortedProfiles = useCallback((): LaunchProfile[] => {
    if (sortConfig.column === null || sortConfig.direction === "none") {
      return profiles;
    }
    return sortProfiles(profiles, states, metadata, sortConfig);
  }, [profiles, states, metadata, sortConfig]);

  useEffect(() => {
    const hasActive = Object.values(states).some(
      (s) =>
        s.status === "running" ||
        s.status === "starting" ||
        s.status === "loading",
    );
    const ms = hasActive ? 1000 : 15000;
    const timer = setInterval(loadProfiles, ms);
    return () => clearInterval(timer);
  }, [loadProfiles, states]);

  const handleLaunchWithRetry = useCallback(
    async (profileId: string, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch("/api/launch/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId }),
          });
          if (!res.ok) throw new Error(`API error ${res.status}`);
          await loadProfiles();
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[RunModels] Launch attempt ${attempt} failed:`, e);
          setError(`Launch failed (attempt ${attempt}/${retries})`);
          if (attempt < retries) {
            await new Promise((r) => {
              retryTimeoutRef.current = setTimeout(r, 1000 * attempt);
            });
          }
        }
      }
      await loadProfiles();
    },
    [loadProfiles],
  );

  const handleStopWithRetry = useCallback(
    async (profileId: string, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch("/api/launch/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId }),
          });
          if (!res.ok) throw new Error(`API error ${res.status}`);
          await loadProfiles();
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[RunModels] Stop attempt ${attempt} failed:`, e);
          setError(`Stop failed (attempt ${attempt}/${retries})`);
          if (attempt < retries) {
            await new Promise((r) => {
              retryTimeoutRef.current = setTimeout(r, 1000 * attempt);
            });
          }
        }
      }
      await loadProfiles();
    },
    [loadProfiles],
  );

  const getProfileStatus = (profile: LaunchProfile): string =>
    states[profile.script_path]?.status || "stopped";

  const isRunning = (profile: LaunchProfile): boolean =>
    getProfileStatus(profile) === "running";

  const isActive = (profile: LaunchProfile): boolean => {
    const status = getProfileStatus(profile);
    return (
      status === "running" || status === "starting" || status === "loading"
    );
  };

  const formatLastRunDate = (dateStr?: string | null): string => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const COL_GRID =
    "24px 90px minmax(210px, 1fr) 70px 90px 70px 80px 80px 80px 70px 90px";

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
          minHeight: 36,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Run Models
          </span>
          {scanDir && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                borderRadius: 6,
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
              }}
            >
              <FolderOpen
                size={10}
                style={{ color: "var(--accent-primary)" }}
              />
              <span
                style={{
                  fontSize: 9,
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 200,
                }}
                title={scanDir}
              >
                {scanDir}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={loadProfiles}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 600,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            color: "var(--text-primary)",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={10} className={loading ? "spin" : undefined} />
          Refresh
        </button>
      </div>

      {/* Column Headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COL_GRID,
          gap: 0,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-card)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          #
        </span>
        {SORTABLE_COLUMNS.map((col) => {
          const isActiveSort = sortConfig.column === col;
          let ariaValue: "ascending" | "descending" | "none";
          if (isActiveSort) {
            ariaValue =
              sortConfig.direction === "asc" ? "ascending" : "descending";
          } else {
            ariaValue = "none";
          }
          const LABELS: Record<SortColumn, string> = {
            status: "STATUS",
            model: "MODEL",
            params: "PARAMS",
            quant: "QUANT",
            ctx: "CTX",
            vram: "VRAM",
            ram: "RAM",
            spec: "SPEC",
            tps: "TPS",
          };
          const label = LABELS[col];
          const align = col === "status" || col === "model" ? "left" : "center";
          return (
            <button
              key={col}
              onClick={() => handleSort(col)}
              tabIndex={0}
              aria-sort={ariaValue}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontSize: 10,
                fontWeight: 600,
                color: isActiveSort
                  ? "var(--accent-primary)"
                  : "var(--text-muted)",
                textTransform: "uppercase",
                textAlign: align,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isActiveSort
                  ? "var(--accent-primary)"
                  : "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isActiveSort
                  ? "var(--accent-primary)"
                  : "var(--text-muted)";
              }}
            >
              {label}
              {isActiveSort && sortConfig.direction === "asc" && (
                <ArrowUp size={9} style={{ marginLeft: 2, flexShrink: 0 }} />
              )}
              {isActiveSort && sortConfig.direction === "desc" && (
                <ArrowDown size={9} style={{ marginLeft: 2, flexShrink: 0 }} />
              )}
              {!isActiveSort && (
                <ArrowUpDown
                  size={9}
                  style={{ marginLeft: 2, flexShrink: 0, opacity: 0.45 }}
                />
              )}
            </button>
          );
        })}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "right",
          }}
        >
          Actions
        </span>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: "4px 12px",
            background: "rgba(var(--danger-rgb, 239,68,68),0.1)",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <AlertCircle size={10} style={{ color: "var(--danger)" }} />
          <span style={{ fontSize: 10, color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      {/* Profile Rows */}
      {profiles.length === 0 ? (
        <div
          style={{
            padding: "16px 12px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 11,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <FolderOpen size={24} style={{ opacity: 0.35 }} />
          No profiles found in scan directory.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {getSortedProfiles().map((profile: LaunchProfile, idx: number) => {
            const running = isRunning(profile);
            const active = isActive(profile);
            const state = states[profile.script_path];
            const meta = profile.filename_meta;
            const profileMeta = metadata[profile.script_path];
            const specType = profile.parsed_args?.spec_type;
            const vram = running
              ? (state?.peak_vram_mb ?? profileMeta?.peak_vram_mb)
              : profileMeta?.peak_vram_mb;
            const ram = running
              ? (state?.peak_ram_mb ?? profileMeta?.peak_ram_mb)
              : profileMeta?.peak_ram_mb;
            const tps = running
              ? (state?.current_tps ?? profileMeta?.avg_gen_tps)
              : profileMeta?.avg_gen_tps;
            let rowBg: string | undefined;
            if (running) {
              rowBg = "color-mix(in srgb, var(--accent-primary) 9%, var(--bg-card))";
            } else if (idx % 2 === 1) {
              rowBg = "rgba(255,255,255,0.015)";
            }
            const modelNameStyle: React.CSSProperties = running
              ? { fontWeight: 700, color: "var(--accent-primary)" }
              : { fontWeight: 600, color: "var(--text-primary)" };

            return (
              <div
                key={profile.id}
                className="run-models-row"
                data-running={String(running)}
                style={{
                  display: "grid",
                  gridTemplateColumns: COL_GRID,
                  gap: 0,
                  padding: "4px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  borderLeft: running
                    ? "2px solid var(--accent-primary)"
                    : "2px solid transparent",
                  background: rowBg,
                  alignItems: "center",
                  minHeight: 26,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {idx + 1}
                </span>
                <StatusIndicator
                  status={states[profile.script_path]?.status ?? "stopped"}
                />
                <span
                  style={{
                    fontSize: 11,
                    ...modelNameStyle,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                  title={
                    profile.parsed_args?.model_path
                      ?.split("/")
                      .pop()
                      ?.replace(/\.gguf$/i, "") ?? profile.name
                  }
                >
                  {profile.parsed_args?.model_path
                    ?.split("/")
                    .pop()
                    ?.replace(/\.gguf$/i, "") ?? profile.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accent-primary)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}
                >
                  {meta?.params || "\u2014"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--warning)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={meta?.quant || ""}
                >
                  {meta?.quant || "\u2014"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}
                >
                  {formatCtx(profile.parsed_args?.context_size)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color:
                      vram != null
                        ? "var(--metric-vram)"
                        : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}
                >
                  {formatGB(vram)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color:
                      ram != null
                        ? "var(--metric-ram)"
                        : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}
                >
                  {formatGB(ram)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: specType
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={specLabel(specType)}
                >
                  {specLabel(specType)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: running ? "var(--success)" : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}
                >
                  {formatTps(tps)}
                </span>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 4,
                  }}
                >
                  {active ? (
                    <button
                      onClick={() => handleStopWithRetry(profile.id)}
                      title={
                        profileMeta
                          ? `Runs: ${profileMeta.run_count}\nLast run: ${formatLastRunDate(profileMeta.last_run_date)}`
                          : undefined
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          "color-mix(in srgb, var(--danger) 15%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                        borderRadius: 5,
                        cursor: "pointer",
                        color: "var(--danger)",
                      }}
                    >
                      <Square size={10} /> Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLaunchWithRetry(profile.id)}
                      title={
                        profileMeta
                          ? `Runs: ${profileMeta.run_count}\nLast run: ${formatLastRunDate(profileMeta.last_run_date)}`
                          : undefined
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          "color-mix(in srgb, var(--success) 15%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, var(--success) 35%, transparent)",
                        borderRadius: 5,
                        cursor: "pointer",
                        color: "var(--success)",
                      }}
                    >
                      <Play size={10} /> Run
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}

// ─── Hardware footer ───────────────────────────────────────────────────────────

interface LlamaCppHardwareFooterProps {
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
}

function LlamaCppHardwareFooter({
  cpuPct,
  memUsed,
  memTotal,
  memPct,
  gpuPct,
  gpuTemp,
  vramUsed,
  vramTotal,
  cpuHistory,
  memoryHistory,
  gpuHistory,
  gpuVramUtilHistory,
  gpuTempHistory,
}: LlamaCppHardwareFooterProps) {
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
        value={cpuPct != null ? `${cpuPct.toFixed(1)}%` : "\u2014"}
        color="var(--metric-cpu)"
        history={cpuHistory}
      />
      <FooterStat
        icon={<MemoryStick size={13} />}
        label="RAM"
        value={
          memUsed != null && memTotal != null
            ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB \u00b7 ${memPct?.toFixed(0) ?? "\u2014"}%`
            : "\u2014"
        }
        color="var(--metric-ram)"
        history={memoryHistory}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={gpuPct != null ? `${gpuPct.toFixed(0)}%` : "\u2014"}
        color="var(--metric-gpu)"
        history={gpuHistory}
      />
      <FooterStat
        icon={<Database size={13} />}
        label="VRAM"
        value={
          vramUsed != null && vramTotal != null
            ? `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`
            : "\u2014"
        }
        color="var(--metric-vram)"
        history={gpuVramUtilHistory}
      />
      <FooterStat
        icon={<Thermometer size={13} />}
        label="GPU Temp"
        value={gpuTemp != null ? `${gpuTemp.toFixed(0)}\u00b0C` : "\u2014"}
        color="var(--metric-temp)"
        history={gpuTempHistory}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity
export default function LlamaCppPage() {
  const {
    aiCurrentMetrics,
    aiLoading,
    cpuCurrentValues,
    memoryCurrentValues,
    gpuCurrentValues,
    cpuHistory,
    memoryHistory,
    gpuHistory,
    gpuVramUtilHistory,
    gpuTemperatureHistory,
    aiGenTpsHistory,
    aiPromptTpsHistory,
  } = useMetricsContext();

  const mgmt = useLlamaCppManagement();

  const [runningArgs, setRunningArgs] = useState<ParsedScriptArgs | null>(null);
  const [runningMeta, setRunningMeta] = useState<{
    params?: string;
    quant?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/launch/profiles");
        if (!r.ok || cancelled) return;
        const d: { data: ProfileResponse } = await r.json();
        const entry = Object.entries(d.data.states).find(
          ([, s]) => s.status === "running" || s.status === "loading",
        );
        if (cancelled) return;
        if (entry) {
          const [sp] = entry;
          const prof = d.data.profiles.find((p) => p.script_path === sp);
          setRunningArgs(prof?.parsed_args ?? null);
          setRunningMeta(prof?.filename_meta ?? null);
        } else {
          setRunningArgs(null);
          setRunningMeta(null);
        }
      } catch (e: unknown) {
        // eslint-disable-next-line no-console
        console.error("[LlamaCpp] Profile poll error:", e);
      }
    }
    poll();
    const t = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const m = aiCurrentMetrics;
  const llamaOnline: boolean = m?.llama_server?.available ?? false;
  const proc = m?.llama_server_process;

  const fullModelPath: string = m?.model_path || m?.model_alias || "";
  const pageModelFile = fullModelPath.includes("/")
    ? (fullModelPath.split("/").pop() ?? "")
    : fullModelPath;
  const cleanModelName = pageModelFile.replace(/\.gguf$/i, "");
  const { head: modelHead, quant: modelQuant } = splitModelName(cleanModelName);

  const pageModelAlias: string = m?.model_alias || "";
  const tokenUsage = m?.token_usage;
  const contextTokens: number | null = m?.context_tokens ?? null;
  const maxContext: number | null = m?.max_context ?? null;
  const contextPct =
    contextTokens != null && maxContext != null && maxContext > 0
      ? Math.round((contextTokens / maxContext) * 1000) / 10
      : null;

  const ctxColor = getCtxColor(contextPct);
  const hasDir = !!mgmt.dirPath;
  const toastBg =
    mgmt.toast?.type === "error" ? "var(--danger)" : "var(--accent-primary)";

  const cpuPct = cpuCurrentValues[0];
  const memUsed = memoryCurrentValues[1];
  const memTotal = memoryCurrentValues[2];
  const memPct = memoryCurrentValues[0];
  const gpuPct = gpuCurrentValues[0];
  const gpuTemp = gpuCurrentValues[1];
  const vramUsed = gpuCurrentValues[2];
  const vramTotal = gpuCurrentValues[3];

  const kvStats = m?.kv_cache_stats?.[0] ?? null;

  const gpuOffload: GpuOffloadInfo | null = m?.gpu_offload ?? null;
  const gpuTotalLoaded =
    gpuOffload != null
      ? gpuOffload.main_loaded + (gpuOffload.draft_loaded ?? 0)
      : null;
  const gpuTotalLayers =
    gpuOffload != null
      ? gpuOffload.main_total + (gpuOffload.draft_total ?? 0)
      : null;
  const gpuOffloadPct =
    gpuTotalLayers != null && gpuTotalLayers > 0
      ? Math.round((gpuTotalLoaded! / gpuTotalLayers) * 100)
      : 0;
  const hasDraft =
    gpuOffload != null &&
    gpuOffload.draft_loaded != null &&
    gpuOffload.draft_total != null;

  const behind = calcBuildsBehind(
    mgmt.repoInfo?.local_build_tag,
    mgmt.repoInfo?.latest_build_tag,
  );
  const buildInfo: string = m?.build_info || "";

  const modelNameRef = useFitText(cleanModelName);

  // ── Shared button style for action rail
  const railBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    flex: 1,
    minHeight: 38,
    width: "100%",
    fontSize: 12.5,
    fontWeight: 500,
    background: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: 9,
    cursor: "pointer",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    textDecoration: "none",
    boxSizing: "border-box" as const,
  };
  const railBtnDisabled: React.CSSProperties = {
    ...railBtn,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  // ── Inline KV row renderer for runtime/info cards
  const kvRow = (
    icon: React.ReactNode,
    label: string,
    value: string,
    valueColor?: string,
  ) => (
    <div
      style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 0",
      borderBottom: "1px dashed var(--border-light, var(--border-color))",
      fontSize: 12,
      gap: 8,
      minWidth: 0,
      }}
    >
      <span
        style={{
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          fontSize: 11.5,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            opacity: 0.7,
          }}
        >
          {icon}
        </span>
        {label}
      </span>
      <span
        style={{
          color: valueColor ?? "var(--text-primary)",
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Toast overlay */}
      {mgmt.toast && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 99999,
            padding: "6px 10px",
            borderRadius: 10,
            background: toastBg,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          {mgmt.toast.msg}
        </div>
      )}

      {/* ── Main layout container ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          gap: 12,
          padding: "12px 14px",
          overflow: "hidden",
        }}
      >
        {/* ════════════════════════════════════════════
            TOP ROW: Model header (678px) | Runtime + llama.cpp info + buttons
            ════════════════════════════════════════════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "660px 1fr 1fr 196px",
            gap: 14,
            flexShrink: 0,
            alignItems: "stretch",
          }}
        >
          {/* ── Model header card ── */}
          <PanelCard
            style={{
              padding: "16px 18px 14px",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              {/* Icon badge + eyebrow + model name */}
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 13,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--accent-tint-15)",
                    border:
                      "1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent)",
                    boxShadow:
                      "0 0 24px -7px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <Cpu size={27} style={{ color: "var(--accent-primary)" }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Eyebrow: LLAMA.CPP + ONLINE/OFFLINE */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 7,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.5px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      LLAMA.CPP
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        color: llamaOnline
                          ? "var(--success)"
                          : "var(--text-muted)",
                        background: llamaOnline
                          ? "rgba(34,197,94,0.13)"
                          : "rgba(255,255,255,0.05)",
                        padding: "2px 8px",
                        borderRadius: 6,
                        boxShadow: llamaOnline
                          ? "inset 0 0 0 1px rgba(34,197,94,0.25)"
                          : "inset 0 0 0 1px var(--border-color)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: llamaOnline
                            ? "var(--success)"
                            : "var(--text-muted)",
                          animation: llamaOnline
                            ? "dot-pulse 1.8s ease-in-out infinite"
                            : undefined,
                          flexShrink: 0,
                        }}
                      />
                      {llamaOnline ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  {/* Model name hero — auto-shrinks via useFitText; falls back to middleTruncate */}
                  <div
                    ref={modelNameRef}
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 26,
                      fontWeight: 700,
                      letterSpacing: "-1px",
                      lineHeight: 1.06,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      color: "var(--text-primary)",
                    }}
                    title={cleanModelName || "\u2014"}
                  >
                    {cleanModelName ? (
                      <>
                        {middleTruncate(modelHead, 40)}
                        {modelQuant && (
                          <span
                            className="accent-text"
                            style={{
                              textShadow: "0 0 18px var(--accent-glow)",
                            }}
                          >
                            {modelQuant}
                          </span>
                        )}
                      </>
                    ) : (
                      "\u2014"
                    )}
                  </div>
                </div>
              </div>

              {/* File size */}
              {m?.gguf_size_gib != null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 9,
                    marginBottom: 12,
                  }}
                >
                  <span
                    className="accent-text"
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: "-0.8px",
                    }}
                  >
                    {(m.gguf_size_gib as number).toFixed(2)} GiB
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      color: "var(--text-muted)",
                    }}
                  >
                    Model File Size
                  </span>
                </div>
              )}

              {/* Meta chips */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginBottom: 14,
                }}
              >
                {runningMeta?.params && (
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      background: "var(--bg-secondary)",
                      border:
                        "1px solid var(--border-light, var(--border-color))",
                      borderRadius: 7,
                      padding: "4px 9px",
                    }}
                  >
                    <b
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                    >
                      {runningMeta.params}
                    </b>{" "}
                    params
                  </span>
                )}
                {maxContext != null && (
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      background: "var(--bg-secondary)",
                      border:
                        "1px solid var(--border-light, var(--border-color))",
                      borderRadius: 7,
                      padding: "4px 9px",
                    }}
                  >
                    <b
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                    >
                      {formatCtx(maxContext)}
                    </b>{" "}
                    ctx
                  </span>
                )}
                {modelQuant && (
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      background: "var(--bg-secondary)",
                      border:
                        "1px solid var(--border-light, var(--border-color))",
                      borderRadius: 7,
                      padding: "4px 9px",
                    }}
                  >
                    <b
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                    >
                      {modelQuant}
                    </b>{" "}
                    quant
                  </span>
                )}
              </div>
            </div>

            {/* Sampling params sub-row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                paddingTop: 10,
                borderTop:
                  "1px dashed var(--border-light, var(--border-color))",
              }}
            >
              {(
                [
                  {
                    icon: <Thermometer size={10} />,
                    label: "Temp",
                    value:
                      m?.temperature != null
                        ? m.temperature.toFixed(2)
                        : "\u2014",
                  },
                  {
                    icon: <SlidersHorizontal size={10} />,
                    label: "Top-K",
                    value: fmtNum(m?.top_k) || "\u2014",
                  },
                  {
                    icon: <SlidersHorizontal size={10} />,
                    label: "Top-P",
                    value:
                      m?.top_p != null ? m.top_p.toFixed(2) : "\u2014",
                  },
                  {
                    icon: <RotateCcw size={10} />,
                    label: "Repeat",
                    value:
                      m?.repeat_penalty != null
                        ? m.repeat_penalty.toFixed(2)
                        : "\u2014",
                  },
                ] as { icon: React.ReactNode; label: string; value: string }[]
              ).map(({ icon, label, value }) => (
                <div
                  key={label}
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--accent-primary)",
                        display: "flex",
                      }}
                    >
                      {icon}
                    </span>
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: "var(--text-primary)",
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Capability badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <CapPill
                icon={<Activity size={13} />}
                label="Metrics"
                enabled={m?.endpoint_metrics}
              />
              <CapPill
                icon={<Globe size={13} />}
                label="WebUI"
                enabled={m?.webui}
              />
              <CapPill
                icon={<Eye size={13} />}
                label="Vision"
                enabled={m?.vision}
              />
              <CapPill
                icon={<AudioLines size={13} />}
                label="Audio"
                enabled={m?.audio}
              />
              <CapPill
                icon={<VideoIcon size={13} />}
                label="Video"
                enabled={m?.video}
              />
            </div>
          </PanelCard>

          {/* ── Context | llama.cpp info | Action buttons ── */}
          <div style={{ display: "contents" }}>
            {/* ── Context card ── */}
            <PanelCard>
              <PanelHead icon={<Brain size={13} />} title="Context" />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "12px 14px 14px",
                  gap: 10,
                  flex: 1,
                  overflow: "hidden",
                }}
              >
                {!llamaOnline && !aiLoading && (
                  <div
                    className="error-banner"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 6,
                      width: "100%",
                    }}
                  >
                    <AlertCircle size={12} style={{ flexShrink: 0 }} />
                    llama.cpp server offline
                  </div>
                )}
                {/* Radial gauge */}
                <RadialGauge pct={contextPct} color={ctxColor} size={110}>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: ctxColor,
                      lineHeight: 1,
                    }}
                  >
                    {contextPct != null
                      ? contextPct.toFixed(0)
                      : llamaOnline
                        ? "—"
                        : "0"}
                  </span>
                  {contextPct != null && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      %
                    </span>
                  )}
                </RadialGauge>
                {/* Token counts */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    fontSize: 11,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    color: "var(--text-muted)",
                  }}
                >
                  <span style={{ color: ctxColor, fontWeight: 600 }}>
                    {contextTokens != null
                      ? contextTokens.toLocaleString()
                      : "—"}
                  </span>
                  <span>
                    /{" "}
                    {maxContext != null ? maxContext.toLocaleString() : "—"} tok
                  </span>
                </div>
                {/* Usage bar */}
                <div style={{ width: "100%" }}>
                  <div className="card-progress" style={{ height: 4 }}>
                    <div
                      className={`card-progress-bar ${thresholdClass(contextPct)}`}
                      style={{ width: `${contextPct ?? 0}%` }}
                    />
                  </div>
                </div>
                {/* Mini rings */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    marginTop: "auto",
                    flexWrap: "wrap",
                  }}
                >
                  <MiniRing
                    pct={m?.kv_cache_usage_percent ?? null}
                    color={thresholdColor(m?.kv_cache_usage_percent)}
                    label="KV Cache"
                    value={
                      m?.kv_cache_usage_percent != null
                        ? `${m.kv_cache_usage_percent.toFixed(0)}%`
                        : "—"
                    }
                  />
                  <MiniRing
                    pct={m?.prompt_buffer_usage_percent ?? null}
                    color={thresholdColor(m?.prompt_buffer_usage_percent)}
                    label="Prompt Buf"
                    value={
                      m?.prompt_buffer_usage_percent != null
                        ? `${m.prompt_buffer_usage_percent.toFixed(0)}%`
                        : "—"
                    }
                  />
                  <MiniRing
                    pct={kvStats?.gpu_cache_usage_pct ?? null}
                    color={thresholdColor(kvStats?.gpu_cache_usage_pct)}
                    label="GPU Cache"
                    value={
                      kvStats?.gpu_cache_usage_pct != null
                        ? `${kvStats.gpu_cache_usage_pct.toFixed(0)}%`
                        : "—"
                    }
                  />
                </div>
              </div>
            </PanelCard>

            {/* ── llama.cpp Information card ── */}
            <PanelCard>
              <PanelHead
                icon={<Package size={13} />}
                title="llama.cpp Information"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "11px 14px",
                  padding: "13px 15px 11px",
                  flex: 1,
                }}
              >
                <InfoCell
                  label="Version"
                  value={mgmt.llamaVersion || "\u2014"}
                  accent
                />
                <InfoCell label="Build" value={buildInfo || "\u2014"} />
                <InfoCell
                  label="Branch"
                  value={mgmt.gitInfo?.branch || "\u2014"}
                  accent
                />
                <InfoCell
                  label="Commit"
                  value={mgmt.gitInfo?.commit_hash || "\u2014"}
                  accent
                />
                <InfoCell
                  label="Local Tag"
                  value={mgmt.repoInfo?.local_build_tag || "\u2014"}
                  accent
                />
                <InfoCell
                  label="Latest Release"
                  value={mgmt.repoInfo?.latest_build_tag || "\u2014"}
                  success
                />
              </div>

              {/* Update row: "N builds behind" chip + tinted Update CTA */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 15px 12px",
                }}
              >
                {behind != null && behind > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flex: 1,
                      background:
                        "color-mix(in srgb, var(--warning) 10%, transparent)",
                      border:
                        "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                      color: "var(--warning)",
                      borderRadius: 7,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    <TriangleAlert
                      size={13}
                      style={{
                        flexShrink: 0,
                        animation: "pulse 2s ease-in-out infinite",
                      }}
                    />
                    {behind} build{behind === 1 ? "" : "s"} behind latest
                  </div>
                )}
                <button
                  onClick={mgmt.runUpdate}
                  disabled={!hasDir || mgmt.updateState === "running"}
                  className="settings-btn settings-btn-accent"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    fontSize: 11,
                    borderRadius: 7,
                    whiteSpace: "nowrap",
                    cursor:
                      !hasDir || mgmt.updateState === "running"
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !hasDir || mgmt.updateState === "running" ? 0.5 : 1,
                  }}
                >
                  <RefreshCw
                    size={12}
                    className={
                      mgmt.updateState === "running" ? "spin" : undefined
                    }
                  />
                  Update to latest
                </button>
              </div>

              {/* Update progress bar */}
              {mgmt.updateState !== "idle" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 15px 11px",
                  }}
                >
                  {mgmt.updateState === "running" && (
                    <Loader2
                      size={10}
                      className="spin"
                      style={{ color: "var(--accent-primary)", flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                      color: updateStateColor(mgmt.updateState),
                    }}
                  >
                    {updateStateText(mgmt.updateState)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 2,
                      background: "var(--bg-secondary)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${mgmt.updateProgress}%`,
                        height: "100%",
                        borderRadius: 2,
                        background:
                          mgmt.updateState === "error"
                            ? "var(--danger)"
                            : "var(--accent-fill)",
                        backgroundSize:
                          mgmt.updateState !== "error"
                            ? "var(--accent-fill-size, 200% 200%)"
                            : undefined,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      flexShrink: 0,
                      width: 28,
                      textAlign: "right",
                    }}
                  >
                    {mgmt.updateProgress}%
                  </span>
                  <button
                    onClick={() => mgmt.setOutputOpen(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 6px",
                      fontSize: 10,
                      fontWeight: 600,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                      flexShrink: 0,
                    }}
                  >
                    <ExternalLink size={9} />
                    Output
                  </button>
                </div>
              )}
            </PanelCard>

            {/* ── Action buttons column: 4 secondary buttons ── */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                height: "100%",
              }}
            >
              <button
                onClick={() => mgmt.openTerminal()}
                disabled={!hasDir}
                className="settings-btn"
                style={!hasDir ? railBtnDisabled : railBtn}
              >
                <TermIcon
                  size={15}
                  style={{ color: "var(--accent-primary)" }}
                />
                Terminal
              </button>

              <a
                href="https://github.com/ggml-org/llama.cpp"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-btn"
                style={{ ...railBtn, textDecoration: "none" }}
              >
                <GitBranch
                  size={15}
                  style={{ color: "var(--accent-primary)" }}
                />
                GitHub
              </a>

              <button
                onClick={() =>
                  mgmt.readmeUrl &&
                  window.open(mgmt.readmeUrl, "_blank", "noopener,noreferrer")
                }
                disabled={!mgmt.readmeUrl}
                className="settings-btn"
                style={!mgmt.readmeUrl ? railBtnDisabled : railBtn}
              >
                <BookOpen
                  size={15}
                  style={{ color: "var(--accent-primary)" }}
                />
                Readme
              </button>

              <a
                href="https://github.com/ggml-org/llama.cpp/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-btn"
                style={{ ...railBtn, textDecoration: "none" }}
              >
                <ArrowDown
                  size={15}
                  style={{ color: "var(--accent-primary)" }}
                />
                Release Notes
              </a>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            LOWER ROW: Runtime (660px) | Run Models + Console
            ════════════════════════════════════════════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "660px 1fr",
            gap: 14,
            flex: 1,
            minHeight: 0,
            alignItems: "stretch",
          }}
        >
          {/* ── Lower-left: Telemetry rail + Runtime card ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
            }}
          >
            {/* Telemetry rail — two rows: numbers on top, aligned sparklines below */}
            <PanelCard style={{ flexShrink: 0 }}>
              {/* Row 1: metric numbers */}
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderBottom:
                    "1px solid var(--border-light, var(--border-color))",
                }}
              >
                {/* Gen TPS — hero */}
                <div
                  style={{
                    flex: 2,
                    padding: "10px 14px",
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{ color: "var(--accent-primary)", display: "flex" }}
                    >
                      <Zap size={12} />
                    </span>
                    Gen TPS
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 30,
                        fontWeight: 800,
                        color: "var(--accent-primary)",
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      {m?.gen_tps != null ? m.gen_tps.toFixed(1) : "—"}
                    </span>
                    {m?.gen_tps != null && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontWeight: 500,
                        }}
                      >
                        t/s
                      </span>
                    )}
                  </div>
                </div>

                {/* Prompt TPS */}
                <div
                  style={{
                    flex: 1.5,
                    padding: "10px 12px",
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{ color: "var(--accent-primary)", display: "flex" }}
                    >
                      <Activity size={12} />
                    </span>
                    Prompt TPS
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      {m?.prompt_tps != null ? m.prompt_tps.toFixed(1) : "—"}
                    </span>
                    {m?.prompt_tps != null && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontWeight: 500,
                        }}
                      >
                        t/s
                      </span>
                    )}
                  </div>
                </div>

                {/* Prompt tokens */}
                <div
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{ color: "var(--text-secondary)", display: "flex" }}
                    >
                      <Send size={12} />
                    </span>
                    Prompt
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      {fmtNum(tokenUsage?.prompt_tokens) || "0"}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      tok
                    </span>
                  </div>
                </div>

                {/* Generated tokens */}
                <div
                  style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{ color: "var(--text-secondary)", display: "flex" }}
                    >
                      <Cpu size={12} />
                    </span>
                    Generated
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      {fmtNum(tokenUsage?.completion_tokens) || "0"}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      tok
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: aligned sparkline graphs on recessed background */}
              <div
                style={{
                  display: "flex",
                  background:
                    "color-mix(in srgb, var(--bg-secondary) 55%, transparent)",
                  borderRadius:
                    "0 0 var(--radius-md) var(--radius-md)",
                }}
              >
                {/* Gen TPS graph — flex:2 matches number column above */}
                <div
                  style={{
                    flex: 2,
                    height: 44,
                    overflow: "hidden",
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                    padding: "3px 0",
                  }}
                >
                  {aiGenTpsHistory && aiGenTpsHistory.length > 0 && (
                    <Sparkline
                      data={aiGenTpsHistory}
                      color="var(--accent-primary)"
                      height={38}
                    />
                  )}
                </div>
                {/* Prompt TPS graph — flex:1.5 matches column above */}
                <div
                  style={{
                    flex: 1.5,
                    height: 44,
                    overflow: "hidden",
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                    padding: "3px 0",
                  }}
                >
                  {aiPromptTpsHistory && aiPromptTpsHistory.length > 0 && (
                    <Sparkline
                      data={aiPromptTpsHistory}
                      color="var(--accent-primary)"
                      height={38}
                    />
                  )}
                </div>
                {/* Prompt — cumulative counter, no graph */}
                <div
                  style={{
                    flex: 1,
                    height: 44,
                    borderRight:
                      "1px solid var(--border-light, var(--border-color))",
                  }}
                />
                {/* Generated — cumulative counter, no graph */}
                <div style={{ flex: 1, height: 44 }} />
              </div>
            </PanelCard>

            {/* Runtime Information card */}
            <PanelCard style={{ flex: 1, minHeight: 0 }}>
              <PanelHead
                icon={<Activity size={13} />}
                title="Runtime Information"
              />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 22px",
                padding: "8px 15px",
                overflow: "auto",
                flex: 1,
              }}
            >
              {/* Left column */}
              <div>
                {kvRow(
                  <Server size={12} />,
                  "Server",
                  llamaOnline ? "Online" : "Offline",
                  llamaOnline ? "var(--success)" : "var(--text-muted)",
                )}
                {kvRow(
                  <Fingerprint size={12} />,
                  "PID",
                  proc?.pid != null ? String(proc.pid) : "\u2014",
                )}
                {kvRow(
                  <Globe size={12} />,
                  "Port",
                  runningArgs?.port != null
                    ? String(runningArgs.port)
                    : "\u2014",
                )}
                {kvRow(
                  <Brain size={12} />,
                  "Context",
                  maxContext != null ? formatCtx(maxContext) : "\u2014",
                )}
                {kvRow(
                  <Zap size={12} />,
                  "Speculative",
                  boolLabel(m?.speculative),
                  m?.speculative ? "var(--success)" : undefined,
                )}
                {kvRow(
                  <Tag size={12} />,
                  "Alias",
                  pageModelAlias || "\u2014",
                  pageModelAlias ? "var(--accent-primary)" : undefined,
                )}
                {kvRow(
                  <Send size={12} />,
                  "Total Sent",
                  fmtNum(m?.total_tokens_sent) || "0",
                )}
              </div>

              {/* Right column */}
              <div>
                {kvRow(
                  <Clock3 size={12} />,
                  "Uptime",
                  fmtUptime(proc?.uptime_seconds),
                )}
                {kvRow(
                  <Cpu size={12} />,
                  "CPU",
                  proc?.cpu_percent != null
                    ? `${proc.cpu_percent.toFixed(1)}%`
                    : "\u2014",
                )}
                {kvRow(
                  <MemoryStick size={12} />,
                  "Memory",
                  fmtKb(proc?.memory_kb),
                )}
                {kvRow(
                  <Layers size={12} />,
                  "CPU Layers",
                  gpuOffload != null
                    ? `${gpuOffload.main_loaded} / ${gpuOffload.main_total}`
                    : "\u2014",
                  gpuOffload != null ? "var(--success)" : undefined,
                )}
                {kvRow(
                  <Layers size={12} />,
                  "Draft Layers",
                  hasDraft && gpuOffload != null
                    ? `${gpuOffload.draft_loaded} / ${gpuOffload.draft_total}`
                    : "\u2014",
                  hasDraft ? "var(--success)" : undefined,
                )}
                {kvRow(
                  <MonitorCog size={12} />,
                  "GPU Layers",
                  gpuTotalLoaded != null && gpuTotalLayers != null
                    ? `${gpuTotalLoaded}/${gpuTotalLayers} (${gpuOffloadPct}%)`
                    : "\u2014",
                  gpuOffloadPct === 100 ? "var(--success)" : undefined,
                )}
                {kvRow(
                  <Zap size={12} />,
                  "Load Time",
                  m?.model_load_time_ms != null
                    ? `${(m.model_load_time_ms / 1000).toFixed(2)}s`
                    : "\u2014",
                )}
                {kvRow(
                  <Database size={12} />,
                  "Tokens Cached",
                  m?.tokens_cached != null ? fmtNum(m.tokens_cached) : "—",
                  m?.tokens_cached == null ? "var(--text-muted)" : undefined,
                )}
              </div>
            </div>

            {/* Live Activity */}
            <div
              style={{
                padding: "7px 15px 9px",
                borderTop:
                  "1px dashed var(--border-light, var(--border-color))",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}
              >
                Live Activity
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <FooterStat
                  icon={<Send size={13} />}
                  label="Total Sent"
                  value={fmtNum(m?.total_tokens_sent) || "0"}
                  color="var(--accent-primary)"
                />
                <FooterStat
                  icon={<Zap size={13} />}
                  label="Load Time"
                  value={
                    m?.model_load_time_ms != null
                      ? `${(m.model_load_time_ms / 1000).toFixed(2)}s`
                      : "—"
                  }
                  color="var(--text-secondary)"
                />
                <FooterStat
                  icon={<Database size={13} />}
                  label="Tok Cached"
                  value={
                    m?.tokens_cached != null ? fmtNum(m.tokens_cached) : "—"
                  }
                  color="var(--success)"
                  history={gpuVramUtilHistory}
                />
              </div>
            </div>
          </PanelCard>
          </div>

          {/* ── Right lower column: Run Models + Console ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
            }}
          >
            {/* Run Models card — fixed height showing 5 rows, rest scrolls */}
            <div
              className="card-accent-spine"
              style={{
                flex: "none",
                height: 204,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)",
                background: `linear-gradient(90deg, var(--accent-tint-10), transparent 200px), var(--bg-card)`,
              }}
            >
              <span className="accent-spine" style={SPINE_STYLE} />
              <RunModelsSection />
            </div>

            {/* Console card — fills remaining height */}
            <div
              className="card-accent-spine"
              style={{
                flex: 1,
                minHeight: 0,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)",
                background: `linear-gradient(90deg, var(--accent-tint-10), transparent 200px), var(--bg-card)`,
              }}
            >
              <span className="accent-spine" style={SPINE_STYLE} />
              <LogConsole />
            </div>
          </div>
        </div>
      </div>

      {/* ── Hardware footer ── */}
      <LlamaCppHardwareFooter
        cpuPct={cpuPct}
        memUsed={memUsed}
        memTotal={memTotal}
        memPct={memPct}
        gpuPct={gpuPct}
        gpuTemp={gpuTemp}
        vramUsed={vramUsed}
        vramTotal={vramTotal}
        cpuHistory={cpuHistory}
        memoryHistory={memoryHistory}
        gpuHistory={gpuHistory}
        gpuVramUtilHistory={gpuVramUtilHistory}
        gpuTempHistory={gpuTemperatureHistory ?? []}
      />

      <UpdateOutputModal
        isOpen={mgmt.outputOpen}
        onClose={() => mgmt.setOutputOpen(false)}
        output={mgmt.updateOutput}
        running={mgmt.updateState === "running"}
      />
    </main>
  );
}
