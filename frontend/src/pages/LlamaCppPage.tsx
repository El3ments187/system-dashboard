import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  Activity,
  Globe,
  Eye,
  AudioLines,
  Video as VideoIcon,
  Zap,
  Brain,
  AlertCircle,
  Package,
  Server,
  Clock3,
  Fingerprint,
  MemoryStick,
  MonitorCog,
  Layers,
  Database,
  RefreshCw,
  TriangleAlert,
  Loader2,
  ExternalLink,
  Terminal as TermIcon,
  BookOpen,
  ArrowDown,
} from "lucide-react";
import { useMetricsContext } from "../context/MetricsContext";
import { LogConsole } from "../components/LogConsole";
import UpdateOutputModal from "../components/UpdateOutputModal";
import { useLlamaCppManagement } from "../hooks/useLlamaCppManagement";
import {
  useRunModelsSplit,
  DEFAULT_RUN_MODELS_HEIGHT,
} from "../hooks/useRunModelsSplit";
import type { ProfileResponse, ParsedScriptArgs } from "../types/metrics";
import { calcBuildsBehind, formatCtx, fmtUptime, fmtKb, specLabel } from "./llamaCppUtils";
import {
  Card,
  CardHeader,
  AccentSpine,
} from "../components/shared/CardComponents";
import MetricTile from "../components/shared/MetricTile";
import Sparkline from "../components/shared/Sparkline";
import { LlamaCppHardwareFooter } from "./llamacpp/FooterStat";
import { RunModelsSection } from "./llamacpp/RunModelsSection";
import { RadialGauge } from "./llamacpp/RadialGauge";
import { StatusIndicator } from "./llamacpp/StatusIndicator";
import {
  fmtNum,
  fmtCount,
  thresholdClass,
  boolLabel,
  middleTruncate,
  contextGaugeLabel,
  getCtxColor,
  splitModelName,
  useFitText,
  updateStateColor,
  updateStateText,
} from "./llamacpp/parts";

// ─── Re-exports for test backward compatibility ───────────────────────────────

export {
  fmtNum,
  fmtCount,
  thresholdClass,
  boolLabel,
  middleTruncate,
  contextGaugeLabel,
};
export { RunModelsSection } from "./llamacpp/RunModelsSection";

// ─── Local helpers ────────────────────────────────────────────────────────────

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
        border: `1px solid ${
          on ? "rgba(var(--success-rgb, 34,197,94),0.3)" : "var(--border-color)"
        }`,
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

