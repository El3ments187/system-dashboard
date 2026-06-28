import React, { useState, useEffect, useCallback, useRef } from "react";
import { useMetricsContext } from "../context/MetricsContext";
import LogConsole from "../components/LogConsole";
import MetricTile from "../components/shared/MetricTile";
import Sparkline from "../components/shared/Sparkline";
import UpdateOutputModal from "../components/UpdateOutputModal";
import {
  useLlamaCppManagement,
  type LlamaCppManagement,
} from "../hooks/useLlamaCppManagement";
import {
  BrainCircuit,
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
  FileText,
  ChevronLeft,
  ChevronRight,
  Server,
  Package,
  Brain,
  BarChart3,
  Gauge,
  Database,
  Clock3,
  Fingerprint,
  Zap,
  GitBranch,
  GitCommitHorizontal,
  Tag,
  Layers,
  MonitorCog,
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

// ─── Constants ───────────────────────────────────────────────────────────────

const SPEC_LABELS: Record<string, string> = {
  draft: "Draft",
  "draft-mtp": "MTP",
  eagle: "EAGLE",
  eagle3: "EAGLE-3",
};

// ─── Utility exports (preserved) ─────────────────────────────────────────────

export function formatCtx(contextSize?: number | null): string {
  if (contextSize == null || contextSize <= 0) return "\u2014";
  return `${Math.round(contextSize / 1024)}K`;
}

export function formatGB(mb?: number | null): string {
  if (mb == null) return "\u2014";
  return `${(mb / 1024).toFixed(1)}G`;
}

export function formatTps(tps?: number | null): string {
  if (tps == null) return "\u2014";
  return `${Math.round(tps)}`;
}

export function specLabel(specType?: string | null): string {
  if (!specType) return "None";
  return SPEC_LABELS[specType] ?? "Other";
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useViewportWidth(): number {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1600,
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ─── Shared sub-components ───────────────────────────────────────────────────

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
        borderRadius: 3,
        padding: "1px 4px",
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
        }}
      />
      {label}
    </span>
  );
}

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
            fontSize: 9,
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
        gap: 4,
        padding: "2px 6px",
        borderRadius: "var(--radius-sm)",
        background: on
          ? "rgba(var(--success-rgb, 34,197,94),0.1)"
          : "var(--bg-secondary)",
        border: `1px solid ${on ? "rgba(var(--success-rgb, 34,197,94),0.3)" : "var(--border-color)"}`,
        color: on ? "var(--success)" : "var(--text-muted)",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 12,
          height: 12,
          borderRadius: 3,
          background: on
            ? "rgba(var(--success-rgb, 34,197,94),0.18)"
            : "transparent",
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textShadow: "var(--text-shadow-sm)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SidebarSection({
  title,
  icon,
  accentColor,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle, var(--border-color))",
        borderLeft: accentColor
          ? `2px solid ${accentColor}`
          : "1px solid var(--border-subtle, var(--border-color))",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "3px 8px",
          borderBottom: "1px solid var(--border-subtle, var(--border-color))",
          background: "var(--bg-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {icon}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: "4px 8px" }}>{children}</div>
    </div>
  );
}

