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
  Search,
  Star,
  X,
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

const EMPTY_STATE_STYLE: React.CSSProperties = {
  padding: "16px 12px",
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: 11,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
};

const FAVORITES_KEY = "run-models-favorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Private browsing or quota exhaustion — in-session state is still intact.
  }
}

const OPTIONS_KEY = "run-models-options";
type OptionsStore = Record<string, Record<string, string>>;

function loadOptions(): OptionsStore {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return {};
    const result: OptionsStore = {};
    for (const [path, vals] of Object.entries(parsed)) {
      if (typeof vals === "object" && vals !== null && !Array.isArray(vals)) {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(vals)) {
          if (typeof v === "string") clean[k] = v;
        }
        result[path] = clean;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveOptions(store: OptionsStore): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(store));
  } catch {
    // Private browsing or quota exhaustion.
  }
}



type MergedOption = {
  name: string;
  key: string; // storage + launch key: opt.name for declared, opt.env_var for detected
  values: string[];
  default: string;
  kind: "declared" | "detected";
  /** Set only where the backend flagged a degraded list needing explanation. */
  hint?: string;
};



function effectiveMergedOptions(
  stored: Record<string, string> | undefined,
  merged: MergedOption[],
): Record<string, string> {
  if (!stored) return {};
  const result: Record<string, string> = {};
  for (const opt of merged) {
    const val = stored[opt.key];
    if (val !== undefined && opt.values.includes(val) && val !== opt.default) {
      result[opt.key] = val;
    }
  }
  return result;
}

function countChangedMergedOptions(
  stored: Record<string, string> | undefined,
  merged: MergedOption[],
): number {
  return Object.keys(effectiveMergedOptions(stored, merged)).length;
}

// Extracted to avoid a nested ternary in the render.
// Precedence: no profiles → no favourites (filter on) → no search match.
function renderEmptyState(
  totalCount: number,
  filteredCount: number,
  searchQuery: string,
  showOnlyFavorites: boolean,
  favoritesInTotal: number,
): React.ReactNode | null {
  if (totalCount === 0) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FolderOpen size={24} style={{ opacity: 0.35 }} />
        No profiles found in scan directory.
      </div>
    );
  }
  if (showOnlyFavorites && favoritesInTotal === 0) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <Star size={24} style={{ opacity: 0.35 }} />
        No favourites yet — click ★ on a model to star it.
      </div>
    );
  }
  if (filteredCount === 0) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <Search size={24} style={{ opacity: 0.35 }} />
        {showOnlyFavorites ? (
          <>No favourites match &quot;{searchQuery}&quot;.</>
        ) : (
          <>No models match &quot;{searchQuery}&quot;.</>
        )}
      </div>
    );
  }
  return null;
}

