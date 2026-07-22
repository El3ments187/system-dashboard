import { Bell, Trash2 } from "lucide-react";
import { useLiveDataControlsContext } from "../context/LiveDataControlsContext";
import { useAlertsContext, AlertSeverity } from "../context/AlertsContext";
import { useFetchAlerts } from "../hooks/useFetchAlerts";
import { useMetricsContext } from "../context/MetricsContext";
import { useEffect, useRef, useState, useMemo } from "react";

interface HeaderProps {
  accent: { color: string; glow: string };
  healthOk?: boolean;
  activePage?:
    | "overview"
    | "gpu"
    | "cpu"
    | "llama-cpp"
    | "ai"
    | "terminal"
    | "settings"
    | "theme";
  onPageChange?: (
    page:
      | "overview"
      | "gpu"
      | "cpu"
      | "llama-cpp"
      | "ai"
      | "terminal"
      | "settings"
      | "theme",
  ) => void;
}

const PAGE_LABELS: Record<string, string> = {
  overview: "Overview",
  gpu: "GPU",
  cpu: "CPU",
  "llama-cpp": "llama.cpp",
  ai: "AI",
  settings: "Settings",
  theme: "Theme",
};

const severityColors: Record<AlertSeverity, string> = {
  [AlertSeverity.Info]: "var(--info)",
  [AlertSeverity.Warning]: "var(--warning)",
  [AlertSeverity.Error]: "var(--danger)",
};

const severityBgColors: Record<AlertSeverity, string> = {
  [AlertSeverity.Info]: "var(--info)20",
  [AlertSeverity.Warning]: "var(--warning)20",
  [AlertSeverity.Error]: "var(--danger)20",
};