// ─── RunModelsSection (preserved export) ─────────────────────────────────────

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
                borderRadius: 3,
                background: "var(--bg-tertiary)",
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
                  fontFamily: "monospace",
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
            borderRadius: 3,
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
          background: "var(--bg-tertiary)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9,
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
                fontSize: 9,
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
              {isActiveSort && sortConfig.direction === "asc" && " \u2191"}
              {isActiveSort && sortConfig.direction === "desc" && " \u2193"}
              {!isActiveSort && " \u2195"}
            </button>
          );
        })}
        <span
          style={{
            fontSize: 9,
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
          <span style={{ fontSize: 9, color: "var(--danger)" }}>{error}</span>
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
          }}
        >
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
              rowBg = "rgba(var(--success-rgb, 34,197,94),0.06)";
            } else if (idx % 2 === 1) {
              rowBg = "rgba(255,255,255,0.015)";
            }
            const modelNameStyle: React.CSSProperties = running
              ? { fontWeight: 700, color: "var(--success)" }
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
                  background: rowBg,
                  alignItems: "center",
                  minHeight: 26,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
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
                    fontFamily: "monospace",
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
                    fontFamily: "monospace",
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
                    fontFamily: "monospace",
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
                    fontFamily: "monospace",
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
                        ? "var(--accent-primary)"
                        : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: "monospace",
                  }}
                >
                  {formatGB(vram)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: ram != null ? "var(--warning)" : "var(--text-muted)",
                    textAlign: "center",
                    fontFamily: "monospace",
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
                    fontFamily: "monospace",
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
                    fontFamily: "monospace",
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
                        gap: 3,
                        padding: "2px 6px",
                        fontSize: 9,
                        fontWeight: 600,
                        background: "var(--danger)",
                        border: "none",
                        borderRadius: 2,
                        cursor: "pointer",
                        color: "#fff",
                      }}
                    >
                      <Square size={8} /> Stop
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
                        gap: 3,
                        padding: "2px 6px",
                        fontSize: 9,
                        fontWeight: 600,
                        background: "var(--success)",
                        border: "none",
                        borderRadius: 2,
                        cursor: "pointer",
                        color: "#fff",
                      }}
                    >
                      <Play size={8} /> Run
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Stats */}
      {profiles.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 12px",
            borderTop: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {profiles.filter((p: LaunchProfile) => isRunning(p)).length} running
            / {profiles.length} total
          </span>
          {scanDir && (
            <span
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
            >
              {scanDir}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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

function addDragListeners(
  isDragging: React.MutableRefObject<boolean>,
  onMove: (ev: MouseEvent) => void,
): void {
  const onUp = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

export function fmtUptime(sec: number | null | undefined): string {
  if (sec == null) return "\u2014";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export function fmtKb(kb: number | null | undefined): string {
  if (kb == null) return "\u2014";
  if (kb < 1024) return `${Math.round(kb)} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

export function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "\u2014";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function calcBuildsBehind(
  local?: string | null,
  latest?: string | null,
): number | null {
  if (!local || !latest) return null;
  const lm = local.match(/b?(\d+)/);
  const rm = latest.match(/b?(\d+)/);
  if (!lm || !rm) return null;
  const diff = parseInt(rm[1], 10) - parseInt(lm[1], 10);
  return diff > 0 ? diff : 0;
}

// ─── Reusable key-value row ───────────────────────────────────────────────────

function KvRow({
  label,
  value,
  color,
}: {
  label: React.ReactNode;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        marginBottom: 2,
        gap: 4,
      }}
    >
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: color ?? "var(--text-primary)",
          fontFamily: "monospace",
          fontWeight: 700,
          textAlign: "right",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Runtime info sidebar section ─────────────────────────────────────────────

interface RuntimeInfoProps {
  llamaOnline: boolean;
  processUptimeSecs?: number | null;
  processPid?: number | null;
  processCpuPct?: number | null;
  processMemoryKb?: number | null;
  runningPort?: number | null;
  maxContext?: number | null;
  modelAlias?: string | null;
  modelFile?: string | null;
  seed?: number | null;
  reasoningFormat?: string | null;
  speculative?: boolean | null;
  gpuOffload?: GpuOffloadInfo | null;
  loadTimeSecs?: number | null;
  tokensCached?: number | null;
  totalTokensSent?: number | null;
}

function RuntimeInfoSection({
  llamaOnline,
  processUptimeSecs,
  processPid,
  processCpuPct,
  processMemoryKb,
  runningPort,
  maxContext,
  modelAlias,
  modelFile,
  seed,
  reasoningFormat,
  speculative,
  gpuOffload,
  loadTimeSecs,
  tokensCached,
  totalTokensSent,
}: RuntimeInfoProps) {
  const gpuTotalLoaded =
    gpuOffload != null
      ? gpuOffload.main_loaded + (gpuOffload.draft_loaded ?? 0)
      : null;
  const gpuTotalLayers =
    gpuOffload != null
      ? gpuOffload.main_total + (gpuOffload.draft_total ?? 0)
      : null;
  const gpuPct =
    gpuTotalLayers != null && gpuTotalLayers > 0
      ? Math.round((gpuTotalLoaded! / gpuTotalLayers) * 100)
      : 0;
  const hasDraft =
    gpuOffload != null &&
    gpuOffload.draft_loaded != null &&
    gpuOffload.draft_total != null;

  const ic = (icon: React.ReactNode, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {icon}
      {text}
    </span>
  );

  return (
    <SidebarSection
      title="Runtime Information"
      icon={<Activity size={10} style={{ color: "var(--text-muted)" }} />}
      accentColor="rgba(59,130,246,0.6)"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          columnGap: 8,
        }}
      >
        {/* Left: identity */}
        <div>
          <KvRow
            label={ic(
              <Server
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Server",
            )}
            value={llamaOnline ? "Online" : "Offline"}
            color={llamaOnline ? "var(--success)" : "var(--text-muted)"}
          />
          <KvRow
            label={ic(
              <Fingerprint
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "PID",
            )}
            value={processPid != null ? String(processPid) : "\u2014"}
          />
          <KvRow
            label={ic(
              <Globe
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Port",
            )}
            value={runningPort != null ? String(runningPort) : "\u2014"}
          />
          <KvRow
            label={ic(
              <Brain
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Context",
            )}
            value={maxContext != null ? formatCtx(maxContext) : "\u2014"}
          />
          {speculative != null && (
            <KvRow
              label="Speculative"
              value={speculative ? "Yes" : "No"}
              color={speculative ? "var(--success)" : "var(--text-muted)"}
            />
          )}
          {reasoningFormat != null &&
            reasoningFormat !== "none" &&
            reasoningFormat !== "" && (
              <KvRow
                label="Thinking"
                value={reasoningFormat}
                color="var(--accent-primary)"
              />
            )}
          {seed != null && seed !== 4294967295 && (
            <KvRow label="Seed" value={String(seed)} />
          )}
          {modelAlias && (
            <KvRow
              label={ic(
                <Tag
                  size={10}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />,
                "Alias",
              )}
              value={modelAlias}
            />
          )}
          {modelFile && (
            <KvRow
              label={ic(
                <Package
                  size={10}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />,
                "Model",
              )}
              value={modelFile}
            />
          )}
        </div>
        {/* Right: runtime stats */}
        <div>
          <KvRow
            label={ic(
              <Clock3
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Uptime",
            )}
            value={fmtUptime(processUptimeSecs)}
          />
          {processCpuPct != null && (
            <KvRow label="CPU" value={`${processCpuPct.toFixed(1)}%`} />
          )}
          <KvRow
            label={ic(
              <MemoryStick
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Memory",
            )}
            value={processMemoryKb != null ? fmtKb(processMemoryKb) : "—"}
          />
          {hasDraft && gpuOffload != null && (
            <>
              <KvRow
                label={ic(
                  <Cpu
                    size={10}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />,
                  "CPU Layers",
                )}
                value={`${gpuOffload.main_loaded}/${gpuOffload.main_total}`}
              />
              <KvRow
                label={ic(
                  <Layers
                    size={10}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />,
                  "Draft Layers",
                )}
                value={`${gpuOffload.draft_loaded}/${gpuOffload.draft_total}`}
              />
            </>
          )}
          {gpuOffload != null &&
            gpuTotalLoaded != null &&
            gpuTotalLayers != null && (
              <KvRow
                label={ic(
                  <MonitorCog
                    size={10}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />,
                  "GPU Layers",
                )}
                value={`${gpuTotalLoaded}/${gpuTotalLayers} (${gpuPct}%)`}
                color={gpuPct === 100 ? "var(--success)" : "var(--text-muted)"}
              />
            )}
          <KvRow
            label={ic(
              <Zap
                size={10}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />,
              "Load Time",
            )}
            value={loadTimeSecs != null ? `${loadTimeSecs.toFixed(2)}s` : "—"}
          />
          <KvRow label="Total Sent" value={fmtNum(totalTokensSent) || "—"} />
          <KvRow label="Tokens Cached" value={fmtNum(tokensCached) || "—"} />
        </div>
      </div>
    </SidebarSection>
  );
}

// ─── Server activity sidebar section ──────────────────────────────────────────

// ─── Sidebar content panels ───────────────────────────────────────────────────

interface LlamaCppSidebarContentProps {
  // Context
  contextTokens: number | null;
  maxContext: number | null;
  contextPct: number | null;
  ctxColor: string;
  largestContext: number | null;
  remainingContext: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  // Generation
  genTps?: number | null;
  promptTps?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  temperature?: number | null;
  topK?: number | null;
  topP?: number | null;
  repeatPenalty?: number | null;
  minP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  repeatLastN?: number | null;
  runningBatchSize?: number | null;
  runningThreads?: number | null;
  runningCacheReuse?: number | null;
  // KV cache
  kvCacheUsagePct?: number | null;
  promptBufferPct?: number | null;
  gpuCachePct?: number | null;
  gpuMemUsedMb?: number | null;
  gpuMemFreeMb?: number | null;
  kvReservedMib?: number | null;
  kvUsedMib?: number | null;
}

function LlamaCppSidebarContent({
  contextTokens,
  maxContext,
  contextPct,
  ctxColor,
  largestContext,
  remainingContext,
  cachedTokens,
  totalTokens,
  genTps,
  promptTps,
  promptTokens,
  completionTokens,
  temperature,
  topK,
  topP,
  repeatPenalty,
  minP,
  presencePenalty,
  frequencyPenalty,
  repeatLastN,
  runningBatchSize,
  runningThreads,
  runningCacheReuse,
  kvCacheUsagePct,
  promptBufferPct,
  gpuCachePct,
  gpuMemUsedMb,
  gpuMemFreeMb,
  kvReservedMib,
  kvUsedMib,
}: LlamaCppSidebarContentProps) {
  const showExtraTokens = cachedTokens != null || totalTokens != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SidebarSection title="Context">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            marginBottom: 6,
          }}
        >
          <MetricTile
            label="Current"
            value={fmtNum(contextTokens)}
            unit=" tok"
            color={ctxColor}
          />
          <MetricTile label="Max" value={fmtNum(maxContext)} unit=" tok" />
          <MetricTile
            label="Largest Seen"
            value={fmtNum(largestContext)}
            unit=" tok"
          />
          <MetricTile
            label="Remaining"
            value={fmtNum(remainingContext)}
            unit=" tok"
          />
        </div>
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              marginBottom: 2,
            }}
          >
            Usage
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--bg-tertiary)",
              overflow: "hidden",
              marginBottom: 3,
            }}
          >
            <div
              style={{
                width: `${contextPct ?? 0}%`,
                height: "100%",
                borderRadius: 3,
                background: ctxColor,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 8,
              color: "var(--text-muted)",
              marginBottom: 3,
            }}
          >
            <span>0%</span>
            <span style={{ fontWeight: 700, color: ctxColor }}>
              {(contextPct ?? 0).toFixed(1)}%
            </span>
            <span>100%</span>
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
            <span style={{ color: ctxColor, fontWeight: 700 }}>
              {(contextTokens ?? 0).toLocaleString()}
            </span>
            {" / "}
            {(maxContext ?? 0).toLocaleString()} tokens
          </div>
        </div>
        {showExtraTokens && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              marginTop: 4,
            }}
          >
            <MetricTile
              label="Cached Tok"
              value={fmtNum(cachedTokens)}
              unit=" tok"
            />
            <MetricTile
              label="Total Tok"
              value={fmtNum(totalTokens)}
              unit=" tok"
            />
          </div>
        )}
        <>
          <div
            style={{
              marginTop: 8,
              borderTop: "1px solid var(--border-color)",
              paddingTop: 6,
              marginBottom: 4,
              fontSize: 9,
              color: "var(--text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            KV Cache
          </div>
          {(kvCacheUsagePct != null ||
            promptBufferPct != null ||
            gpuCachePct != null) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 4,
                marginBottom: 4,
              }}
            >
              {kvCacheUsagePct != null && (
                <MetricTile
                  label="KV Cache"
                  value={kvCacheUsagePct.toFixed(1)}
                  unit="%"
                />
              )}
              {promptBufferPct != null && (
                <MetricTile
                  label="Prompt Buf"
                  value={promptBufferPct.toFixed(1)}
                  unit="%"
                />
              )}
              {gpuCachePct != null && (
                <MetricTile
                  label="GPU Cache"
                  value={gpuCachePct.toFixed(1)}
                  unit="%"
                />
              )}
            </div>
          )}
          {gpuMemUsedMb != null && (
            <KvRow
              label="GPU Mem Used"
              value={`${(gpuMemUsedMb / 1024).toFixed(1)} GB`}
              color="var(--accent-primary)"
            />
          )}
          {gpuMemFreeMb != null && (
            <KvRow
              label="GPU Mem Free"
              value={`${(gpuMemFreeMb / 1024).toFixed(1)} GB`}
            />
          )}
          <KvRow
            label="Memory Used"
            value={kvUsedMib != null ? `${kvUsedMib.toFixed(1)} MiB` : "—"}
            color={kvUsedMib != null ? "var(--accent-primary)" : undefined}
          />
          <KvRow
            label="Memory Reserved"
            value={
              kvReservedMib != null ? `${kvReservedMib.toFixed(1)} MiB` : "—"
            }
          />
        </>
      </SidebarSection>

      <SidebarSection title="Generation & Performance">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
          }}
        >
          <MetricTile label="Gen TPS" value={fmtNum(genTps)} unit=" tok/s" />
          <MetricTile
            label="Prompt TPS"
            value={fmtNum(promptTps)}
            unit=" tok/s"
          />
          <MetricTile label="Prompt" value={fmtNum(promptTokens)} unit=" tok" />
          <MetricTile
            label="Generated"
            value={fmtNum(completionTokens)}
            unit=" tok"
          />
          <MetricTile
            label="Temperature"
            value={temperature != null ? temperature.toFixed(2) : null}
          />
          <MetricTile label="Top-K" value={fmtNum(topK)} />
          <MetricTile
            label="Top-P"
            value={topP != null ? topP.toFixed(2) : null}
          />
          <MetricTile
            label="Repeat Pen"
            value={repeatPenalty != null ? repeatPenalty.toFixed(2) : null}
          />
          <MetricTile
            label="Min-P"
            value={minP != null ? minP.toFixed(3) : null}
          />
          <MetricTile
            label="Presence Pen"
            value={presencePenalty != null ? presencePenalty.toFixed(2) : null}
          />
          <MetricTile
            label="Freq Pen"
            value={
              frequencyPenalty != null ? frequencyPenalty.toFixed(2) : null
            }
          />
          <MetricTile label="Repeat N" value={fmtNum(repeatLastN)} />
          <MetricTile label="Batch Size" value={fmtNum(runningBatchSize)} />
          <MetricTile label="Threads" value={fmtNum(runningThreads)} />
          <MetricTile label="Cache Reuse" value={fmtNum(runningCacheReuse)} />
        </div>
      </SidebarSection>
    </div>
  );
}

// ─── Stacked sidebar (900–1099px) ────────────────────────────────────────────

interface LlamaCppStackedSidebarProps {
  contextTokens: number | null;
  maxContext: number | null;
  contextPct: number | null;
  ctxColor: string;
  largestContext: number | null;
  remainingContext: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  genTps?: number | null;
  promptTps?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  temperature?: number | null;
  topK?: number | null;
  topP?: number | null;
  repeatPenalty?: number | null;
  minP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  repeatLastN?: number | null;
  runningBatchSize?: number | null;
  runningThreads?: number | null;
  kvUsedMib?: number | null;
  kvReservedMib?: number | null;
}

function LlamaCppStackedSidebar({
  contextTokens,
  maxContext,
  contextPct,
  ctxColor,
  largestContext,
  remainingContext,
  cachedTokens,
  totalTokens,
  genTps,
  promptTps,
  promptTokens,
  completionTokens,
  temperature,
  topK,
  topP,
  repeatPenalty,
  minP,
  presencePenalty,
  frequencyPenalty,
  repeatLastN,
  runningBatchSize,
  runningThreads,
  kvUsedMib,
  kvReservedMib,
}: LlamaCppStackedSidebarProps) {
  const showExtraTokens = cachedTokens != null || totalTokens != null;
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexShrink: 0,
        flexWrap: "wrap",
        marginBottom: 6,
      }}
    >
      <div style={{ flex: "1 1 200px" }}>
        <SidebarSection
          title="Context"
          icon={<Brain size={10} style={{ color: "var(--text-muted)" }} />}
          accentColor="rgba(59,130,246,0.6)"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              marginBottom: 6,
            }}
          >
            <MetricTile
              label="Current"
              value={fmtNum(contextTokens)}
              unit=" tok"
              color={ctxColor}
            />
            <MetricTile label="Max" value={fmtNum(maxContext)} unit=" tok" />
            <MetricTile
              label="Largest Seen"
              value={fmtNum(largestContext)}
              unit=" tok"
            />
            <MetricTile
              label="Remaining"
              value={fmtNum(remainingContext)}
              unit=" tok"
            />
          </div>
          {contextPct != null && (
            <>
              <div
                style={{
                  height: 5,
                  borderRadius: 3,
                  background: "var(--bg-tertiary)",
                  overflow: "hidden",
                  marginBottom: 2,
                }}
              >
                <div
                  style={{
                    width: `${contextPct}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: ctxColor,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 8,
                  color: "var(--text-muted)",
                  marginBottom: showExtraTokens ? 6 : 0,
                }}
              >
                <span>0%</span>
                <span style={{ fontWeight: 700, color: ctxColor }}>
                  {contextPct.toFixed(1)}%
                </span>
                <span>100%</span>
              </div>
            </>
          )}
          {showExtraTokens && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 4,
              }}
            >
              <MetricTile
                label="Cached Tok"
                value={fmtNum(cachedTokens)}
                unit=" tok"
              />
              <MetricTile
                label="Total Tok"
                value={fmtNum(totalTokens)}
                unit=" tok"
              />
            </div>
          )}
          {maxContext != null &&
            (() => {
              const tokens = contextTokens ?? 0;
              const usagePct = maxContext > 0 ? (tokens / maxContext) * 100 : 0;
              const filled = Math.min(20, Math.round((usagePct / 100) * 20));
              const bar = "█".repeat(filled) + "░".repeat(20 - filled);
              return (
                <div style={{ marginTop: 6 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--text-muted)",
                      marginBottom: 2,
                    }}
                  >
                    Usage
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 9,
                      color: ctxColor,
                      marginBottom: 2,
                    }}
                  >
                    {bar} {Math.round(usagePct)}%
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                    <span style={{ color: ctxColor, fontWeight: 700 }}>
                      {tokens.toLocaleString()}
                    </span>
                    {" / "}
                    {maxContext.toLocaleString()} tokens
                  </div>
                  {kvReservedMib != null && (
                    <div style={{ marginTop: 6 }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--text-muted)",
                          marginBottom: 2,
                        }}
                      >
                        KV Cache
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: ctxColor,
                          fontFamily: "monospace",
                        }}
                      >
                        {(kvUsedMib ?? 0).toFixed(1)} /{" "}
                        {kvReservedMib.toFixed(1)} MiB
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </SidebarSection>
      </div>
      <div style={{ flex: "2 1 340px" }}>
        <SidebarSection
          title="Generation & Performance"
          icon={<BarChart3 size={10} style={{ color: "var(--text-muted)" }} />}
          accentColor="rgba(139,92,246,0.6)"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 4,
            }}
          >
            <MetricTile label="Gen TPS" value={fmtNum(genTps)} unit=" tok/s" />
            <MetricTile
              label="Prompt TPS"
              value={fmtNum(promptTps)}
              unit=" tok/s"
            />
            <MetricTile
              label="Prompt"
              value={fmtNum(promptTokens)}
              unit=" tok"
            />
            <MetricTile
              label="Generated"
              value={fmtNum(completionTokens)}
              unit=" tok"
            />
            <MetricTile
              label="Temperature"
              value={temperature != null ? temperature.toFixed(2) : null}
            />
            <MetricTile label="Top-K" value={fmtNum(topK)} />
            <MetricTile
              label="Top-P"
              value={topP != null ? topP.toFixed(2) : null}
            />
            <MetricTile
              label="Repeat Pen"
              value={repeatPenalty != null ? repeatPenalty.toFixed(2) : null}
            />
            <MetricTile
              label="Min-P"
              value={minP != null ? minP.toFixed(3) : null}
            />
            <MetricTile
              label="Presence Pen"
              value={
                presencePenalty != null ? presencePenalty.toFixed(2) : null
              }
            />
            <MetricTile
              label="Freq Pen"
              value={
                frequencyPenalty != null ? frequencyPenalty.toFixed(2) : null
              }
            />
            <MetricTile label="Repeat N" value={fmtNum(repeatLastN)} />
            <MetricTile label="Batch" value={fmtNum(runningBatchSize)} />
            <MetricTile label="Threads" value={fmtNum(runningThreads)} />
          </div>
        </SidebarSection>
      </div>
    </div>
  );
}