export function RunModelsSection() {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [states, setStates] = useState<Record<string, ProfileState>>({});
  const [metadata, setMetadata] = useState<Record<string, ProfileMetadata>>({});
  const [scanDir, setScanDir] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: "none",
  });
  const [favorites, setFavorites] = useState<Set<string>>(() =>
    loadFavorites(),
  );
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<OptionsStore>(() =>
    loadOptions(),
  );
  const [openOptionsPanel, setOpenOptionsPanel] = useState<string | null>(null);

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

  const toggleFavorite = useCallback((scriptPath: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(scriptPath)) {
        next.delete(scriptPath);
      } else {
        next.add(scriptPath);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const setOption = useCallback(
    (scriptPath: string, name: string, value: string) => {
      setSelectedOptions((prev) => {
        const next = {
          ...prev,
          [scriptPath]: { ...(prev[scriptPath] ?? {}), [name]: value },
        };
        saveOptions(next);
        return next;
      });
    },
    [],
  );

  const getFilteredProfiles = useCallback((): LaunchProfile[] => {
    const q = searchQuery.trim().toLowerCase();
    let filtered =
      q === ""
        ? profiles
        : profiles.filter((p) => p.name.toLowerCase().includes(q));
    if (showOnlyFavorites) {
      filtered = filtered.filter((p) => favorites.has(p.script_path));
    }
    return filtered;
  }, [profiles, searchQuery, showOnlyFavorites, favorites]);

  const getSortedProfiles = useCallback((): LaunchProfile[] => {
    const filtered = getFilteredProfiles();
    if (sortConfig.column === null || sortConfig.direction === "none") {
      return filtered;
    }
    return sortProfiles(filtered, states, metadata, sortConfig);
  }, [getFilteredProfiles, states, metadata, sortConfig]);

  useEffect(() => {
    const timer = setInterval(() => loadProfiles(false), 30000);
    return () => clearInterval(timer);
  }, [loadProfiles]);

  const handleLaunchWithRetry = useCallback(
    async (profileId: string, opts: Record<string, string> = {}, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const body: Record<string, unknown> = { profile_id: profileId };
          if (Object.keys(opts).length > 0) body.options = opts;
          const res = await fetch("/api/launch/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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

  // Star column (20px) precedes the existing # column (24px).
  const COL_GRID =
    "20px 24px 90px minmax(210px, 1fr) 70px 90px 70px 80px 80px 80px 70px 90px";

  const favoritesInTotal = profiles.filter((p) =>
    favorites.has(p.script_path),
  ).length;

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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            aria-pressed={showOnlyFavorites}
            onClick={() => setShowOnlyFavorites((v) => !v)}
            title={
              showOnlyFavorites ? "Show all models" : "Show favourites only"
            }
            className="btn-glow"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: showOnlyFavorites
                ? "var(--accent-tint-10)"
                : "var(--bg-card)",
              border: `1px solid ${showOnlyFavorites ? "var(--accent-tint-40)" : "var(--border-color)"}`,
              borderRadius: 6,
              cursor: "pointer",
              color: showOnlyFavorites
                ? "var(--accent-primary)"
                : "var(--text-muted)",
            }}
          >
            <Star size={10} fill={showOnlyFavorites ? "currentColor" : "none"} />
            Favourites
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <Search size={10} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              id="run-models-search"
              name="run-models-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 10,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                color: "var(--text-primary)",
                width: 130,
              }}
            />
            {searchQuery !== "" && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                title="Clear search"
                className="ghost-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--text-muted)",
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
          <button
            data-accent-el=""
            onClick={() => loadProfiles()}
            disabled={loading}
            className="btn-glow"
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
        {/* Star column header — not sortable */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          ★
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color:
              "color-mix(in srgb, var(--accent-primary) 65%, var(--text-muted))",
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
              className="btn-glow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontSize: 10,
                fontWeight: 600,
                color: isActiveSort
                  ? "var(--accent-primary)"
                  : "color-mix(in srgb, var(--accent-primary) 65%, var(--text-muted))",
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
                  : "color-mix(in srgb, var(--accent-primary) 65%, var(--text-muted))";
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
      {renderEmptyState(
        profiles.length,
        getFilteredProfiles().length,
        searchQuery,
        showOnlyFavorites,
        favoritesInTotal,
      ) ?? (
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
              : {
                  fontWeight: 600,
                  color:
                    "color-mix(in srgb, var(--accent-primary) 80%, var(--text-primary))",
                };
            const isFavorite = favorites.has(profile.script_path);
            const declaredOptions = profile.parsed_args?.options ?? [];
            const mergedOptions: MergedOption[] = declaredOptions.map((opt) => ({
              kind: "declared" as const,
              name: opt.name,
              key: opt.name,
              values: opt.values,
              default: opt.default,
            }));
            const storedOpts = selectedOptions[profile.script_path];
            const changedCount = countChangedMergedOptions(storedOpts, mergedOptions);
            const launchOpts = effectiveMergedOptions(storedOpts, mergedOptions);
            const hasAnyOptions = mergedOptions.length > 0;
            const isPanelOpen = openOptionsPanel === profile.script_path;

            return (
              <React.Fragment key={profile.id}>
              <div
                className="run-models-row"
                data-running={String(running)}
                style={{
                  ...({ "--el-index": String(idx) } as React.CSSProperties),
                  display: "grid",
                  gridTemplateColumns: COL_GRID,
                  gap: 0,
                  padding: "4px 12px",
                  borderBottom: isPanelOpen ? "none" : "1px solid var(--accent-tint-40)",
                  borderLeft: running
                    ? "3px solid var(--accent-primary)"
                    : "2px solid var(--accent-primary)",
                  background: rowBg,
                  alignItems: "center",
                  minHeight: 26,
                }}
              >
                {/* Star toggle */}
                <button
                  onClick={() => toggleFavorite(profile.script_path)}
                  aria-pressed={isFavorite}
                  aria-label={`${isFavorite ? "Unstar" : "Star"} ${profile.name}`}
                  title={
                    isFavorite
                      ? "Remove from favourites"
                      : "Add to favourites"
                  }
                  className="ghost-hover"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isFavorite
                      ? "var(--accent-primary)"
                      : "var(--text-muted)",
                  }}
                >
                  <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
                </button>
                <span
                  style={{
                    fontSize: 10,
                    color:
                      "color-mix(in srgb, var(--accent-primary) 65%, var(--text-muted))",
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
                    color: "var(--accent-primary)",
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
                    color: "var(--accent-primary)",
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
                    color: "var(--accent-primary)",
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
                    color: "var(--accent-primary)",
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
                    color: "var(--accent-primary)",
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
                    color: "var(--accent-primary)",
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
                    alignItems: "center",
                  }}
                >

                  {hasAnyOptions && (
                    <button
                      onClick={() =>
                        setOpenOptionsPanel(isPanelOpen ? null : profile.script_path)
                      }
                      disabled={running}
                      title={
                        running
                          ? "Stop the model first — options take effect on the next launch"
                          : isPanelOpen
                            ? "Close options"
                            : "Configure per-launch options"
                      }
                      className="ghost-hover"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: 500,
                        background: isPanelOpen
                          ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                          : "transparent",
                        border: `1px solid ${isPanelOpen ? "color-mix(in srgb, var(--accent-primary) 40%, transparent)" : "color-mix(in srgb, var(--text-muted) 30%, transparent)"}`,
                        borderRadius: 4,
                        cursor: running ? "not-allowed" : "pointer",
                        color: running ? "var(--text-muted)" : changedCount > 0 ? "var(--accent-primary)" : "var(--text-secondary)",
                        opacity: running ? 0.5 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {changedCount > 0 ? `Options (${changedCount})` : "Options"}
                    </button>
                  )}
                  {active ? (
                    <button
                      onClick={() => handleStopWithRetry(profile.id)}
                      title={
                        profileMeta
                          ? `Runs: ${profileMeta.run_count}\nLast run: ${formatLastRunDate(profileMeta.last_run_date)}`
                          : undefined
                      }
                      className="btn-glow"
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
                      onClick={() => handleLaunchWithRetry(profile.id, launchOpts)}
                      title={
                        profileMeta
                          ? `Runs: ${profileMeta.run_count}\nLast run: ${formatLastRunDate(profileMeta.last_run_date)}`
                          : undefined
                      }
                      className="btn-glow"
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
              {isPanelOpen && (
                <div
                  data-testid="run-models-options-panel"
                  style={{
                    // Right padding matches the ACTIONS cell's, so the panel's
                    // right edge lines up with the Options button that opened
                    // it rather than with the table's outer edge.
                    padding: "6px 10px 8px",
                    display: "flex",
                    flexWrap: "wrap",
                    // The trigger is at the far right of the row; left-packing
                    // the panel sent the eye somewhere the content was not.
                    // With flexWrap already on, this also keeps wrapped rows
                    // aligned as a block instead of raggedly.
                    justifyContent: "flex-end",
                    gap: "8px 16px",
                    background: rowBg,
                    borderBottom: "1px solid var(--accent-tint-40)",
                    borderLeft: running
                      ? "3px solid var(--accent-primary)"
                      : "2px solid var(--accent-primary)",
                    borderTop: "1px solid var(--border-color)",
                  }}
                >
                  {mergedOptions.map((opt) => {
                    const storedVal = storedOpts?.[opt.key];
                    const current =
                      storedVal !== undefined && opt.values.includes(storedVal)
                        ? storedVal
                        : opt.default;
                    return (
                      <label
                        key={opt.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 10,
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              current !== opt.default
                                ? "var(--accent-primary)"
                                : "var(--text-muted)",
                          }}
                        >
                          {opt.name}
                          {/* A one-option list with no reason reads as broken,
                              so the explanation rides the label it explains. */}
                          {opt.hint && (
                            <span
                              data-testid={`run-models-option-hint-${opt.name}`}
                              title={opt.hint}
                              style={{
                                fontWeight: 700,
                                color: "var(--accent-primary)",
                                marginLeft: 4,
                                cursor: "help",
                              }}
                            >
                              ?
                            </span>
                          )}

                        </span>
                        <select
                          data-testid={`run-models-option-select-${opt.name}`}
                          value={current}
                          onChange={(e) =>
                            setOption(
                              profile.script_path,
                              opt.key,
                              e.target.value,
                            )
                          }
                          style={{
                            fontSize: 10,
                            padding: "1px 4px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: 3,
                            cursor: "pointer",
                          }}
                        >
                          {opt.values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
