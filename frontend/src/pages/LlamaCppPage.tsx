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
  Layers,
  MonitorCog,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  extractQuant,
} from "./llamaCppUtils";

// ─── Internal helpers ─────────────────────────────────────────────────────────

export function fmtNum(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString();
}

function getCtxColor(pct: number | null): string {
  if (pct != null && pct > 90) return "var(--danger)";
  if (pct != null && pct > 70) return "var(--warning)";
  return "var(--accent-primary)";
}

export function thresholdClass(pct: number | null | undefined): string {
  if (pct == null) return "";
  if (pct >= 85) return "progress-bar-critical";
  if (pct >= 70) return "progress-bar-warning";
  return "progress-bar-normal";
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

export function boolLabel(val: boolean | null | undefined): string {
  if (val == null) return "\u2014";
  return val ? "Yes" : "No";
}

function updateStateText(state: string): string {
  if (state === "running") return "Updating\u2026";
  if (state === "done") return "Update complete";
  return "Update failed";
}

export function middleTruncate(s: string, max = 46): string {
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
      data-accent-el=""
      style={{
        background: `linear-gradient(90deg, var(--accent-tint-10), transparent 200px), var(--bg-card)`,
        border: "1px solid var(--border-light, var(--border-color))",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-card), var(--card-glow), var(--card-halo)",
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
  const largeArcFlag = progressDeg > 180 ? 1 : 0;
  const progPath =
    progressDeg > 0
      ? `M ${pt(0)} A ${r} ${r} 0 ${largeArcFlag} 1 ${pt(progressDeg)}`
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

function rowBackground(running: boolean, idx: number): string | undefined {
  if (running)
    return "color-mix(in srgb, var(--accent-primary) 9%, var(--bg-card))";
  if (idx % 2 === 1) return "rgba(255,255,255,0.015)";
  return undefined;
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

const accentTileBase = {
  background: "var(--accent-tint-10)",
  border: "1px solid var(--accent-tint-40)",
} as const;
const accentLabelColor = "var(--accent-primary)";

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

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfiles = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
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
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadProfiles, 0);
    return () => clearTimeout(t);
  }, [loadProfiles]);

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
    const timer = setInterval(() => loadProfiles(false), 30000);
    return () => clearInterval(timer);
  }, [loadProfiles]);

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

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

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
          onClick={() => loadProfiles()}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 600,
            ...accentTileBase,
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            color: accentLabelColor,
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
            const modelFile =
              (profile.parsed_args?.model_path ?? "")
                .split("/")
                .pop()
                ?.replace(/\.gguf$/i, "") ?? "";
            const derivedQuant = extractQuant(modelFile) || meta?.quant || "";
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
            const rowBg = rowBackground(running, idx);
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
                  borderBottom: "1px solid var(--accent-tint-40)",
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
                  title={derivedQuant}
                >
                  {derivedQuant || "\u2014"}
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
                      vram != null ? "var(--metric-vram)" : "var(--text-muted)",
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
                      ram != null ? "var(--metric-ram)" : "var(--text-muted)",
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