// ─── Sidebar panel with collapse + resize ────────────────────────────────────

function LlamaCppSidebarPanel({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("llama_sidebar_collapsed") === "true",
  );
  const [width, setWidth] = useState(() => {
    const s = localStorage.getItem("llama_sidebar_width");
    return s ? Math.min(680, Math.max(380, parseInt(s, 10))) : 480;
  });
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const newWidth = Math.min(
          680,
          Math.max(380, startWidth + (ev.clientX - startX)),
        );
        setWidth(newWidth);
        localStorage.setItem("llama_sidebar_width", String(newWidth));
      };
      addDragListeners(isDragging, onMove);
    },
    [width],
  );

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("llama_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexShrink: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          width: collapsed ? 0 : width,
          overflow: "hidden",
          transition: "width 0.15s ease",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflowY: collapsed ? "hidden" : "auto",
        }}
      >
        {!collapsed && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingRight: 2,
            }}
          >
            {children}
          </div>
        )}
      </div>
      <div
        style={{
          width: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
          cursor: collapsed ? "default" : "col-resize",
          userSelect: "none",
        }}
        onMouseDown={!collapsed ? handleDividerMouseDown : undefined}
      >
        <div
          style={{
            width: 1,
            height: "100%",
            background: "var(--border-color)",
          }}
        />
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            width: 16,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            borderRadius: 3,
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 0,
            zIndex: 1,
          }}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      </div>
    </div>
  );
}

