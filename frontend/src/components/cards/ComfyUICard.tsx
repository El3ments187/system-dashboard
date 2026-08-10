import { useState, useEffect } from "react";
import { useMetricsContext } from "../../context/MetricsContext";
import { testConnection, getAiSettings } from "../../services/api";
import { Settings, ExternalLink } from "lucide-react";
import MetricTile from "../shared/MetricTile";
import TerminalModal from "../TerminalModal";
import { CardShell, CardHeader, Section } from "../shared/CardComponents";
import { TestConnectionResult } from "../../types/metrics";

export default function ComfyUICard() {
  const { aiCurrentMetrics } = useMetricsContext();
  const [url, setUrl] = useState("http://localhost:8188");
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [command, setCommand] = useState("");
  const [runCommand, setRunCommand] = useState<string | null>(null);

  useEffect(() => {
    getAiSettings()
      .then((s) => setUrl(s.comfyui_url))
      .catch(() => {});
  }, []);

  const service = aiCurrentMetrics?.comfyui;
  const proc = aiCurrentMetrics?.comfyui_process;
  const online = service?.available ?? false;
  const comfyInfo = aiCurrentMetrics?.comfyui_info as any;

  const [prevOnline, setPrevOnline] = useState(online);
  if (online !== prevOnline) {
    setPrevOnline(online);
    if (online) setTestResult(null);
  }

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection(url);
      setTestResult(result);
    } catch {
      setTestResult({ url, available: false, error_message: "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const uptimeHuman = proc
    ? (() => {
        const totalSec = Math.floor(proc.uptime_seconds);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
      })()
    : null;

  return (
    <>
      <CardShell>
        <CardHeader
          icon={
            <Settings size={14} style={{ color: "var(--accent-primary)" }} />
          }
          title="COMFYUI"
          online={online}
        />

        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Section title="Status">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 5,
              }}
            >
              <MetricTile
                label="Queue"
                value={
                  comfyInfo?.queue_size != null
                    ? comfyInfo.queue_size.toString()
                    : null
                }
              />
              <MetricTile
                label="History"
                value={
                  comfyInfo?.history_size != null
                    ? comfyInfo.history_size.toString()
                    : null
                }
              />
              <MetricTile label="PID" value={proc?.pid?.toString() || null} />
            </div>
          </Section>

          <Section title="Process">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 5,
              }}
            >
              <MetricTile
                label="CPU"
                value={proc ? `${proc.cpu_percent.toFixed(1)}%` : null}
              />
              <MetricTile
                label="RAM"
                value={
                  proc
                    ? `${Math.round(proc.memory_kb / 1024).toLocaleString()} MB`
                    : null
                }
              />
              <MetricTile label="Uptime" value={uptimeHuman} />
            </div>
          </Section>

          <Section title="Endpoint">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textShadow: "var(--text-shadow-sm)",
                }}
              >
                {url}
              </span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <a
                data-accent-el=""
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "6px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--accent-primary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "#fff",
                  textDecoration: "none",
                  textShadow: "var(--text-shadow-md)",
                }}
              >
                <ExternalLink size={11} />
                Open ComfyUI
              </a>
              <button
                onClick={runTest}
                disabled={testing}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "6px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  opacity: testing ? 0.6 : 1,
                  textShadow: "var(--text-shadow-sm)",
                }}
              >
                {testing ? "Testing..." : "Test Endpoint"}
              </button>
            </div>
            {testResult && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: testResult.available
                    ? "var(--success)"
                    : "var(--danger)",
                  textShadow: "var(--text-shadow-sm)",
                }}
              >
                {testResult.available
                  ? `Connected: ${testResult.url}`
                  : testResult.error_message || "Failed"}
              </div>
            )}
          </Section>

          <Section title="Command">
            <div style={{ display: "flex", gap: 5 }}>
              <input
                id="comfyui-command"
                name="comfyui-command"
                aria-label="Command to run"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && command.trim() && setRunCommand(command)
                }
                placeholder="Enter command..."
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 10,
                  fontFamily: "monospace",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  textShadow: "var(--text-shadow-sm)",
                }}
              />
              <button
                data-accent-el=""
                onClick={() => command.trim() && setRunCommand(command)}
                style={{
                  padding: "6px 12px",
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--accent-primary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "#fff",
                  textShadow: "var(--text-shadow-md)",
                }}
              >
                Run
              </button>
            </div>
          </Section>
        </div>
      </CardShell>

      <TerminalModal
        isOpen={runCommand != null}
        onClose={() => setRunCommand(null)}
        initialCommand={runCommand ?? undefined}
      />
    </>
  );
}
