import { useMetricsContext } from "../../context/MetricsContext";
import { HardDrive, ArrowUp, ArrowDown } from "lucide-react";
import ProgressBar from "../shared/ProgressBar";
import { useProgressStatus } from "../../hooks/useProgressStatus";

interface CardProps {
  accent?: { color: string; glow: string };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (Math.abs(bytes) / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function formatBytesPerSec(bps: number): string {
  if (bps <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(
    Math.floor(Math.log(bps) / Math.log(1024)),
    units.length - 1,
  );
  return (bps / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

export default function StorageSummaryCard(_props: CardProps) {
  const { storageDevices, storageLoading } = useMetricsContext();

  const devices = storageDevices || [];
  const allMounts = devices.flatMap((d) => d.mounts);

  const totalUsed = allMounts.reduce((s, m) => s + m.used_bytes, 0);
  const totalCapacity = allMounts.reduce((s, m) => s + m.total_bytes, 0);
  const totalFree = allMounts.reduce((s, m) => s + m.free_bytes, 0);
  const overallUtil = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  const totalReadBps = devices.reduce(
    (s, d) => s + (d.io_stats?.read_bytes_per_sec || 0),
    0,
  );
  const totalWriteBps = devices.reduce(
    (s, d) => s + (d.io_stats?.write_bytes_per_sec || 0),
    0,
  );

  const { color: statusColor, label: statusLabel } =
    useProgressStatus(overallUtil);

  if (storageLoading) {
    return (
      <div className="metric-card" style={{ opacity: 0.5 }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={20} style={{ color: "var(--accent-primary)" }} />
            <span className="card-title">Storage</span>
          </div>
          <div className="card-status">
            <div
              className="status-dot"
              style={{ background: "var(--success)" }}
            />
            <span style={{ color: "var(--success)" }}>Active</span>
          </div>
        </div>
        <div className="card-value">
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={0} />
        <div style={{ padding: "8px 0" }}>
          <div
            className="skeleton"
            style={{ height: 36, width: "100%", marginBottom: 8 }}
          />
          <div
            className="skeleton"
            style={{ height: 36, width: "100%", marginBottom: 8 }}
          />
          <div className="skeleton" style={{ height: 36, width: "100%" }} />
        </div>
      </div>
    );
  }

  if (allMounts.length === 0) {
    return (
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HardDrive size={20} style={{ color: "var(--accent-primary)" }} />
            <span className="card-title">Storage</span>
          </div>
          <div className="card-status">
            <div
              className="status-dot"
              style={{ background: "var(--success)" }}
            />
            <span style={{ color: "var(--success)" }}>Active</span>
          </div>
        </div>
        <div className="card-value">
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={0} />
        <div
          style={{
            color: "var(--text-muted)",
            textAlign: "center",
            padding: 24,
          }}
        >
          No storage devices detected
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HardDrive size={20} style={{ color: "var(--accent-primary)" }} />
          <span className="card-title">Storage</span>
        </div>
        <div className="card-status">
          <div className="status-dot" style={{ background: statusColor }} />
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
      <div className="card-value">
        {overallUtil.toFixed(1)}
        <span className="card-unit">%</span>
      </div>
      <ProgressBar percent={overallUtil} />

      {/* Capacity breakdown */}
      <div style={{ padding: "8px 0", marginBottom: 4 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 4,
          }}
        >
          <span>{formatBytes(totalUsed)} used</span>
          <span>{formatBytes(totalCapacity)} total</span>
        </div>
        <ProgressBar percent={overallUtil} variant="compact" />
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {formatBytes(totalFree)} free
        </div>
      </div>

      {/* Performance stats */}
      <div style={{ padding: "8px 0" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 6,
          }}
        >
          Performance
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "4px 8px",
              background: "var(--bg-secondary)",
              borderRadius: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ArrowUp size={12} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Read
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--accent-primary)",
              }}
            >
              {formatBytesPerSec(totalReadBps)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "4px 8px",
              background: "var(--bg-secondary)",
              borderRadius: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ArrowDown size={12} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Write
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--accent-primary)",
              }}
            >
              {formatBytesPerSec(totalWriteBps)}
            </span>
          </div>
        </div>
      </div>

      <div className="card-filler" />
    </div>
  );
}
