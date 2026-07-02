import { useState, useEffect } from "react";
import { useMetricsContext } from "../../context/MetricsContext";
import { getAiSettings } from "../../services/api";
import { Code2, ExternalLink } from "lucide-react";
import MetricTile from "../shared/MetricTile";
import { CardShell, CardHeader, Section } from "../shared/CardComponents";

export default function OpenCodeCard() {
  const { aiCurrentMetrics } = useMetricsContext();
  const [url, setUrl] = useState("http://localhost:4000");

  useEffect(() => {
    getAiSettings()
      .then((s) => setUrl(s.opencode_url))
      .catch(() => {});
  }, []);

  const service = aiCurrentMetrics?.opencode;
  const proc = aiCurrentMetrics?.opencode_process;
  const online = service?.available ?? false;

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
    <CardShell>
      <CardHeader
        icon={<Code2 size={14} style={{ color: "var(--accent-primary)" }} />}
        title="OPENCODE"
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
        <Section title="Process">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 5,
            }}
          >
            <MetricTile
              label="Status"
              value={online ? "Active" : "Inactive"}
              color={online ? "var(--success)" : "var(--danger)"}
            />
            <MetricTile label="State" value={null} />
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

        <Section title="Work">
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}
          >
            <MetricTile label="Current Task" value={null} />
            <MetricTile label="Task Progress" value={null} />
          </div>
        </Section>

        <Section title="Project">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 5,
            }}
          >
            <MetricTile label="Project Name" value={null} />
            <MetricTile label="Files Changed" value={null} />
            <MetricTile label="Additions" value={null} color="var(--success)" />
            <MetricTile label="Deletions" value={null} color="var(--danger)" />
          </div>
        </Section>

        <Section title="Endpoint">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                flex: 1,
                fontSize: 11,
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
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 700,
                background: "var(--accent-primary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#fff",
                textDecoration: "none",
                textShadow: "var(--text-shadow-md)",
              }}
            >
              <ExternalLink size={12} />
              Open in Browser
            </a>
          </div>
        </Section>
      </div>
    </CardShell>
  );
}