export default function Header({
  accent,
  healthOk,
  activePage = "overview",
  onPageChange,
}: HeaderProps) {
  const pages: Array<
    "overview" | "gpu" | "cpu" | "llama-cpp" | "ai" | "settings" | "theme"
  > = ["overview", "gpu", "cpu", "llama-cpp", "ai", "settings", "theme"];

  const { systemMetrics: system } = useMetricsContext();

  const { isPaused, toggle: toggleLiveData } = useLiveDataControlsContext();
  const { addAlert, alerts: frontendAlerts, clearAlerts } = useAlertsContext();
  const { alerts: backendAlerts, refetch: refetchAlerts } = useFetchAlerts();
  const alerts = useMemo(() => {
    const backendIds = new Set(backendAlerts.map((a) => a.id));
    const merged = [...backendAlerts];
    for (const a of frontendAlerts) {
      if (!backendIds.has(a.id)) merged.push(a);
    }
    return merged;
  }, [backendAlerts, frontendAlerts]);

  const [showAlerts, setShowAlerts] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const prevShowAlertsRef = useRef(false);

  useEffect(() => {
    if (showAlerts) refetchAlerts();
  }, [showAlerts, refetchAlerts]);

  useEffect(() => {
    if (healthOk === false) {
      addAlert(AlertSeverity.Error, "backend", "Backend connection lost");
    }
  }, [healthOk, addAlert]);

  // Return focus to bell button when alerts panel closes
  useEffect(() => {
    if (prevShowAlertsRef.current && !showAlerts) {
      bellButtonRef.current?.focus();
    }
    prevShowAlertsRef.current = showAlerts;
  }, [showAlerts]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && showAlerts) {
        setShowAlerts(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAlerts]);

  const uptime = (() => {
    if (!system) return "—";
    const s = system.uptime_seconds;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  })();

  return (
    <header className="dashboard-header">
      {/* ── Left: logo + title + nav ── */}
      <div className="header-left">
        <div className="dash-logo-tile">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="17"
            height="17"
          >
            <path d="m12 14 4-4" />
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
          </svg>
        </div>
        <span className="header-title">Model Deck</span>
        <nav className="dash-nav">
          {pages.map((page) => (
            <button
              key={page}
              onClick={() => onPageChange?.(page)}
              className={`dash-nav-btn${activePage === page ? " active" : ""}`}
              {...(activePage === page ? { "data-accent-el": "" } : {})}
              style={
                activePage === page
                  ? {
                      color: "var(--accent-primary)",
                      background: "var(--accent-tint-15)",
                      borderColor: "var(--accent-tint-40)",
                    }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (activePage !== page) {
                  e.currentTarget.style.color = accent.color;
                  e.currentTarget.style.background = "var(--accent-tint-10)";
                }
              }}
              onMouseLeave={(e) => {
                if (activePage !== page) {
                  e.currentTarget.style.color = "";
                  e.currentTarget.style.background = "";
                }
              }}
            >
              {PAGE_LABELS[page] ?? page}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Right: chips + actions ── */}
      <div className="dash-right">
        <div className="dash-chips">
          {/* Host chip */}
          {system && (
            <span className="status-chip">
              <span className="chip-label">Host</span>
              <span
                data-accent-el=""
                className="chip-value"
                style={{ color: "var(--accent-primary)" }}
              >
                {system.hostname}
              </span>
            </span>
          )}

          {/* Uptime chip */}
          <span className="status-chip">
            <span className="chip-label">Uptime</span>
            <span
              data-accent-el=""
              className="chip-value"
              style={{ color: "var(--accent-primary)" }}
            >
              {uptime}
            </span>
          </span>

          {/* Updated chip */}
          {system && (
            <span className="status-chip">
              <span className="chip-label">Updated</span>
              <span
                data-accent-el=""
                className="chip-value"
                style={{ color: "var(--accent-primary)" }}
              >
                {system.last_update}
              </span>
            </span>
          )}

          {/* Online / Offline chip */}
          <span
            className="status-chip accent"
            {...(healthOk !== false ? { "data-accent-el": "" } : {})}
            style={
              healthOk === false
                ? {
                    color: "var(--danger)",
                    background:
                      "color-mix(in srgb, var(--danger) 15%, transparent)",
                  }
                : {
                    color: "var(--accent-primary)",
                    background: "var(--accent-tint-15)",
                  }
            }
          >
            <span
              className="chip-dot"
              style={{
                background:
                  healthOk === false
                    ? "var(--danger)"
                    : "var(--accent-primary)",
              }}
            />
            {healthOk === false ? "Offline" : "Online"}
          </span>

          {/* Live / Paused chip (clickable) */}
          <button
            onClick={toggleLiveData}
            className="status-chip accent"
            {...(!isPaused ? { "data-accent-el": "" } : {})}
            style={
              isPaused
                ? {
                    color: "var(--warning)",
                    background:
                      "color-mix(in srgb, var(--warning) 15%, transparent)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }
                : {
                    color: "var(--accent-primary)",
                    background: "var(--accent-tint-15)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }
            }
            title={isPaused ? "Resume live updates" : "Pause live updates"}
          >
            <span
              className={`chip-dot${isPaused ? "" : " live"}`}
              style={{
                background: isPaused
                  ? "var(--warning)"
                  : "var(--accent-primary)",
              }}
            />
            {isPaused ? "Paused" : "Live"}
          </button>
        </div>

        {/* ── Actions: bell + theme ── */}
        <div className="dash-actions" ref={panelRef}>
          <div style={{ position: "relative" }}>
            <button
              ref={bellButtonRef}
              className="dash-iconbtn"
              onClick={() => setShowAlerts(!showAlerts)}
              aria-label="Notifications"
              aria-expanded={showAlerts}
              aria-haspopup="true"
            >
              <Bell size={18} />
              {alerts.length > 0 && (
                <span className="dash-nbadge">
                  {alerts.length > 99 ? "99+" : alerts.length}
                </span>
              )}
            </button>

            {showAlerts && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  right: 0,
                  width: 296,
                  maxHeight: 480,
                  background: "var(--bg-secondary)",
                  borderRadius: 12,
                  border: "1px solid var(--border-color)",
                  boxShadow: "0 16px 40px rgba(0,0,0,.4)",
                  overflow: "hidden",
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 10px 7px",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: ".09em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    Notifications
                  </span>
                  <button
                    onClick={clearAlerts}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflow: "auto" }}>
                  {alerts.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: 24,
                        color: "var(--text-secondary)",
                        fontSize: 12,
                      }}
                    >
                      No notifications
                    </div>
                  )}
                  {alerts
                    .slice()
                    .reverse()
                    .map((alert) => (
                      <div
                        key={alert.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: "9px 10px",
                          borderRadius: 9,
                          borderBottom: "1px solid var(--border-color)",
                          background: severityBgColors[alert.severity],
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: severityColors[alert.severity],
                            flexShrink: 0,
                            marginTop: 5,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: "var(--text-primary)",
                              lineHeight: 1.45,
                            }}
                          >
                            {alert.message}
                          </div>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: 11,
                              display: "block",
                              marginTop: 2,
                              fontFamily:
                                "'JetBrains Mono', 'Fira Code', monospace",
                            }}
                          >
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <button
            className={`dash-iconbtn${activePage === "theme" ? " active" : ""}`}
            onClick={() => onPageChange?.("theme")}
            aria-label="Theme settings"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="18"
              height="18"
            >
              <path d="M12 3a9 9 0 0 0 0 18c1 0 1.7-.8 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z" />
              <circle
                cx="7.5"
                cy="10.5"
                r="1.1"
                fill="currentColor"
                stroke="none"
              />
              <circle
                cx="12"
                cy="7.5"
                r="1.1"
                fill="currentColor"
                stroke="none"
              />
              <circle
                cx="16.5"
                cy="10.5"
                r="1.1"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