// ─── Workspace: Run Models + Console ─────────────────────────────────────────

function LlamaCppWorkspace({ stackSidebar }: { stackSidebar: boolean }) {
  const [runModelsPct, setRunModelsPct] = useState(() => {
    const s = localStorage.getItem("llama_workspace_split");
    return s ? Math.min(80, Math.max(20, parseFloat(s))) : 55;
  });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const rect = workspace.getBoundingClientRect();
      const pct = Math.min(
        80,
        Math.max(20, ((ev.clientY - rect.top) / rect.height) * 100),
      );
      setRunModelsPct(pct);
      localStorage.setItem("llama_workspace_split", pct.toFixed(1));
    };
    addDragListeners(isDragging, onMove);
  }, []);

  return (
    <div
      ref={workspaceRef}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: stackSidebar ? 500 : 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--bg-secondary)",
      }}
    >
      <div
        style={{
          flexBasis: stackSidebar ? "auto" : `${runModelsPct}%`,
          flexShrink: 0,
          flexGrow: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 180,
        }}
      >
        <RunModelsSection />
      </div>
      {!stackSidebar && (
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            height: 5,
            background: "var(--border-color)",
            cursor: "row-resize",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
          title="Drag to resize"
        >
          <div
            style={{
              width: 32,
              height: 2,
              borderRadius: 1,
              background: "var(--text-muted)",
              opacity: 0.35,
            }}
          />
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 180,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <LogConsole />
      </div>
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────

interface LlamaCppPageHeaderProps {
  m: any;
  isMobile: boolean;
  mgmt: LlamaCppManagement;
  hasDir: boolean;
  runningArgs: ParsedScriptArgs | null;
}

function LlamaCppPageHeader({
  m,
  isMobile,
  mgmt,
  hasDir,
  runningArgs,
}: LlamaCppPageHeaderProps) {
  const llamaOnline: boolean = m?.llama_server?.available ?? false;
  const proc = m?.llama_server_process;
  const fullModelPath: string = m?.model_path || m?.model_alias || "";
  const modelFile = fullModelPath.includes("/")
    ? (fullModelPath.split("/").pop() ?? "")
    : fullModelPath;
  const modelAlias: string = m?.model_alias || "";
  const buildInfo: string = m?.build_info || "";
  const behind = calcBuildsBehind(
    mgmt.repoInfo?.local_build_tag,
    mgmt.repoInfo?.latest_build_tag,
  );

  const mgmtBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "3px 8px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 9.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    textShadow: "var(--text-shadow-sm)",
    textDecoration: "none",
  };
  const railBtnStyle: React.CSSProperties = {
    ...mgmtBtnStyle,
    width: "100%",
    justifyContent: "flex-start",
    lineHeight: 1,
    background: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
    border:
      "1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent)",
  };
  const railDisabledBtnStyle: React.CSSProperties = {
    ...railBtnStyle,
    opacity: 0.4,
    cursor: "not-allowed",
  };
  const railAccentBtnStyle: React.CSSProperties = {
    ...railBtnStyle,
    background: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
    border:
      "1px solid color-mix(in srgb, var(--accent-primary) 60%, transparent)",
    color: "var(--accent-primary)",
    fontWeight: 700,
  };
  let updateBtnStyle: React.CSSProperties;
  if (!hasDir) {
    updateBtnStyle = railDisabledBtnStyle;
  } else if (behind) {
    updateBtnStyle = railAccentBtnStyle;
  } else {
    updateBtnStyle = railBtnStyle;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        flexShrink: 0,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border-color)",
        marginBottom: 6,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}
    >
      {/* Left: model identity */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <BrainCircuit
            size={14}
            style={{ color: "var(--accent-primary)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            LLAMA.CPP
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: llamaOnline ? "var(--success)" : "var(--text-muted)",
              padding: "1px 5px",
              borderRadius: 3,
              background: llamaOnline
                ? "rgba(var(--success-rgb,34,197,94),0.12)"
                : "var(--bg-tertiary)",
              border: `1px solid ${llamaOnline ? "rgba(var(--success-rgb,34,197,94),0.3)" : "var(--border-color)"}`,
            }}
          >
            ● {llamaOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 3,
            textShadow: "var(--text-shadow-sm)",
          }}
          title={modelFile || modelAlias || "\u2014"}
        >
          {modelFile || modelAlias || "\u2014"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <CapPill
            icon={<Activity size={9} />}
            label="Metrics"
            enabled={m?.endpoint_metrics}
          />
          <CapPill icon={<Globe size={9} />} label="WebUI" enabled={m?.webui} />
          <CapPill icon={<Eye size={9} />} label="Vision" enabled={m?.vision} />
          <CapPill
            icon={<AudioLines size={9} />}
            label="Audio"
            enabled={m?.audio}
          />
          <CapPill
            icon={<VideoIcon size={9} />}
            label="Video"
            enabled={m?.video}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.5fr",
          gap: 6,
          flex: 3,
          minWidth: 0,
        }}
      >
        <RuntimeInfoSection
          llamaOnline={llamaOnline}
          processUptimeSecs={proc?.uptime_seconds}
          processPid={proc?.pid}
          processCpuPct={proc?.cpu_percent}
          processMemoryKb={proc?.memory_kb}
          runningPort={runningArgs?.port}
          maxContext={m?.max_context}
          modelAlias={modelAlias}
          modelFile={modelFile}
          seed={m?.seed}
          reasoningFormat={m?.reasoning_format}
          speculative={m?.speculative}
          gpuOffload={m?.gpu_offload}
          loadTimeSecs={
            m?.model_load_time_ms != null ? m.model_load_time_ms / 1000 : null
          }
          tokensCached={m?.tokens_cached}
          totalTokensSent={m?.total_tokens_sent}
        />

        {/* Right: status card */}
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderLeft: "2px solid rgba(139,92,246,0.6)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
            padding: "6px 8px",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 120px",
            gap: 0,
          }}
        >
          {/* Left: metadata + update progress */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 0,
              paddingRight: 8,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Package size={10} style={{ color: "var(--text-muted)" }} />
                Model / Build
              </div>
              {modelAlias && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>Alias</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {modelAlias}
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <Package
                    size={10}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />
                  Version
                </span>
                <span
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    fontWeight: 700,
                  }}
                >
                  {mgmt.llamaVersion || "\u2014"}
                </span>
              </div>
              {buildInfo && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>Build</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {buildInfo}
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Current Build</span>
                <span
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    fontWeight: 700,
                  }}
                >
                  {mgmt.llamaVersion || "\u2014"}
                </span>
              </div>
              {mgmt.repoInfo?.local_build_tag && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Local Tag</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {mgmt.repoInfo.local_build_tag}
                  </span>
                </div>
              )}
              {mgmt.repoInfo?.latest_build_tag && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Latest Release</span>
                  <span
                    style={{
                      color: "var(--success)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {mgmt.repoInfo.latest_build_tag}
                  </span>
                </div>
              )}
              {behind != null && behind > 0 && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--warning)",
                    fontWeight: 600,
                  }}
                >
                  {behind} build{behind === 1 ? "" : "s"} behind latest
                </div>
              )}
              {mgmt.gitInfo?.branch && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <GitBranch
                      size={10}
                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                    />
                    Branch
                  </span>
                  <span
                    style={{
                      color: "var(--accent-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {mgmt.gitInfo.branch}
                  </span>
                </div>
              )}
              {mgmt.gitInfo?.commit_hash && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <GitCommitHorizontal
                      size={10}
                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                    />
                    Commit
                  </span>
                  <span
                    style={{
                      color: "var(--accent-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {mgmt.gitInfo.commit_hash}
                  </span>
                </div>
              )}
              {m?.gguf_size_gib != null && (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>GGUF Size</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {(m.gguf_size_gib as number).toFixed(2)} GiB
                  </span>
                </div>
              )}
              {hasDir && (
                <div style={{ marginTop: 3 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      marginBottom: 1,
                    }}
                  >
                    <FolderOpen
                      size={9}
                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                    />
                    Working Directory
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={mgmt.dirPath}
                  >
                    {mgmt.dirPath}
                  </div>
                </div>
              )}
            </div>
            {mgmt.updateState !== "idle" && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {mgmt.updateState === "running" && (
                  <Loader2
                    size={10}
                    className="spin"
                    style={{ color: "var(--accent-primary)", flexShrink: 0 }}
                  />
                )}
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    flexShrink: 0,
                    color: updateStateColor(mgmt.updateState),
                  }}
                >
                  {(() => {
                    if (mgmt.updateState === "running") return "Updating\u2026";
                    if (mgmt.updateState === "done") return "Update complete";
                    return "Update failed";
                  })()}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 2,
                    background: "var(--bg-tertiary)",
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
                          : "var(--accent-primary)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    flexShrink: 0,
                    width: 24,
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
                    fontSize: 8.5,
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
          </div>
          {/* Right: action rail */}
          <div
            style={{
              borderLeft: "1px solid var(--border-subtle, var(--border-color))",
              paddingLeft: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <button
              onClick={mgmt.runUpdate}
              disabled={!hasDir || mgmt.updateState === "running"}
              style={updateBtnStyle}
            >
              <RefreshCw
                size={10}
                className={mgmt.updateState === "running" ? "spin" : undefined}
              />
              Update
            </button>
            <button
              onClick={() => mgmt.openTerminal()}
              disabled={!hasDir}
              style={!hasDir ? railDisabledBtnStyle : railBtnStyle}
            >
              <TermIcon size={10} />
              Terminal
            </button>
            {mgmt.ptsName && (
              <a
                href={`/ai/terminal?pts=${encodeURIComponent(mgmt.ptsName)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...railBtnStyle, textDecoration: "none" }}
                title="Open terminal in new tab"
              >
                <ExternalLink size={10} />
                Tab \u2197
              </a>
            )}
            <a
              href="https://github.com/ggml-org/llama.cpp"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...railBtnStyle, textDecoration: "none" }}
            >
              <ExternalLink size={10} />
              GitHub
            </a>
            <button
              onClick={() =>
                mgmt.readmeUrl &&
                window.open(mgmt.readmeUrl, "_blank", "noopener,noreferrer")
              }
              disabled={!mgmt.readmeUrl}
              style={!mgmt.readmeUrl ? railDisabledBtnStyle : railBtnStyle}
            >
              <BookOpen size={10} />
              Readme
            </button>
            <button
              onClick={() =>
                window.open(mgmt.buildNotesUrl, "_blank", "noopener,noreferrer")
              }
              style={railBtnStyle}
            >
              <FileText size={10} />
              Release Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hardware metrics footer ──────────────────────────────────────────────────

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
}: LlamaCppHardwareFooterProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexShrink: 0,
        borderTop: "1px solid var(--border-color)",
        padding: "10px 4px 2px",
        marginTop: 6,
      }}
    >
      <FooterStat
        icon={<Cpu size={13} />}
        label="CPU"
        value={cpuPct != null ? `${cpuPct.toFixed(1)}%` : "\u2014"}
        color="var(--success)"
        history={cpuHistory}
      />
      <FooterStat
        icon={<MemoryStick size={13} />}
        label="RAM"
        value={
          memUsed != null && memTotal != null
            ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB (${memPct?.toFixed(0) ?? "\u2014"}%)`
            : "\u2014"
        }
        color="var(--warning)"
        history={memoryHistory}
      />
      <FooterStat
        icon={<Gauge size={13} />}
        label="GPU"
        value={gpuPct != null ? `${gpuPct.toFixed(0)}%` : "\u2014"}
        color="var(--accent-primary)"
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
        color="var(--accent-primary)"
        history={gpuVramUtilHistory}
      />
      <FooterStat
        icon={<Thermometer size={13} />}
        label="GPU Temp"
        value={gpuTemp != null ? `${gpuTemp.toFixed(0)}\u00b0C` : "\u2014"}
        color="var(--danger)"
      />
    </div>
  );
}

function updateStateColor(state: string): string {
  if (state === "error") return "var(--danger)";
  if (state === "done") return "var(--success)";
  return "var(--accent-primary)";
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LlamaCppPage() {
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth < 900;
  const stackSidebar = viewportWidth < 1100;

  const {
    aiCurrentMetrics,
    cpuCurrentValues,
    memoryCurrentValues,
    gpuCurrentValues,
    cpuHistory,
    memoryHistory,
    gpuHistory,
    gpuVramUtilHistory,
  } = useMetricsContext();

  const mgmt = useLlamaCppManagement();

  const [runningArgs, setRunningArgs] = useState<ParsedScriptArgs | null>(null);
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
        } else {
          setRunningArgs(null);
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
  const tokenUsage = m?.token_usage;
  const contextTokens: number | null = m?.context_tokens ?? null;
  const maxContext: number | null = m?.max_context ?? null;
  const contextPct =
    contextTokens != null && maxContext != null && maxContext > 0
      ? Math.round((contextTokens / maxContext) * 1000) / 10
      : null;

  const [largestContext, setLargestContext] = useState<number | null>(null);
  if (
    contextTokens != null &&
    (largestContext === null || contextTokens > largestContext)
  ) {
    setLargestContext(contextTokens);
  }

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
  const remainingContext =
    maxContext != null && contextTokens != null
      ? maxContext - contextTokens
      : null;
  const sharedSidebarProps = {
    // Context
    contextTokens,
    maxContext,
    contextPct,
    ctxColor,
    largestContext,
    remainingContext,
    cachedTokens: tokenUsage?.cached_tokens,
    totalTokens: tokenUsage?.total_tokens,
    // Generation
    genTps: m?.gen_tps,
    promptTps: m?.prompt_tps,
    promptTokens: tokenUsage?.prompt_tokens,
    completionTokens: tokenUsage?.completion_tokens,
    temperature: m?.temperature,
    topK: m?.top_k,
    topP: m?.top_p,
    repeatPenalty: m?.repeat_penalty,
    frequencyPenalty: m?.frequency_penalty,
    repeatLastN: m?.repeat_last_n,
    minP: runningArgs?.min_p,
    presencePenalty: runningArgs?.presence_penalty,
    runningBatchSize: runningArgs?.batch_size,
    runningThreads: runningArgs?.threads,
    runningCacheReuse: runningArgs?.cache_reuse,
    // KV cache
    kvCacheUsagePct: m?.kv_cache_usage_percent,
    promptBufferPct: m?.prompt_buffer_usage_percent,
    gpuCachePct: kvStats?.gpu_cache_usage_pct,
    gpuMemUsedMb: kvStats?.used_gpu_memory_mb,
    gpuMemFreeMb: kvStats?.free_gpu_memory_mb,
    kvReservedMib: m?.kv_cache_reserved_mib ?? null,
    kvUsedMib:
      m?.kv_cache_reserved_mib != null && contextPct != null
        ? m.kv_cache_reserved_mib * (contextPct / 100)
        : null,
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: 8,
        gap: 0,
        overflow: "hidden",
      }}
    >
      {mgmt.toast && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 99999,
            padding: "6px 10px",
            borderRadius: 4,
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

      <LlamaCppPageHeader
        m={m}
        isMobile={isMobile}
        mgmt={mgmt}
        hasDir={hasDir}
        runningArgs={runningArgs}
      />

      {/* ── Middle: Sidebar + Workspace ── */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          gap: 0,
          flexDirection: stackSidebar ? "column" : "row",
          overflow: stackSidebar ? "auto" : "hidden",
        }}
      >
        {stackSidebar && !isMobile && (
          <LlamaCppStackedSidebar {...sharedSidebarProps} />
        )}

        {!stackSidebar && (
          <LlamaCppSidebarPanel>
            <LlamaCppSidebarContent {...sharedSidebarProps} />
          </LlamaCppSidebarPanel>
        )}

        <LlamaCppWorkspace stackSidebar={stackSidebar} />
      </div>

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
