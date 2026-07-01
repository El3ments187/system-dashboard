import { useState, useEffect, useRef, useCallback } from "react";
import { useMetricsContext } from "../../context/MetricsContext";
import UpdateOutputModal from "../UpdateOutputModal";
import MetricTile from "../shared/MetricTile";
import {
  CardShell,
  CardHeader,
  Section,
  ScrollContent,
} from "../shared/CardComponents";
import {
  ptySpawnTerminal,
  ptyWriteInput,
  ptyReadOutput,
  ptyKillTerminal,
} from "../../services/api";
import { extractLatestPercent } from "../../utils/ansiOutput";
import {
  BrainCircuit,
  Folder,
  Terminal as TermIcon,
  RefreshCw,
  ExternalLink,
  Loader2,
  Activity,
  Globe,
  Eye,
  AudioLines,
  Video as VideoIcon,
  BookOpen,
  FileText,
} from "lucide-react";

const DEFAULT_UPDATE_SCRIPT =
  "git pull\ncmake --build build --config Release -j$(nproc)";
const DEFAULT_BUILD_NOTES_URL =
  "https://github.com/ggml-org/llama.cpp/releases";
const DONE_MARKER = "__LLAMA_UPDATE_DONE__";

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

function ModelTitle({ filename }: { filename: string }) {
  return (
    <div style={{ padding: "0px 8px", marginBottom: 6 }}>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--text-primary)",
          fontFamily: "monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textShadow: "var(--text-shadow-sm)",
        }}
        title={filename}
      >
        {filename}
      </span>
    </div>
  );
}