function KvRow({
  icon,
  label,
  value,
  valueColor,
  testId,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <div
      data-accent-el=""
      style={{
        background: "var(--accent-tint-10)",
        border: "1px solid var(--accent-tint-40)",
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
          color: "var(--accent-primary)",
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
}

const PANEL_CARD_STYLE: React.CSSProperties = {
  position: "relative",
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-light, var(--border-color))",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const MONO = '"JetBrains Mono", "Fira Code", monospace';

// The Context card's own value/label sizes, matching the MetricTile props its
// CURRENT / MAX / REMAINING tiles pass (valueSize 16, labelSize 8.5). The
// Generation strip below them reuses these so its token count is
// sized as a value rather than as a label.
const GEN_VALUE_SIZE = 16;
const GEN_LABEL_SIZE = 8.5;

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

  // T238: the splitter owns exactly one number — Run Models' height. The
  // console stays `flex: 1` and follows.
  const workAreaRef = useRef<HTMLDivElement>(null);
  const split = useRunModelsSplit(workAreaRef);

  const [runningArgs, setRunningArgs] = useState<ParsedScriptArgs | null>(null);
  const [runningMeta, setRunningMeta] = useState<{
    params?: string;
    quant?: string;
  } | null>(null);
  const [heldGenTps, setHeldGenTps] = useState<number | null>(null);
  const [heldPromptTps, setHeldPromptTps] = useState<number | null>(null);
  const prevModelRef = useRef<string>("");

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

  const fullModelPath: string = m?.model_path || m?.model_alias || "";
  const pageModelFile = fullModelPath.includes("/")
    ? (fullModelPath.split("/").pop() ?? "")
    : fullModelPath;
  const cleanModelName = pageModelFile.replace(/\.gguf$/i, "");
  const { head: modelHead, quant: modelQuant } = splitModelName(cleanModelName);

  const pageModelAlias: string = m?.model_alias || "";

  const slot0 = m?.slots && m.slots.length > 0 ? m.slots[0] : null;
  const slotCtx: number | null = slot0?.n_ctx ?? null;
  const nCtxTrain: number | null = m?.n_ctx_train ?? null;
  const storedCtxForRunning: number | null = (() => {
    const path = m?.running_script_path;
    if (!path) return null;
    try {
      const raw = localStorage.getItem("run-models-options");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      const val = parsed[path]?.["LLAMA_ARG_CTX_SIZE"];
      if (!val || val === "default") return null;
      const n = parseInt(val, 10);
      return isNaN(n) ? null : n;
    } catch {
      return null;
    }
  })();
  const ctxMismatch =
    storedCtxForRunning !== null &&
    m?.max_context != null &&
    storedCtxForRunning !== m.max_context;
  const slotCurrentTokens: number | null = slot0?.n_prompt_tokens ?? null;
  const contextPct =
    slotCurrentTokens != null && slotCtx != null && slotCtx > 0
      ? Math.round((slotCurrentTokens / slotCtx) * 1000) / 10
      : null;

  const tokCached: number | null =
    slot0?.n_prompt_tokens_cache != null
      ? slot0.n_prompt_tokens_cache
      : (m?.tokens_cached ?? null);

  useEffect(() => {
    if (m?.gen_tps != null) setHeldGenTps(m.gen_tps);
    if (m?.prompt_tps != null) setHeldPromptTps(m.prompt_tps);
  }, [m?.gen_tps, m?.prompt_tps]);

  useEffect(() => {
    if (prevModelRef.current !== fullModelPath) {
      prevModelRef.current = fullModelPath;
      setHeldGenTps(null);
      setHeldPromptTps(null);
    }
  }, [fullModelPath]);

  useEffect(() => {
    if (!llamaOnline) {
      setHeldGenTps(null);
      setHeldPromptTps(null);
    }
  }, [llamaOnline]);

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

  const gpuOffload = m?.gpu_offload ?? null;
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
  const tokenUsage = m?.token_usage;
  const proc = m?.llama_server_process;

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
          {/* ── Active Model Card ── */}
          <Card
            role={null}
            baseClass=""
            style={{ ...PANEL_CARD_STYLE, padding: "15px 17px 13px", gap: 10 }}
          >
            {/* Eyebrow */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              {/* Label + accent line share ONE fit-content wrapper so the
                  line's width IS the label's real rendered width (icon +
                  gap + text + letter-spacing included). User-reported: a
                  static width (36px, then a 14ch approximation) always
                  stopped short of the card name — ch units measure the
                  '0' glyph only and can't see letter-spacing, the icon,
                  or the flex gap. width:"100%" of an inline-flex column
                  can't drift, at any font or label. */}
              <div
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  gap: 4,
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
                {/* Accent line */}
                <div
                  className="accent-fill accent-glow-target"
                  style={{
                    height: 2,
                    width: "100%",
                    background: "var(--accent-fill)",
                    backgroundSize: "var(--accent-fill-size, 200% 200%)",
                    borderRadius: 2,
                  }}
                >
                  <span className="sheen-flow-overlay" aria-hidden />
                  <span className="bright-breathe" />
                  <span className="bright-surge" />
                </div>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: MONO,
                  color: "var(--border-color)",
                }}
              >
                01
              </span>
            </div>
            {/* Model name hero */}
            <div
              ref={modelNameRef}
              style={{
                fontFamily: MONO,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-1px",
                lineHeight: 1.06,
                whiteSpace: "nowrap",
                overflow: "hidden",
                color: "var(--text-primary)",
                paddingTop: 12,
              }}
              title={cleanModelName || "—"}
            >
              {cleanModelName ? (
                <>
                  {middleTruncate(modelHead, 40)}
                  {modelQuant && (
                    <span className="accent-text accent-text-glow">
                      {modelQuant}
                    </span>
                  )}
                </>
              ) : (
                "—"
              )}
            </div>
            {/* Middle flex */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-evenly",
              }}
            >
              {/* Meta row */}
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
                      fontFamily: MONO,
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
                        fontFamily: MONO,
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
                        fontFamily: MONO,
                        fontSize: 10,
                        color: ctxMismatch
                          ? "var(--warning)"
                          : "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        border: ctxMismatch
                          ? "1px solid color-mix(in srgb, var(--warning) 50%, transparent)"
                          : "1px solid var(--border-light, var(--border-color))",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                      title={
                        ctxMismatch
                          ? `Selected ${formatCtx(storedCtxForRunning!)} but running at ${formatCtx(slotCtx)} — may have been capped by the model`
                          : undefined
                      }
                    >
                      <b
                        style={{
                          color: ctxMismatch
                            ? "var(--warning)"
                            : "var(--text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        {formatCtx(slotCtx)}
                      </b>{" "}
                      ctx
                    </span>
                  )}
                  {nCtxTrain != null && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        border:
                          "1px solid var(--border-light, var(--border-color))",
                        borderRadius: 7,
                        padding: "3px 8px",
                      }}
                      title={`Training context limit: ${nCtxTrain.toLocaleString()} tokens`}
                    >
                      <b
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        {formatCtx(nCtxTrain)}
                      </b>{" "}
                      train limit
                    </span>
                  )}
                  {modelQuant && (
                    <span
                      style={{
                        fontFamily: MONO,
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
                      data-accent-el=""
                      style={{
                        fontFamily: MONO,
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                      m?.temperature != null ? m.temperature.toFixed(2) : null,
                    testId: "sampling-temperature",
                  },
                  {
                    label: "Top-K Sampling",
                    value: fmtNum(m?.top_k) || null,
                    testId: "sampling-top-k",
                  },
                  {
                    label: "Top-P (Nucleus) Sampling",
                    value: m?.top_p != null ? m.top_p.toFixed(2) : null,
                    testId: "sampling-top-p",
                  },
                  {
                    label: "Repeat Penalty",
                    value:
                      m?.repeat_penalty != null
                        ? m.repeat_penalty.toFixed(2)
                        : null,
                    testId: "sampling-repeat-penalty",
                  },
                ] as { label: string; value: string | null; testId: string }[]
              ).map(({ label, value, testId }) => (
                <MetricTile
                  key={label}
                  accent
                  testId={testId}
                  label={label}
                  value={value ?? "—"}
                  mono
                  style={{
                    borderRadius: 10,
                    padding: "8px 5px",
                    textAlign: "center",
                  }}
                  labelSize={8}
                />
              ))}
            </div>
          </Card>

          {/* ── Throughput Card ── */}
          <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
            <CardHeader
              compact
              icon={<Zap size={13} />}
              title="Throughput"
              titleAccentBar
              right={
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
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
                data-accent-el=""
                data-testid="thrpt-gen-tps"
                style={{
                  background: "var(--accent-tint-10)",
                  border: "1px solid var(--accent-tint-40)",
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
                    color: "var(--accent-primary)",
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
                      color: m?.gen_tps != null ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: MONO,
                      lineHeight: 1,
                    }}
                  >
                    {m?.gen_tps != null
                      ? m.gen_tps.toFixed(1)
                      : heldGenTps != null
                        ? heldGenTps.toFixed(1)
                        : "—"}
                  </span>
                  {(m?.gen_tps != null || heldGenTps != null) && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {" "}
                      t/s
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    // Bounded height, not flex:1/minHeight (the pre-Q
                    // container). `stretch` ties the svg's height to 100%
                    // of THIS box, not just its width — an open-ended
                    // flex:1 with no ceiling let the bar balloon to fill
                    // whatever space the row allowed (user-reported: the
                    // whole top row grew taller). Fixed height restores
                    // the original visual size; stretch still fills WIDTH
                    // edge-to-edge, which was the actual Q fix.
                    height: 28,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <Sparkline
                    data={aiGenTpsHistory ?? []}
                    color="var(--accent-primary)"
                    stretch
                    height={28}
                  />
                </div>
              </div>

              {/* Prompt Speed banner */}
              <div
                data-accent-el=""
                data-testid="thrpt-prompt-tps"
                style={{
                  background: "var(--accent-tint-10)",
                  border: "1px solid var(--accent-tint-40)",
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
                    color: "var(--accent-primary)",
                    marginBottom: 2,
                  }}
                >
                  Last Prompt Speed
                </div>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 3 }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: m?.prompt_tps != null ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: MONO,
                      lineHeight: 1,
                    }}
                  >
                    {m?.prompt_tps != null
                      ? m.prompt_tps.toFixed(1)
                      : heldPromptTps != null
                        ? heldPromptTps.toFixed(1)
                        : "—"}
                  </span>
                  {(m?.prompt_tps != null || heldPromptTps != null) && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {" "}
                      t/s
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    // Bounded height, not flex:1/minHeight (the pre-Q
                    // container). `stretch` ties the svg's height to 100%
                    // of THIS box, not just its width — an open-ended
                    // flex:1 with no ceiling let the bar balloon to fill
                    // whatever space the row allowed (user-reported: the
                    // whole top row grew taller). Fixed height restores
                    // the original visual size; stretch still fills WIDTH
                    // edge-to-edge, which was the actual Q fix.
                    height: 28,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <Sparkline
                    data={aiPromptTpsHistory ?? []}
                    color="var(--accent-primary)"
                    stretch
                    height={28}
                  />
                </div>
              </div>

              {/* Token stat tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 6,
                }}
              >
                <MetricTile
                  accent
                  testId="thrpt-prompt-tokens"
                  label="Prompt Tokens"
                  value={fmtCount(tokenUsage?.prompt_tokens) || "0"}
                  mono
                  style={{ borderRadius: 9, padding: "6px 10px" }}
                  valueSize={17}
                />
                <MetricTile
                  accent
                  testId="thrpt-generated"
                  label="Generated"
                  // User-reported: the value didn't fit the tile
                  // ("464,408..." truncated by MetricTile's own
                  // ellipsis). Root cause: this was the ONLY one of the
                  // four throughput tiles appending a literal unit
                  // suffix (" token") to its number — Prompt Tokens and
                  // Total Sent both show bare numbers. The label itself
                  // ("Generated") already conveys what's being counted;
                  // the suffix was redundant AND the direct cause of the
                  // overflow. Matches the sibling tiles' convention now.
                  value={fmtCount(tokenUsage?.completion_tokens) || "0"}
                  mono
                  style={{ borderRadius: 9, padding: "6px 10px" }}
                  valueSize={17}
                />
                <MetricTile
                  accent
                  testId="thrpt-total-sent"
                  label="Total Sent"
                  value={fmtCount(m?.total_tokens_sent) || "0"}
                  mono
                  style={{ borderRadius: 9, padding: "6px 10px" }}
                  valueSize={17}
                />
                <MetricTile
                  accent
                  testId="thrpt-active-req"
                  label="Active Req"
                  value={fmtNum(m?.active_requests) || "0"}
                  mono
                  style={{ borderRadius: 9, padding: "6px 10px" }}
                  valueSize={17}
                />
              </div>
            </div>
          </Card>

          {/* ── Context Card ── */}
          <Card role={null} baseClass="" style={PANEL_CARD_STYLE}>
            <CardHeader
              compact
              icon={<Brain size={13} />}
              title="Context"
              titleAccentBar
              right={
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
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
              {/* Gauge + tiles */}
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
                      fontFamily: MONO,
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
                            : null,
                        color: "var(--accent-primary)",
                        span: false,
                        testId: "ctx-current",
                      },
                      {
                        label: "Max",
                        value:
                          slotCtx != null ? slotCtx.toLocaleString() : null,
                        span: false,
                        testId: "ctx-max",
                      },
                      {
                        label: "Remaining",
                        value:
                          slotCtx != null && slotCurrentTokens != null
                            ? (slotCtx - slotCurrentTokens).toLocaleString()
                            : null,
                        span: false,
                        testId: "ctx-remaining",
                      },
                      {
                        label: "Cache Rate",
                        value: (() => {
                          const cached = m?.prompt_tokens_cached;
                          const prompt = m?.token_usage?.prompt_tokens;
                          if (cached == null || prompt == null) return null;
                          const denom = prompt + cached;
                          return denom > 0
                            ? `${((cached / denom) * 100).toFixed(1)}%`
                            : null;
                        })(),
                        span: false,
                        testId: "ctx-cache-hits",
                      },
                      {
                        label: "Largest Seen",
                        value:
                          m?.n_tokens_max != null
                            ? m.n_tokens_max.toLocaleString()
                            : null,
                        span: true,
                        testId: "ctx-largest-seen",
                      },
                    ] as {
                      label: string;
                      value: string | null;
                      color?: string;
                      span: boolean;
                      testId: string;
                    }[]
                  ).map(({ label, value, color, span, testId }) => (
                    <MetricTile
                      key={label}
                      accent
                      testId={testId}
                      label={label}
                      value={value}
                      color={color}
                      mono
                      style={{
                        borderRadius: 8,
                        padding: "6px 10px",
                        gridColumn: span ? "1 / -1" : undefined,
                      }}
                      valueSize={16}
                      labelSize={8.5}
                    />
                  ))}
                </div>
              </div>
              {/* Generation strip: status dot + this reply's token count */}
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
                      Generation
                    </span>
                    <span
                      data-testid="gen-status-badge"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 8,
                        fontFamily: MONO,
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 8,
                      fontFamily: MONO,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {(() => {
                      const nd = slot0.n_decoded;
                      const np = slot0.n_predict;
                      const nr = slot0.n_remain;
                      const unbounded = np == null || np <= 0;
                      // np (n_predict) is this REQUEST's generation-length cap
                      // — a separate limit from the model's context window
                      // (n_ctx, shown above as MAX). They can legitimately
                      // differ a lot (a launch script can set n_predict far
                      // higher than n_ctx). Both numbers being unlabeled in
                      // the same "CONTEXT" card, both using the word
                      // "Remaining", made them look like one contradictory
                      // metric — user-reported. Labels below make the two
                      // ceilings unambiguous without changing either value.
                      // n_decoded is a VALUE, not a label. At fontSize 8 it was
                      // the smallest text on the page, in the lowest-contrast
                      // colour, and unlabelled — so it read as a duplicate of
                      // CURRENT two tiles away. It is not: CURRENT is total
                      // context in use (prompt + generation), this is tokens
                      // produced in THIS reply. Number at the card's value size,
                      // descriptor at its label size — MetricTile's own pattern
                      // (the Context tiles above use 16 / 8.5).
                      //
                      // The descriptor is kept SHORT and the number is never
                      // widened by a suffix: appending " token" to a count in
                      // this card caused two user-reported truncations already
                      // (see LlamaCppPage.test.tsx "no redundant unit suffix"
                      // and "counter tiles compact at >=1M").
                      return unbounded ? (
                        <span
                          data-testid="gen-decoded"
                          title="Tokens generated in this reply (n_decoded) — not the total context in use, shown as CURRENT above"
                          style={{
                            display: "inline-flex",
                            alignItems: "baseline",
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: GEN_VALUE_SIZE,
                              color: "var(--text-primary)",
                            }}
                          >
                            {nd != null ? nd.toLocaleString() : "—"}
                          </span>
                          {/* A real space, not a flex `gap` — the gap is
                              visual only, so textContent (and anything
                              copying or reading it aloud) saw "58,069tokens". */}
                          <span style={{ fontSize: GEN_LABEL_SIZE }}>
                            {" "}
                            {nd === 1 ? "token" : "tokens"} generated this reply
                          </span>
                        </span>
                      ) : (
                        <>
                          <span
                            data-testid="gen-decoded"
                            title="Tokens generated in this reply (n_decoded) against this request's generation-length cap (n_predict) — separate from the model's context window shown above"
                            style={{
                              display: "inline-flex",
                              alignItems: "baseline",
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: GEN_VALUE_SIZE,
                                color: "var(--text-primary)",
                              }}
                            >
                              {nd != null ? nd.toLocaleString() : "—"}
                            </span>
                            {/* Real space, not a flex `gap` — see above. */}
                            <span style={{ fontSize: GEN_LABEL_SIZE }}>
                              {" "}
                              / {np.toLocaleString()} gen. limit
                            </span>
                          </span>
                          <span title="Tokens remaining before hitting the generation-length cap, not the context window">
                            Gen. remaining{" "}
                            {nr != null ? nr.toLocaleString() : "—"}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </Card>
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
            <Card
              role={null}
              baseClass=""
              style={{ ...PANEL_CARD_STYLE, flex: 1, minHeight: 0 }}
            >
              <CardHeader
                compact
                icon={<Activity size={13} />}
                title="Runtime"
                titleAccentBar
                right={
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: MONO,
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
                <KvRow
                  icon={<Server size={11} />}
                  label="Server"
                  value={llamaOnline ? "Online" : "Offline"}
                  valueColor={
                    llamaOnline ? "var(--success)" : "var(--text-muted)"
                  }
                  testId="runtime-server"
                />
                <KvRow
                  icon={<Clock3 size={11} />}
                  label="Uptime"
                  value={fmtUptime(proc?.uptime_seconds)}
                  testId="runtime-uptime"
                />
                <KvRow
                  icon={<Zap size={11} />}
                  label="Load Time"
                  value={
                    m?.model_load_time_ms != null
                      ? `${(m.model_load_time_ms / 1000).toFixed(2)}s`
                      : "—"
                  }
                  testId="runtime-load-time"
                />
                <KvRow
                  icon={<Fingerprint size={11} />}
                  label="PID"
                  value={proc?.pid != null ? String(proc.pid) : "—"}
                  testId="runtime-pid"
                />
                <KvRow
                  icon={<Globe size={11} />}
                  label="Port"
                  value={
                    runningArgs?.port != null ? String(runningArgs.port) : "—"
                  }
                  testId="runtime-port"
                />
                <KvRow
                  icon={<MemoryStick size={11} />}
                  label="Memory"
                  value={fmtKb(proc?.memory_kb)}
                  testId="runtime-memory"
                />
                <KvRow
                  icon={<Cpu size={11} />}
                  label="CPU"
                  value={
                    proc?.cpu_percent != null
                      ? `${proc.cpu_percent.toFixed(1)}%`
                      : "—"
                  }
                  testId="runtime-cpu"
                />
                <KvRow
                  icon={<Brain size={11} />}
                  label="Context"
                  value={slotCtx != null ? formatCtx(slotCtx) : "—"}
                  testId="runtime-context"
                />
                <KvRow
                  icon={<MonitorCog size={11} />}
                  label="GPU Layers"
                  value={
                    gpuTotalLoaded != null && gpuTotalLayers != null
                      ? `${gpuTotalLoaded} / ${gpuTotalLayers}`
                      : "—"
                  }
                  valueColor={
                    gpuOffloadPct === 100 ? "var(--success)" : undefined
                  }
                  testId="runtime-gpu-layers"
                />
                <KvRow
                  icon={<Layers size={11} />}
                  label="CPU Layers"
                  value={
                    gpuOffload != null
                      ? `${gpuOffload.main_total - gpuOffload.main_loaded} / ${gpuOffload.main_total}`
                      : "—"
                  }
                  valueColor={
                    gpuOffload != null &&
                    gpuOffload.main_loaded === gpuOffload.main_total
                      ? "var(--success)"
                      : undefined
                  }
                  testId="runtime-cpu-layers"
                />
                <KvRow
                  icon={<Layers size={11} />}
                  label="Draft Layers"
                  value={
                    hasDraft && gpuOffload != null
                      ? `${gpuOffload.draft_loaded} / ${gpuOffload.draft_total}`
                      : runningArgs?.spec_type && runningArgs.spec_type !== "draft"
                      ? `n/a — ${specLabel(runningArgs.spec_type)}`
                      : "—"
                  }
                  valueColor={hasDraft ? "var(--success)" : undefined}
                  testId="runtime-draft-layers"
                />
                <KvRow
                  icon={<Zap size={11} />}
                  label="Speculative"
                  value={boolLabel(m?.speculative)}
                  valueColor={m?.speculative ? "var(--success)" : undefined}
                  testId="runtime-speculative"
                />
                {m?.spec_draft_tokens != null &&
                  m?.spec_accepted_tokens != null && (
                    <KvRow
                      icon={<Zap size={11} />}
                      label="Draft accept"
                      value={
                        m.spec_draft_tokens > 0
                          ? `${((m.spec_accepted_tokens / m.spec_draft_tokens) * 100).toFixed(1)}%`
                          : "—"
                      }
                      testId="runtime-draft-accept"
                    />
                  )}
                <KvRow
                  icon={<Database size={11} />}
                  label="Tokens Cached"
                  value={fmtNum(tokCached)}
                  testId="runtime-tokens-cached"
                  wide
                />
              </div>
            </Card>

            {/* llama.cpp card */}
            <Card
              role={null}
              baseClass=""
              style={{ ...PANEL_CARD_STYLE, flexShrink: 0 }}
            >
              <CardHeader
                compact
                icon={<Package size={13} />}
                title="llama.cpp"
                titleAccentBar
                right={
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: MONO,
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
                  <MetricTile
                    accent
                    label="Current"
                    value={mgmt.repoInfo?.local_build_tag || "—"}
                    mono
                    style={{ flex: 1, borderRadius: 10, padding: "7px 10px" }}
                    labelSize={8}
                    valueSize={14}
                  />
                  <MetricTile
                    accent
                    label="Latest"
                    value={mgmt.repoInfo?.latest_build_tag || "—"}
                    color="var(--accent-primary)"
                    mono
                    style={{ flex: 1, borderRadius: 10, padding: "7px 10px" }}
                    labelSize={8}
                    valueSize={14}
                  />
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
                      className="accent-glow-target btn-glow"
                      data-accent-el=""
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
                      <span className="sheen-flow-overlay" aria-hidden />
                      <span className="bright-breathe" />
                      <span className="bright-surge" />
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

                {/* Update progress */}
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
                      data-accent-el=""
                      onClick={() => mgmt.setOutputOpen(true)}
                      className="btn-glow"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "2px 5px",
                        fontSize: 9,
                        fontWeight: 600,
                        background: "var(--accent-tint-10)",
                        border: "1px solid var(--accent-tint-40)",
                        borderRadius: 5,
                        cursor: "pointer",
                        color: "var(--accent-primary)",
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
                    data-accent-el=""
                    onClick={() => mgmt.openTerminal()}
                    disabled={!hasDir}
                    className="btn-glow"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      background: "var(--accent-tint-10)",
                      border: "1px solid var(--accent-tint-40)",
                      borderRadius: 10,
                      fontSize: 9,
                      color: !hasDir
                        ? "var(--text-muted)"
                        : "var(--accent-primary)",
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
                    data-accent-el=""
                    onClick={() =>
                      mgmt.readmeUrl &&
                      window.open(
                        mgmt.readmeUrl,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    disabled={!mgmt.readmeUrl}
                    className="btn-glow"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      background: "var(--accent-tint-10)",
                      border: "1px solid var(--accent-tint-40)",
                      borderRadius: 10,
                      fontSize: 9,
                      color: !mgmt.readmeUrl
                        ? "var(--text-muted)"
                        : "var(--accent-primary)",
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
                    data-accent-el=""
                    href="https://github.com/ggml-org/llama.cpp/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "8px 4px",
                      background: "var(--accent-tint-10)",
                      border: "1px solid var(--accent-tint-40)",
                      borderRadius: 10,
                      fontSize: 9,
                      color: "var(--accent-primary)",
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
            </Card>
          </div>

          {/* ── Work area: Run Models + Console ── */}
          <div
            ref={workAreaRef}
            data-testid="llama-work-area"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {/* Run Models */}
            <div
              data-accent-el=""
              style={{
                position: "relative",
                flex: "none",
                height: split.height,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <AccentSpine />
              <RunModelsSection />
            </div>

            {/* ── Splitter (T238) ──
                Occupies the container's former `gap: 9`, so spacing at rest is
                unchanged. Visual band is 9px; the hit area is widened to ~17px
                by an overlay with negative inset, which does NOT push the cards
                apart the way a thicker strip would. */}
            <div
              data-testid="llama-split-strip"
              onDoubleClick={split.reset}
              style={{
                position: "relative",
                height: 9,
                flex: "none",
                cursor: "row-resize",
              }}
            >
              <div
                data-testid="llama-split-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize Run Models"
                onPointerDown={split.onPointerDown}
                onPointerMove={split.onPointerMove}
                onPointerUp={split.onPointerUp}
                onPointerCancel={split.onPointerCancel}
                className="llama-split-hit"
                style={{
                  position: "absolute",
                  insetInline: 0,
                  top: -4,
                  bottom: -4,
                  cursor: "row-resize",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  touchAction: "none",
                }}
              >
                {/* Always-visible grip: a handle nobody can see is not a feature. */}
                <span
                  style={{
                    height: 3,
                    width: 44,
                    borderRadius: 2,
                    background: split.dragging
                      ? "var(--accent-primary)"
                      : "var(--border-light, var(--border-color))",
                    transition: "background 120ms",
                  }}
                />
              </div>

              {/* Reset is the second half of the gesture, used on every
                  browse-then-restore cycle — so it is a visible control, not
                  only the double-click. Sits on the strip because that is where
                  the eye already is at the end of a drag. Hidden at the default
                  height so it is not permanent clutter. */}
              {split.isModified && (
                <button
                  type="button"
                  data-testid="llama-split-reset"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={split.reset}
                  title={`Reset Run Models to ${DEFAULT_RUN_MODELS_HEIGHT}px`}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 2,
                    font: "600 9px Inter, system-ui, sans-serif",
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: 999,
                    cursor: "pointer",
                    color: "var(--accent-primary)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--accent-tint-40)",
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Console */}
            <div
              data-accent-el=""
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                border: "1px solid var(--border-light, var(--border-color))",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <AccentSpine />
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
        processMetrics={m?.llama_server_process}
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
