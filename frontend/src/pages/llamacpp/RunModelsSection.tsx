import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  RefreshCw,
  AlertCircle,
  Play,
  Square,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import type {
  ProfileResponse,
  LaunchProfile,
  ProfileState,
  ProfileMetadata,
} from "../../types/metrics";
import {
  sortProfiles,
  type SortConfig,
  type SortColumn,
} from "../../utils/sorting";
import {
  formatCtx,
  formatGB,
  formatTps,
  specLabel,
  extractQuant,
} from "../llamaCppUtils";
import { StatusIndicator } from "./StatusIndicator";
import { rowBackground } from "./parts";

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
          data-accent-el=""
          onClick={() => loadProfiles()}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 600,
            background: "var(--accent-tint-10)",
            border: "1px solid var(--accent-tint-40)",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            color: "var(--accent-primary)",
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
        <div
          style={
            {
              flex: 1,
              overflowY: "auto",
              "--accent-count": String(Math.max(profiles.length, 1)),
            } as React.CSSProperties
          }
        >
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
                  ...({ "--el-index": String(idx) } as React.CSSProperties),
                  display: "grid",
                  gridTemplateColumns: COL_GRID,
                  gap: 0,
                  padding: "4px 12px",
                  borderBottom: "1px solid var(--accent-tint-40)",
                  borderLeft: running
                    ? "3px solid var(--accent-primary)"
                    : "2px solid var(--accent-primary)",
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
                  {meta?.params || "—"}
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
                  {derivedQuant || "—"}
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