function MetadataLine({
  alias,
  version,
  build,
  online,
}: {
  alias: string;
  version: string;
  build: string;
  online: boolean;
}) {
  return (
    <div
      style={{
        padding: "0px 8px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
      }}
    >
      <span
        style={{
          fontFamily: "monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          textShadow: "var(--text-shadow-sm)",
        }}
        title={`Alias: ${alias} • Version: ${version || "\u2014"} • Build: ${build || "\u2014"}`}
      >
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
          Alias:
        </span>{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {alias}
        </span>{" "}
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
          • Version:
        </span>{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {version || "\u2014"}
        </span>{" "}
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
          • Build:
        </span>{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {build || "\u2014"}
        </span>
      </span>
      <span
        style={{
          color: online ? "var(--success)" : "var(--text-muted)",
          flexShrink: 0,
          fontSize: 8,
        }}
      >
        {online ? "🟢 Online" : "⚫ Offline"}
      </span>
    </div>
  );
}

export default function LlamaCppCard() {
  const { aiCurrentMetrics } = useMetricsContext();
  const [dirPath] = useState(
    () => localStorage.getItem("llama_cpp_dir") ?? "",
  );
  const [ptsName, setPtsName] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: "error" | "info";
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [updateScript] = useState(
    () =>
      localStorage.getItem("llama_cpp_update_script") ?? DEFAULT_UPDATE_SCRIPT,
  );
  const [updateState, setUpdateState] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateOutput, setUpdateOutput] = useState("");
  const updatePtsRef = useRef<string | null>(null);
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [largestContextPeak, setLargestContextPeak] = useState<number>(0);
  const [llamaVersion] = useState(
    () => localStorage.getItem("llama_cpp_version") ?? "",
  );
  const [readmeUrl] = useState(
    () => localStorage.getItem("llama_cpp_readme_url") ?? "",
  );
  const [buildNotesUrl] = useState(
    () =>
      localStorage.getItem("llama_cpp_build_notes_url") ?? DEFAULT_BUILD_NOTES_URL,
  );

  const showToast = useCallback((msg: string, type: "error" | "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const llamaOnline = aiCurrentMetrics?.llama_server?.available ?? false;
  const m = aiCurrentMetrics;
  const tokenUsage = aiCurrentMetrics?.token_usage;

  const fullModelPath: string = m?.model_path || m?.model_alias || "";
  const modelFile = fullModelPath.includes("/")
    ? fullModelPath.split("/").pop()
    : fullModelPath;
  const modelAlias = m?.model_alias || "";
  const buildInfo = m?.build_info || "";

  const contextTokens = m?.context_tokens ?? null;
  const maxContext = m?.max_context ?? null;
  const contextPct =
    contextTokens != null && maxContext != null && maxContext > 0
      ? Math.round((contextTokens / maxContext) * 1000) / 10
      : null;

  if (contextTokens != null && contextTokens > largestContextPeak) {
    setLargestContextPeak(contextTokens);
  }
  const largestContext = largestContextPeak > 0 ? largestContextPeak : null;

  const fmtNum = (v: unknown): string => {
    if (v == null || v === "") return "";
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString();
  };

  const ctxColor =
    contextPct != null && contextPct > 90
      ? "var(--danger)"
      : contextPct != null && contextPct > 70
        ? "var(--warning)"
        : "var(--accent-primary)";

  const openTerminal = useCallback(async () => {
    if (!dirPath) return;
    if (updatePtsRef.current) {
      setPtsName(updatePtsRef.current);
      window.open(
        `/llama-cpp/terminal?pts=${encodeURIComponent(updatePtsRef.current)}`,
        "_blank",
      );
      return;
    }
    if (ptsName) {
      window.open(`/llama-cpp/terminal?pts=${encodeURIComponent(ptsName)}`, "_blank");
      return;
    }
    try {
      const resp = await ptySpawnTerminal(dirPath);
      setPtsName(resp.pts_name);
      window.open(
        `/llama-cpp/terminal?pts=${encodeURIComponent(resp.pts_name)}`,
        "_blank",
      );
    } catch (e: any) {
      console.error("[LlamaCpp] Terminal spawn error:", e);
      showToast(e?.message || "Failed to open terminal", "error");
    }
  }, [dirPath, ptsName, showToast]);

  const stopPolling = useCallback(() => {
    if (updatePollRef.current) {
      clearInterval(updatePollRef.current);
      updatePollRef.current = null;
    }
  }, []);

  const runUpdate = useCallback(async () => {
    if (!dirPath || updateState === "running") return;
    stopPolling();
    if (updatePtsRef.current) {
      ptyKillTerminal(updatePtsRef.current);
      updatePtsRef.current = null;
    }
    setUpdateState("running");
    setUpdateProgress(0);
    setUpdateOutput("");
    try {
      const resp = await ptySpawnTerminal(dirPath);
      updatePtsRef.current = resp.pts_name;
      const lines = updateScript
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const composite = `${lines.join(" && ")} ; echo "${DONE_MARKER}"\n`;
      await ptyWriteInput(resp.pts_name, composite);

      updatePollRef.current = setInterval(async () => {
        const pts = updatePtsRef.current;
        if (!pts) return;
        try {
          const chunk = await ptyReadOutput(pts);
          if (chunk) {
            setUpdateOutput((prev) => {
              const next = prev + chunk;
              const pct = extractLatestPercent(next);
              if (pct != null) setUpdateProgress(pct);
              const donePattern = new RegExp(
                `(^|\\n)${DONE_MARKER}(\\r|\\n|$)`,
              );
              if (donePattern.test(next)) {
                setUpdateProgress(100);
                setUpdateState("done");
                stopPolling();
                ptyKillTerminal(pts);
                updatePtsRef.current = null;
                setTimeout(() => setUpdateState("idle"), 2000);
              }
              return next;
            });
          }
        } catch (err) {
          console.error("[LlamaCpp] Update poll error:", err);
          stopPolling();
          if (updatePtsRef.current) {
            ptyKillTerminal(updatePtsRef.current);
            updatePtsRef.current = null;
          }
          setUpdateState("error");
        }
      }, 400);
    } catch (err: any) {
      console.error("[LlamaCpp] Update spawn error:", err);
      showToast(err?.message || "Failed to start update", "error");
      if (updatePtsRef.current) {
        ptyKillTerminal(updatePtsRef.current);
        updatePtsRef.current = null;
      }
      setUpdateState("error");
    }
  }, [dirPath, updateScript, updateState, stopPolling, showToast]);

  const mgmtBtnStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "3px 6px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 9.5,
    fontWeight: 600,
    textShadow: "var(--text-shadow-sm)",
  };

  const disabledBtnStyle: React.CSSProperties = {
    ...mgmtBtnStyle,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  const accentBtnStyle: React.CSSProperties = {
    ...mgmtBtnStyle,
    background: "var(--accent-primary)",
    border: "none",
    color: "#fff",
    fontWeight: 700,
    textShadow: "var(--text-shadow-md)",
  };

  const hasDir = !!dirPath;

  return (
    <>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 99999,
            padding: "6px 10px",
            borderRadius: 4,
            background:
              toast.type === "error"
                ? "var(--danger)"
                : "var(--accent-primary)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          {toast.msg}
        </div>
      )}
      <CardShell>
        <CardHeader
          icon={
            <BrainCircuit
              size={14}
              style={{ color: "var(--accent-primary)" }}
            />
          }
          title="LLAMA.CPP"
          online={llamaOnline}
        />

        <ScrollContent>
          {/* ── ACTIVE MODEL HEADER ── */}
          <ModelTitle filename={modelFile || modelAlias || "\u2014"} />
          <MetadataLine
            alias={modelAlias || "\u2014"}
            version={llamaVersion || ""}
            build={buildInfo || ""}
            online={llamaOnline}
          />

          {/* ── CAPABILITIES ── */}
          <div style={{ padding: "2px 8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <CapPill
                icon={<Activity size={9} />}
                label="Metrics"
                enabled={m?.endpoint_metrics}
              />
              <CapPill
                icon={<Globe size={9} />}
                label="WebUI"
                enabled={m?.webui}
              />
              <CapPill
                icon={<Eye size={9} />}
                label="Vision"
                enabled={m?.vision}
              />
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

          {/* ── CONTEXT (compact single card) ── */}
          <Section title="" style={{ padding: "2px 8px 1px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 4,
              }}
            >
              <MetricTile
                label="Current"
                value={fmtNum(contextTokens)}
                unit=" token"
                color={ctxColor}
              />
              <MetricTile label="Max" value={fmtNum(maxContext)} unit=" token" />
              <MetricTile
                label="Largest Seen"
                value={fmtNum(largestContext)}
                unit=" token"
              />
            </div>
            {contextPct != null && (
              <div style={{ marginTop: 3 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "var(--bg-secondary)",
                    overflow: "hidden",
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
                    marginTop: 2,
                  }}
                >
                  <span>0%</span>
                  <span style={{ fontWeight: 700, color: ctxColor }}>
                    {contextPct.toFixed(1)}%
                  </span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </Section>

          {/* ── METRICS GRID (4x2) ── */}
          <Section title="" style={{ padding: "2px 8px 1px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 4,
              }}
            >
              <MetricTile
                label="Gen TPS"
                value={fmtNum(m?.gen_tps)}
                unit=" token/s"
              />
              <MetricTile
                label="Prompt TPS"
                value={fmtNum(m?.prompt_tps)}
                unit=" token/s"
              />
              <MetricTile
                label="Prompt"
                value={fmtNum(tokenUsage?.prompt_tokens)}
                unit=" token"
              />
              <MetricTile
                label="Generated"
                value={fmtNum(tokenUsage?.completion_tokens)}
                unit=" token"
              />
              <MetricTile
                label="Temperature"
                value={m?.temperature != null ? m.temperature.toFixed(2) : null}
              />
              <MetricTile label="Top-K Sampling" value={fmtNum(m?.top_k)} />
              <MetricTile
                label="Top-P (Nucleus) Sampling"
                value={m?.top_p != null ? m.top_p.toFixed(2) : null}
              />
              <MetricTile
                label="Repeat Penalty"
                value={
                  m?.repeat_penalty != null ? m.repeat_penalty.toFixed(2) : null
                }
              />
            </div>
          </Section>

          {/* ── WORKING DIRECTORY + ACTIONS TOOLBAR ── */}
          <Section title="" style={{ padding: "2px 8px 1px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 3,
              }}
            >
              <Folder
                size={10}
                style={{
                  color: hasDir ? "var(--accent-primary)" : "var(--text-muted)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: "monospace",
                  color: hasDir ? "var(--text-primary)" : "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textShadow: "var(--text-shadow-sm)",
                  flex: 1,
                }}
                title={dirPath}
              >
                {hasDir ? dirPath : "No directory selected."}
              </span>
            </div>

            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={runUpdate}
                disabled={!hasDir || updateState === "running"}
                style={!hasDir ? disabledBtnStyle : accentBtnStyle}
              >
                <RefreshCw
                  size={10}
                  className={updateState === "running" ? "spin" : undefined}
                />
                Update
              </button>
              <button
                onClick={() => openTerminal()}
                disabled={!hasDir}
                style={!hasDir ? disabledBtnStyle : mgmtBtnStyle}
              >
                <TermIcon size={10} />
                Terminal
              </button>
              {ptsName && (
                <a
                  href={`/llama-cpp/terminal?pts=${encodeURIComponent(ptsName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...mgmtBtnStyle, textDecoration: "none" }}
                  title="Open in new tab"
                >
                  <ExternalLink size={10} />
                  Tab ↗
                </a>
              )}
            </div>

            {updateState !== "idle" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 2,
                }}
              >
                {updateState === "running" ? (
                  <Loader2
                    size={10}
                    className="spin"
                    style={{ color: "var(--accent-primary)" }}
                  />
                ) : null}
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    color:
                      updateState === "error"
                        ? "var(--danger)"
                        : updateState === "done"
                          ? "var(--success)"
                          : "var(--accent-primary)",
                    flexShrink: 0,
                    textShadow: "var(--text-shadow-sm)",
                  }}
                >
                  {updateState === "running"
                    ? "Updating…"
                    : updateState === "done"
                      ? "Update complete"
                      : "Update failed"}
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
                      width: `${updateProgress}%`,
                      height: "100%",
                      borderRadius: 2,
                      background:
                        updateState === "error"
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
                    textShadow: "var(--text-shadow-sm)",
                  }}
                >
                  {updateProgress}%
                </span>
                <button
                  onClick={() => setOutputOpen(true)}
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
                    textShadow: "var(--text-shadow-sm)",
                  }}
                >
                  <ExternalLink size={9} />
                  Output
                </button>
              </div>
            )}

            {/* ── UTILITY ROW ── */}
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 5px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    marginRight: 4,
                    flexShrink: 0,
                    textShadow: "var(--text-shadow-sm)",
                  }}
                >
                  Version
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textShadow: "var(--text-shadow-sm)",
                  }}
                >
                  {llamaVersion || "\u2014"}
                </span>
              </div>
              <button
                onClick={() =>
                  readmeUrl &&
                  window.open(readmeUrl, "_blank", "noopener,noreferrer")
                }
                disabled={!readmeUrl}
                style={!readmeUrl ? disabledBtnStyle : mgmtBtnStyle}
              >
                <BookOpen size={10} />
                Readme
              </button>
              <button
                onClick={() =>
                  buildNotesUrl &&
                  window.open(buildNotesUrl, "_blank", "noopener,noreferrer")
                }
                disabled={!buildNotesUrl}
                style={!buildNotesUrl ? disabledBtnStyle : mgmtBtnStyle}
              >
                <FileText size={10} />
                Build Notes
              </button>
            </div>
          </Section>

          <div style={{ flex: 1, minHeight: 0 }} />
        </ScrollContent>
      </CardShell>

      <UpdateOutputModal
        isOpen={outputOpen}
        onClose={() => setOutputOpen(false)}
        output={updateOutput}
        running={updateState === "running"}
      />
    </>
  );
}