export function contextGaugeLabel(
  contextPct: number | null | undefined,
  llamaOnline: boolean,
): string {
  if (contextPct != null) {
    if (contextPct > 0 && contextPct < 1) return "<1";
    return contextPct.toFixed(0);
  }
  if (llamaOnline) return "—";
  return "0";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity
export default function LlamaCppPage() {
  const {
    aiCurrentMetrics,
    aiGenTpsHistory,
    aiPromptTpsHistory,
    llamaCppLoading,
    cpuCurrentValues,
    memoryCurrentValues,
    gpuCurrentValues,
    cpuHistory,
    memoryHistory,
    gpuHistory,
    gpuVramUtilHistory,
    gpuTemperatureHistory,
  } = useMetricsContext();

  const mgmt = useLlamaCppManagement();

  const [runningArgs, setRunningArgs] = useState<ParsedScriptArgs | null>(null);
  const [runningMeta, setRunningMeta] = useState<{
    params?: string;
    quant?: string;
  } | null>(null);
  const [cacheHits, setCacheHits] = useState(0);
  const prevTokCachedRef = useRef<number | null>(null);
  const [lastGenProgress, setLastGenProgress] = useState<number>(0);

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

  // Slot-based context data from /slots[0]
  const slot0 = m?.slots && m.slots.length > 0 ? m.slots[0] : null;
  const slotCtx: number | null = slot0?.n_ctx ?? null;
  const slotCurrentTokens: number | null = slot0?.n_prompt_tokens ?? null;
  const contextPct =
    slotCurrentTokens != null && slotCtx != null && slotCtx > 0
      ? Math.round((slotCurrentTokens / slotCtx) * 1000) / 10
      : null;

  const tokCached: number | null =
    slot0?.n_prompt_tokens_cache != null
      ? slot0.n_prompt_tokens_cache
      : (m?.tokens_cached ?? null);

  const genProgressPct: number | null = (() => {
    const nd = slot0?.n_decoded;
    const np = slot0?.n_predict;
    return nd != null && np != null && np > 0
      ? Math.round((nd / np) * 100)
      : null;
  })();
  if (genProgressPct !== null && genProgressPct !== lastGenProgress) {
    setLastGenProgress(genProgressPct);
  }

  useEffect(() => {
    const prev = prevTokCachedRef.current;
    prevTokCachedRef.current = tokCached;
    if ((prev == null || prev === 0) && tokCached != null && tokCached > 0) {
      setCacheHits((n) => n + 1);
    }
  }, [tokCached]);

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
  const modelNameRef = useFitText(cleanModelName);

  // ── Inline KV row renderer for runtime/info cards
  const kvRow = (
    icon: React.ReactNode,
    label: string,
    value: string,
    valueColor?: string,
    testId?: string,
    wide?: boolean,
  ) => (
    <div
      style={{
        ...accentTileBase,
        borderRadius: 8,
        padding: "5px 8px",
        minWidth: 0,
        gridColumn: wide ? "1 / -1" : undefined,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          color: accentLabelColor,
          display: "flex",
          alignItems: "center",
          gap: 3,
          marginBottom: 2,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", opacity: 0.7 }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        data-testid={testId}
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          color: valueColor ?? "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
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
          gap: 9,
          padding: "11px 13px",
          overflow: "hidden",
        }}
      >
        {/* ══════════════════════════════════════════════════
            TOP ROW: Active Model | Throughput | Context
            ══════════════════════════════════════════════════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "12fr 8fr 10fr",
            gap: 9,
            flexShrink: 0,
          }}
        >
          {/* ── Active Model card ── */}
          <PanelCard style={{ padding: "15px 17px 13px", gap: 10 }}>
            {/* Eyebrow */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                <span
                  style={{ color: "var(--accent-primary)", display: "flex" }}
                >
                  <Cpu size={14} />
                </span>
                Active Model
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  color: "var(--border-color)",
                }}
              >
                01
              </span>
            </div>
            {/* Accent line */}
            <div
              style={{
                height: 2,
                width: 36,
                background: "var(--accent-fill)",
                backgroundSize: "var(--accent-fill-size, 200% 200%)",
                borderRadius: 2,
                marginBottom: 6,
              }}
            />
            {/* Model name hero */}
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
                paddingTop: 12,
              }}
              title={cleanModelName || "\u2014"}
            >
              {cleanModelName ? (
                <>
                  {middleTruncate(modelHead, 40)}
                  {modelQuant && (
                    <span
                      className="accent-text"
                      style={{ textShadow: "0 0 18px var(--accent-glow)" }}
                    >
                      {modelQuant}
                    </span>
                  )}
                </>
              ) : (
                "\u2014"
              )}
            </div>
            {/* Middle flex – grows and distributes meta + pills evenly */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-evenly",
              }}
            >
              {/* Meta row: size + tags + running status */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                {m?.gguf_size_gib != null && (
                  <span
                    className="accent-text"
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 21,
                      fontWeight: 700,
                      letterSpacing: "-0.5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(m.gguf_size_gib as number).toFixed(2)}{" "}
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontWeight: 400,
                      }}
                    >
                      GB
                    </span>
                  </span>
                )}
                <div
                  style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}
                >
                  {runningMeta?.params && (
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        border:
                          "1px solid var(--border-light, var(--border-color))",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                    >
                      <b
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        {runningMeta.params}
                      </b>
                    </span>
                  )}
                  {slotCtx != null && (
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        border:
                          "1px solid var(--border-light, var(--border-color))",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                    >
                      <b
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        {formatCtx(slotCtx)}
                      </b>{" "}
                      ctx
                    </span>
                  )}
                  {modelQuant && (
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        border:
                          "1px solid var(--border-light, var(--border-color))",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                    >
                      <b
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        {modelQuant}
                      </b>
                    </span>
                  )}
                  {pageModelAlias && (
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: 10,
                        color: "var(--accent-primary)",
                        background:
                          "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                    >
                      alias <b style={{ fontWeight: 600 }}>{pageModelAlias}</b>
                    </span>
                  )}
                </div>
                <StatusIndicator status={llamaOnline ? "running" : "stopped"} />
              </div>
              {/* Capability pills */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <CapPill
                  icon={<Activity size={12} />}
                  label="Metrics"
                  enabled={m?.endpoint_metrics}
                />
                <CapPill
                  icon={<Globe size={12} />}
                  label="WebUI"
                  enabled={m?.webui}
                />
                <CapPill
                  icon={<Eye size={12} />}
                  label="Vision"
                  enabled={m?.vision}
                />
                <CapPill
                  icon={<AudioLines size={12} />}
                  label="Audio"
                  enabled={m?.audio}
                />
                <CapPill
                  icon={<VideoIcon size={12} />}
                  label="Video"
                  enabled={m?.video}
                />
              </div>
            </div>
            {/* Sampling tiles */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
                paddingTop: 9,
                borderTop:
                  "1px dashed var(--border-light, var(--border-color))",
              }}
            >
              {(
                [
                  {
                    label: "Temperature",
                    value:
                      m?.temperature != null
                        ? m.temperature.toFixed(2)
                        : "\u2014",
                    testId: "sampling-temperature",
                  },
                  {
                    label: "Top-K Sampling",
                    value: fmtNum(m?.top_k) || "\u2014",
                    testId: "sampling-top-k",
                  },
                  {
                    label: "Top-P (Nucleus) Sampling",
                    value: m?.top_p != null ? m.top_p.toFixed(2) : "\u2014",
                    testId: "sampling-top-p",
                  },
                  {
                    label: "Repeat Penalty",
                    value:
                      m?.repeat_penalty != null
                        ? m.repeat_penalty.toFixed(2)
                        : "\u2014",
                    testId: "sampling-repeat-penalty",
                  },
                ] as { label: string; value: string; testId: string }[]
              ).map(({ label, value, testId }) => (
                <div
                  key={label}
                  data-testid={testId}
                  style={{
                    ...accentTileBase,
                    borderRadius: 10,
                    padding: "8px 5px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      textTransform: "uppercase",
                      color: accentLabelColor,
                      letterSpacing: "0.5px",
                      marginBottom: 1,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: "var(--text-primary)",
                      marginTop: 1,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>

          {/* ── Throughput card ── */}
          <PanelCard>
            <PanelHead
              icon={<Zap size={13} />}
              title="Throughput"
              right={
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    color: "var(--border-color)",
                  }}
                >
                  02
                </span>
              }
            />
            <div
              style={{
                padding: "10px 13px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 7,
                flex: 1,
              }}
            >
              {/* Gen Speed banner */}
              <div
                data-testid="thrpt-gen-tps"
                style={{
                  ...accentTileBase,
                  borderRadius: 11,
                  padding: "8px 13px",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: accentLabelColor,
                    marginBottom: 2,
                  }}
                >
                  Generation Speed
                </div>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 3 }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      lineHeight: 1,
                    }}
                  >
                    {m?.gen_tps != null ? m.gen_tps.toFixed(1) : "\u2014"}
                  </span>
                  {m?.gen_tps != null && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {" "}
                      t/s
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    flex: 1,
                    minHeight: 28,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <Sparkline
                    data={aiGenTpsHistory ?? []}
                    color="var(--accent-primary)"
                    width={200}
                    height={28}
                  />
                </div>
              </div>

              {/* Prompt Speed banner */}
              <div
                data-testid="thrpt-prompt-tps"
                style={{
                  ...accentTileBase,
                  borderRadius: 11,
                  padding: "8px 13px",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: accentLabelColor,
                    marginBottom: 2,
                  }}
                >
                  Prompt Speed
                </div>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 3 }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      lineHeight: 1,
                    }}
                  >
                    {m?.prompt_tps != null ? m.prompt_tps.toFixed(1) : "\u2014"}
                  </span>
                  {m?.prompt_tps != null && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {" "}
                      t/s
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    flex: 1,
                    minHeight: 28,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <Sparkline
                    data={aiPromptTpsHistory ?? []}
                    color="var(--accent-primary)"
                    width={200}
                    height={28}
                  />
                </div>
              </div>

              {/* Prompt Tokens | Generated | Total Sent | Active Req tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 6,
                }}
              >
                <div
                  data-testid="thrpt-prompt-tokens"
                  style={{
                    ...accentTileBase,
                    borderRadius: 9,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      color: accentLabelColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Prompt Tokens
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      marginTop: 1,
                    }}
                  >
                    {fmtNum(tokenUsage?.prompt_tokens) || "0"}
                  </div>
                </div>
                <div
                  data-testid="thrpt-generated"
                  style={{
                    ...accentTileBase,
                    borderRadius: 9,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      color: accentLabelColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Generated
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      marginTop: 1,
                    }}
                  >
                    {fmtNum(tokenUsage?.completion_tokens) || "0"}
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontWeight: 400,
                        marginLeft: 2,
                      }}
                    >
                      token
                    </span>
                  </div>
                </div>
                <div
                  data-testid="thrpt-total-sent"
                  style={{
                    ...accentTileBase,
                    borderRadius: 9,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      color: accentLabelColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Total Sent
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      marginTop: 1,
                    }}
                  >
                    {fmtNum(m?.total_tokens_sent) || "0"}
                  </div>
                </div>
                <div
                  data-testid="thrpt-active-req"
                  style={{
                    ...accentTileBase,
                    borderRadius: 9,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      color: accentLabelColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Active Req
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      marginTop: 1,
                    }}
                  >
                    {fmtNum(m?.active_requests) || "0"}
                  </div>
                </div>
              </div>
            </div>
          </PanelCard>

          {/* ── Context card ── */}
          <PanelCard>
            <PanelHead
              icon={<Brain size={13} />}
              title="Context"
              right={
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    color: "var(--border-color)",
                  }}
                >
                  03
                </span>
              }
            />
            <div
              style={{
                padding: "10px 13px 12px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                overflow: "hidden",
              }}
            >
              {!llamaOnline && !llamaCppLoading && (
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
              {/* Gauge + tiles row */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  flex: 1,
                }}
              >
                <RadialGauge pct={contextPct} color={ctxColor} size={120}>
                  <span
                    data-testid="ctx-gauge-label"
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: ctxColor,
                      lineHeight: 1,
                    }}
                  >
                    {contextGaugeLabel(contextPct, llamaOnline)}
                  </span>
                  {contextPct != null && (
                    <span style={{ fontSize: 8, color: "var(--text-muted)" }}>
                      %
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 7,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    Full
                  </span>
                </RadialGauge>
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 5,
                    alignContent: "start",
                  }}
                >
                  {(
                    [
                      {
                        label: "Current",
                        value:
                          slotCurrentTokens != null
                            ? slotCurrentTokens.toLocaleString()
                            : "\u2014",
                        accent: true,
                        span: false,
                        testId: "ctx-current",
                      },
                      {
                        label: "Max",
                        value:
                          slotCtx != null ? slotCtx.toLocaleString() : "\u2014",
                        accent: false,
                        span: false,
                        testId: "ctx-max",
                      },
                      {
                        label: "Remaining",
                        value:
                          slotCtx != null && slotCurrentTokens != null
                            ? (slotCtx - slotCurrentTokens).toLocaleString()
                            : "\u2014",
                        accent: false,
                        span: false,
                        testId: "ctx-remaining",
                      },
                      {
                        label: "Cache Hits",
                        value: String(cacheHits),
                        accent: false,
                        span: false,
                        testId: "ctx-cache-hits",
                      },
                      {
                        label: "Largest Seen",
                        value:
                          m?.context_tokens != null
                            ? m.context_tokens.toLocaleString()
                            : "\u2014",
                        accent: false,
                        span: true,
                        testId: "ctx-largest-seen",
                      },
                    ] as {
                      label: string;
                      value: string;
                      accent: boolean;
                      span: boolean;
                      testId?: string;
                    }[]
                  ).map(({ label, value, accent, span, testId }) => (
                    <div
                      key={label}
                      data-testid={testId}
                      style={{
                        ...accentTileBase,
                        borderRadius: 8,
                        padding: "6px 10px",
                        gridColumn: span ? "1 / -1" : undefined,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 8.5,
                          textTransform: "uppercase",
                          letterSpacing: "0.4px",
                          color: accentLabelColor,
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          fontFamily:
                            '"JetBrains Mono", "Fira Code", monospace',
                          marginTop: 2,
                          color: accent
                            ? "var(--accent-primary)"
                            : "var(--text-primary)",
                        }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Generation Progress strip */}
              {slot0 && slotCtx != null && (
                <div
                  style={{
                    paddingTop: 7,
                    borderTop:
                      "1px solid var(--border-light, var(--border-color))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Generation Progress
                    </span>
                    <span
                      data-testid="gen-status-badge"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 8,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 5,
                        background: slot0.is_processing
                          ? "color-mix(in srgb, var(--accent-primary) 12%, transparent)"
                          : "transparent",
                        color: slot0.is_processing
                          ? "var(--accent-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {slot0.is_processing && (
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: "var(--accent-primary)",
                            animation: "dot-pulse 1.8s ease-in-out infinite",
                          }}
                        />
                      )}
                      {slot0.is_processing ? "Generating" : "Idle"}
                    </span>
                  </div>
                  <div className="card-progress" style={{ height: 8 }}>
                    <div
                      data-testid="gen-progress-bar"
                      className={`card-progress-bar ${thresholdClass((genProgressPct ?? lastGenProgress) > 0 ? (genProgressPct ?? lastGenProgress) : null)}`}
                      style={{ width: `${genProgressPct ?? lastGenProgress}%` }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 8,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {(() => {
                      const nd = slot0.n_decoded;
                      const np = slot0.n_predict;
                      const nr = slot0.n_remain;
                      const unbounded = np == null || np <= 0;
                      return unbounded ? (
                        <span>
                          {nd != null ? nd.toLocaleString() : "\u2014"} token
                        </span>
                      ) : (
                        <>
                          <span>
                            {nd != null ? nd.toLocaleString() : "\u2014"} /{" "}
                            {np.toLocaleString()} token
                          </span>
                          <span>
                            Remaining{" "}
                            {nr != null ? nr.toLocaleString() : "\u2014"}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </PanelCard>
        </div>

        {/* ══════════════════════════════════════════════════
            LOWER ROW: Left rail | Work area
            ══════════════════════════════════════════════════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(250px, 1fr) minmax(0, 3fr)",
            gap: 9,
            flex: 1,
            minHeight: 0,
            alignItems: "stretch",
          }}
        >
          {/* ── Left Rail ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* Runtime card */}
            <PanelCard style={{ flex: 1, minHeight: 0 }}>
              <PanelHead
                icon={<Activity size={13} />}
                title="Runtime"
                right={
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: "var(--border-color)",
                    }}
                  >
                    04
                  </span>
                }
              />
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "6px 13px 8px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  alignContent: "start",
                }}
              >
                {kvRow(
                  <Server size={11} />,
                  "Server",
                  llamaOnline ? "Online" : "Offline",
                  llamaOnline ? "var(--success)" : "var(--text-muted)",
                  "runtime-server",
                )}
                {kvRow(
                  <Clock3 size={11} />,
                  "Uptime",
                  fmtUptime(proc?.uptime_seconds),
                  undefined,
                  "runtime-uptime",
                )}
                {kvRow(
                  <Zap size={11} />,
                  "Load Time",
                  m?.model_load_time_ms != null
                    ? `${(m.model_load_time_ms / 1000).toFixed(2)}s`
                    : "\u2014",
                  undefined,
                  "runtime-load-time",
                )}
                {kvRow(
                  <Fingerprint size={11} />,
                  "PID",
                  proc?.pid != null ? String(proc.pid) : "\u2014",
                  undefined,
                  "runtime-pid",
                )}
                {kvRow(
                  <Globe size={11} />,
                  "Port",
                  runningArgs?.port != null
                    ? String(runningArgs.port)
                    : "\u2014",
                  undefined,
                  "runtime-port",
                )}
                {kvRow(
                  <MemoryStick size={11} />,
                  "Memory",
                  fmtKb(proc?.memory_kb),
                  undefined,
                  "runtime-memory",
                )}
                {kvRow(
                  <Cpu size={11} />,
                  "CPU",
                  proc?.cpu_percent != null
                    ? `${proc.cpu_percent.toFixed(1)}%`
                    : "\u2014",
                  undefined,
                  "runtime-cpu",
                )}
                {kvRow(
                  <Brain size={11} />,
                  "Context",
                  slotCtx != null ? formatCtx(slotCtx) : "\u2014",
                  undefined,
                  "runtime-context",
                )}
                {kvRow(
                  <MonitorCog size={11} />,
                  "GPU Layers",
                  gpuTotalLoaded != null && gpuTotalLayers != null
                    ? `${gpuTotalLoaded} / ${gpuTotalLayers}`
                    : "\u2014",
                  gpuOffloadPct === 100 ? "var(--success)" : undefined,
                  "runtime-gpu-layers",
                )}
                {kvRow(
                  <Layers size={11} />,
                  "CPU Layers",
                  gpuOffload != null
                    ? `${gpuOffload.main_total - gpuOffload.main_loaded} / ${gpuOffload.main_total}`
                    : "\u2014",
                  gpuOffload != null &&
                    gpuOffload.main_loaded === gpuOffload.main_total
                    ? "var(--success)"
                    : undefined,
                  "runtime-cpu-layers",
                )}
                {kvRow(
                  <Layers size={11} />,
                  "Draft Layers",
                  hasDraft && gpuOffload != null
                    ? `${gpuOffload.draft_loaded} / ${gpuOffload.draft_total}`
                    : "\u2014",
                  hasDraft ? "var(--success)" : undefined,
                  "runtime-draft-layers",
                )}
                {kvRow(
                  <Zap size={11} />,
                  "Speculative",
                  boolLabel(m?.speculative),
                  m?.speculative ? "var(--success)" : undefined,
                  "runtime-speculative",
                )}
                {kvRow(
                  <Database size={11} />,
                  "Tokens Cached",
                  fmtNum(slot0?.n_prompt_tokens_cache ?? m?.tokens_cached),
                  undefined,
                  "runtime-tokens-cached",
                  true,
                )}
              </div>
            </PanelCard>

            {/* llama.cpp card */}
            <PanelCard style={{ flexShrink: 0 }}>
              <PanelHead
                icon={<Package size={13} />}
                title="llama.cpp"
                right={
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      color: "var(--border-color)",
                    }}
                  >
                    05
                  </span>
                }
              />
              <div
                style={{
                  padding: "10px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Build boxes */}
                <div style={{ display: "flex", gap: 7 }}>
                  <div
                    style={{
                      flex: 1,
                      ...accentTileBase,
                      borderRadius: 10,
                      padding: "7px 10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 8,
                        textTransform: "uppercase",
                        color: accentLabelColor,
                      }}
                    >
                      Current
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        marginTop: 1,
                      }}
                    >
                      {mgmt.repoInfo?.local_build_tag || "\u2014"}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      ...accentTileBase,
                      borderRadius: 10,
                      padding: "7px 10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 8,
                        textTransform: "uppercase",
                        color: accentLabelColor,
                      }}
                    >
                      Latest
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        marginTop: 1,
                        color: "var(--accent-primary)",
                      }}
                    >
                      {mgmt.repoInfo?.latest_build_tag || "\u2014"}
                    </div>
                  </div>
                </div>

                {/* N behind + Update button */}
                {behind != null && behind > 0 && (
                  <div
                    data-testid="builds-behind-banner"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background:
                        "color-mix(in srgb, var(--warning) 10%, transparent)",
                      border:
                        "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                      color: "var(--warning)",
                      borderRadius: 9,
                      padding: "5px 10px",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  >
                    <TriangleAlert
                      size={11}
                      style={{
                        flexShrink: 0,
                        animation: "pulse 2s ease-in-out infinite",
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      {behind} build{behind === 1 ? "" : "s"} behind
                    </span>
                    <button
                      onClick={mgmt.runUpdate}
                      disabled={!hasDir || mgmt.updateState === "running"}
                      style={{
                        background: "var(--accent-fill)",
                        backgroundSize: "var(--accent-fill-size, 200% 200%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 7,
                        padding: "3px 10px",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor:
                          !hasDir || mgmt.updateState === "running"
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          !hasDir || mgmt.updateState === "running" ? 0.5 : 1,
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <RefreshCw
                        size={9}
                        className={
                          mgmt.updateState === "running" ? "spin" : undefined
                        }
                      />
                      Update
                    </button>
                  </div>
                )}

                {/* Update progress bar */}
                {mgmt.updateState !== "idle" && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {mgmt.updateState === "running" && (
                      <Loader2
                        size={10}
                        className="spin"
                        style={{
                          color: "var(--accent-primary)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      data-testid="update-state-text"
                      style={{
                        fontSize: 10,
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
                        height: 4,
                        borderRadius: 2,
                        background: "var(--bg-secondary)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        data-testid="update-progress-bar"
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
                      data-testid="update-progress-pct"
                      style={{
                        fontSize: 10,
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
                        gap: 3,
                        padding: "2px 5px",
                        fontSize: 9,
                        fontWeight: 600,
                        ...accentTileBase,
                        borderRadius: 5,
                        cursor: "pointer",
                        color: accentLabelColor,
                        flexShrink: 0,
                      }}
                    >
                      <ExternalLink size={8} />
                      Log
                    </button>
                  </div>
                )}

                {/* Terminal / Readme / Release buttons */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 6,
                  }}
                >
                  <button
                    onClick={() => mgmt.openTerminal()}
                    disabled={!hasDir}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      ...accentTileBase,
                      borderRadius: 10,
                      fontSize: 9,
                      color: !hasDir ? "var(--text-muted)" : accentLabelColor,
                      cursor: !hasDir ? "not-allowed" : "pointer",
                      opacity: !hasDir ? 0.4 : 1,
                      fontWeight: 500,
                      fontFamily: "inherit",
                    }}
                  >
                    <TermIcon size={12} style={{ color: "inherit" }} />
                    Terminal
                  </button>
                  <button
                    onClick={() =>
                      mgmt.readmeUrl &&
                      window.open(
                        mgmt.readmeUrl,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    disabled={!mgmt.readmeUrl}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      ...accentTileBase,
                      borderRadius: 10,
                      fontSize: 9,
                      color: !mgmt.readmeUrl
                        ? "var(--text-muted)"
                        : accentLabelColor,
                      cursor: !mgmt.readmeUrl ? "not-allowed" : "pointer",
                      opacity: !mgmt.readmeUrl ? 0.4 : 1,
                      fontWeight: 500,
                      fontFamily: "inherit",
                    }}
                  >
                    <BookOpen size={12} style={{ color: "inherit" }} />
                    Readme
                  </button>
                  <a
                    href="https://github.com/ggml-org/llama.cpp/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      ...accentTileBase,
                      borderRadius: 10,
                      fontSize: 9,
                      color: accentLabelColor,
                      cursor: "pointer",
                      fontWeight: 500,
                      textDecoration: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    <ArrowDown size={12} style={{ color: "inherit" }} />
                    Release
                  </a>
                </div>
              </div>
            </PanelCard>
          </div>

          {/* ── Work area: Run Models + Console ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              minHeight: 0,
            }}
          >
            {/* Run Models */}
            <div
              data-accent-el=""
              style={{
                flex: "none",
                height: 204,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card), var(--card-glow), var(--card-halo)",
                background: `linear-gradient(90deg, var(--accent-tint-10), transparent 200px), var(--bg-card)`,
              }}
            >
              <span className="accent-spine" style={SPINE_STYLE} />
              <RunModelsSection />
            </div>

            {/* Console */}
            <div
              data-accent-el=""
              style={{
                flex: 1,
                minHeight: 0,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card), var(--card-glow), var(--card-halo)",
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
