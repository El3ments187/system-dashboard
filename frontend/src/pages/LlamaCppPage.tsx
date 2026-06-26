import React, { useState, useEffect, useCallback, useRef } from "react";
import { useMetricsContext } from "../context/MetricsContext";
import LlamaCppCard from "../components/cards/LlamaCppCard";
import Sparkline from "../components/shared/Sparkline";
import {
  Cpu,
  MemoryStick,
  Gauge,
  Database,
  Thermometer,
  RefreshCw,
  Play,
  Square,
  FolderOpen,
  AlertCircle,
} from "lucide-react";
import type {
  ProfileResponse,
  LaunchProfile,
  ProfileState,
  ProfileMetadata,
} from "../types/metrics";

const SPEC_LABELS: Record<string, string> = {
  draft: "Draft",
  "draft-mtp": "MTP",
  eagle: "EAGLE",
  eagle3: "EAGLE-3",
};

function formatCtx(contextSize?: number | null): string {
  if (contextSize == null || contextSize <= 0) return "\u2014";
  return `${Math.round(contextSize / 1024)}K`;
}

function formatGB(mb?: number | null): string {
  if (mb == null) return "\u2014";
  return `${(mb / 1024).toFixed(1)}G`;
}

function formatTps(tps?: number | null): string {
  if (tps == null) return "\u2014";
  return `${Math.round(tps)}`;
}

function specLabel(specType?: string | null): string {
  if (!specType) return "None";
  return SPEC_LABELS[specType] ?? "Other";
}

export { formatCtx, formatGB, formatTps, specLabel };

function StatusIndicator({ status }: { status: string }) {
  let color: string;
  let label: string;
  switch (status) {
    case "running":
      color = "var(--success)";
      label = "Running";
      break;
    case "starting":
      color = "var(--warning)";
      label = "Starting";
      break;
    case "loading":
      color = "var(--accent-primary)";
      label = "Loading";
      break;
    case "failed":
      color = "var(--danger)";
      label = "Failed";
      break;
    default:
      color = "var(--text-muted)";
      label = "Stopped";
  }
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
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
  history?: any;
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

export function RunModelsSection() {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [states, setStates] = useState<Record<string, ProfileState>>({});
  const [metadata, setMetadata] = useState<Record<string, ProfileMetadata>>({});
  const [scanDir, setScanDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const hasActive = Object.values(states).some(
      (s) =>
        s.status === "running" ||
        s.status === "starting" ||
        s.status === "loading",
    );
    const ms = hasActive ? 1000 : 5000;
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

  const getProfileStatus = (profile: LaunchProfile): string => {
    return states[profile.script_path]?.status || "stopped";
  };

  const isRunning = (profile: LaunchProfile): boolean => {
    return getProfileStatus(profile) === "running";
  };

  const isActive = (profile: LaunchProfile): boolean => {
    const status = getProfileStatus(profile);
    return (
      status === "running" || status === "starting" || status === "loading"
    );
  };

  const formatLastRunDate = (dateStr?: string | null): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
          minHeight: 36,
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
          gridTemplateColumns:
            "24px 90px minmax(210px, 1fr) 70px 90px 70px 80px 80px 80px 70px 90px",
          gap: 0,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-tertiary)",
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
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          Status
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          Model
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Params
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Quant
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Ctx
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          VRAM
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          RAM
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Spec
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          TPS
        </span>
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
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {profiles.map((profile: LaunchProfile, idx: number) => {
            const running = isRunning(profile);
            const active = isActive(profile);
            const state = states[profile.script_path];
            const meta = profile.filename_meta;
            const profileMeta = metadata[profile.script_path];
            const specType = profile.parsed_args?.spec_type;
            // Prefer the live running peak/reading; fall back to the
            // historical value persisted in metadata once a profile has run.
            const vram = running
              ? (state?.peak_vram_mb ?? profileMeta?.peak_vram_mb)
              : profileMeta?.peak_vram_mb;
            const ram = running
              ? (state?.peak_ram_mb ?? profileMeta?.peak_ram_mb)
              : profileMeta?.peak_ram_mb;
            const tps = running
              ? (state?.current_tps ?? profileMeta?.avg_gen_tps)
              : profileMeta?.avg_gen_tps;

            return (
              <div
                key={profile.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "24px 90px minmax(210px, 1fr) 70px 90px 70px 80px 80px 80px 70px 90px",
                  gap: 0,
                  padding: "3px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: running
                    ? "rgba(var(--success-rgb, 34,197,94),0.06)"
                    : undefined,
                  alignItems: "center",
                  height: 22,
                }}
              >
                {/* Index */}
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {idx + 1}
                </span>

                {/* Status */}
                <StatusIndicator
                  status={states[profile.script_path]?.status ?? "stopped"}
                />

                {/* Model: profile name, falls back to model filename without extension */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: running ? 700 : 600,
                    color: running ? "var(--success)" : "var(--text-primary)",
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                  title={profile.parsed_args?.model_path?.split("/").pop()?.replace(/\.gguf$/i, "") ?? profile.name}
                >
                  {profile.parsed_args?.model_path?.split("/").pop()?.replace(/\.gguf$/i, "") ?? profile.name}
                </span>

                {/* Params */}
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

                {/* Quant */}
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

                {/* Ctx */}
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

                {/* VRAM: live peak while running, else historical cache */}
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

                {/* RAM: live peak while running, else historical cache */}
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

                {/* Spec */}
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

                {/* TPS: live reading while running, else historical cache */}
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

                {/* Actions with metadata tooltip */}
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

export default function LlamaCppPage() {
  const {
    cpuCurrentValues,
    memoryCurrentValues,
    gpuCurrentValues,
    cpuHistory,
    memoryHistory,
    gpuHistory,
    gpuVramUtilHistory,
  } = useMetricsContext();

  const cpuPct = cpuCurrentValues[0];
  const memUsed = memoryCurrentValues[1];
  const memTotal = memoryCurrentValues[2];
  const memPct = memoryCurrentValues[0];
  const gpuPct = gpuCurrentValues[0];
  const gpuTemp = gpuCurrentValues[1];
  const vramUsed = gpuCurrentValues[2];
  const vramTotal = gpuCurrentValues[3];

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        gap: 6,
        padding: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
        }}
      >
        <LlamaCppCard />
      </div>

      <RunModelsSection />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexShrink: 0,
          borderTop: "1px solid var(--border-color)",
          padding: "10px 4px 2px",
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
    </main>
  );
}
