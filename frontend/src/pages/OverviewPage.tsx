import { useMemo } from "react";
import { useMetricsContext } from "../context/MetricsContext";
import MetricChart from "../charts/MetricChart";
import RadialGauge from "../components/overview/RadialGauge";
import OverviewStorageChart from "../components/overview/OverviewStorageChart";
import { useProgressStatus } from "../hooks/useProgressStatus";
import { AccentSpine, Card } from "../components/shared/CardComponents";

interface Props {
  accent: { color: string; glow: string };
}

// ── Utility helpers ────────────────────────────────────────────────────────

function mountBarColor(pct: number): string {
  if (pct >= 85) return "#e56a61";
  if (pct >= 60) return "#e6a95c";
  return "var(--accent-fill)";
}

function fmtBps(bps: number): string {
  if (bps <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.min(
    Math.floor(Math.log(bps) / Math.log(1024)),
    units.length - 1,
  );
  return (bps / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 ** 3) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes < 1024 ** 4) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  return (bytes / 1024 ** 4).toFixed(1) + " TB";
}

function driveUsagePct(device: any): number {
  if (!device.mounts?.length) return 0;
  let used = 0,
    total = 0;
  for (const m of device.mounts) {
    used += m.used_bytes ?? 0;
    total += m.total_bytes ?? 0;
  }
  return total > 0 ? (used / total) * 100 : 0;
}

function fmtFreq(current: number | null, max: number): string {
  const cur = current != null ? `${Math.round(current)} MHz` : "\u2014";
  if (max > 0) return `${cur} / ${Math.round(max)} MHz`;
  return cur;
}

// ── Icon SVGs (from mockup) ────────────────────────────────────────────────

const GpuIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="9" cy="12" r="2.5" />
    <path d="M15 10v4M18 10v4M6 18v3M12 18v3" />
  </svg>
);

const CpuIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
  </svg>
);

const MemIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="7" width="18" height="8" rx="1.5" />
    <path d="M7 15v3M12 15v3M17 15v3" />
    <path d="M8 11h1M15 11h1" />
  </svg>
);

const StorIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 12H2M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.5z" />
    <path d="M6 16h.01M10 16h.01" />
  </svg>
);

const ChartIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

// ── Sub-components ─────────────────────────────────────────────────────────

function OvBadge({ pct }: { pct: number }) {
  const { color, label } = useProgressStatus(pct);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color,
        background: `${color}20`,
        borderRadius: 20,
        padding: "3px 9px",
      }}
    >
      <span
        style={{
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

function OvKV({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 16,
        alignItems: "baseline",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        className="card-detail-value"
        style={{
          color: "var(--text-primary)",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function OvCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      role={null}
      baseClass="ov-card"
      innerClassName="ov-card-inner"
      style={{ position: "relative" }}
      className={className}
    >
      {children}
    </Card>
  );
}

function OvCardHead({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge: React.ReactNode;
}) {
  return (
    <div className="ov-card-head">
      <div className="ov-card-title-row">
        <span className="ov-card-ic">{icon}</span>
        {title}
      </div>
      {badge}
    </div>
  );
}

function OvLegendSwatch({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed?: boolean;
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: "var(--text-secondary)",
      }}
    >
      {dashed ? (
        <span
          style={{
            width: 9,
            height: 0,
            borderBottom: `2px dashed ${color}`,
            display: "inline-block",
          }}
        />
      ) : (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: color,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </span>
  );
}

function OvChartCard({
  title,
  note,
  legend,
  children,
}: {
  title: string;
  note: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ov-card" data-accent-el="" style={{ position: "relative" }}>
      <AccentSpine />
      <div className="ov-card-inner">
        <div className="ov-chart-head">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              minWidth: 0,
            }}
          >
            <div className="ov-chart-title">
              <ChartIcon />
              {title}
            </div>
            {legend && <div className="ov-legend">{legend}</div>}
          </div>
          <span className="ov-subnote">{note}</span>
        </div>
        <div className="ov-chart-wrap">{children}</div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function OverviewPage({ accent }: Props) {
  const {
    gpuCurrentValues,
    gpuHistory,
    cpuCurrentValues,
    cpuHistory,
    cpuMaxFrequency,
    memoryCurrentValues,
    memoryHistory,
    swapHistory,
    storageDevices,
    storageHistories,
  } = useMetricsContext();

  const gpuUtil = gpuCurrentValues[0] ?? 0;
  const gpuTemp = gpuCurrentValues[1];
  const gpuVramUsed = gpuCurrentValues[2];
  const gpuVramTotal = gpuCurrentValues[3];
  const gpuPower = gpuCurrentValues[4];
  const gpuPowerLimit = gpuCurrentValues[5];

  const cpuUtil = cpuCurrentValues[0] ?? 0;
  const cpuTemp = cpuCurrentValues[1];
  const cpuFreq = cpuCurrentValues[2];
  const cpuCores = cpuCurrentValues[3];
  const cpuThreads = cpuCurrentValues[4];
  const cpuLoad1 = cpuCurrentValues[5];
  const cpuLoad5 = cpuCurrentValues[6];
  const cpuLoad15 = cpuCurrentValues[7];

  const memUtil = memoryCurrentValues[0] ?? 0;
  const memUsed = memoryCurrentValues[1];
  const memTotal = memoryCurrentValues[2];
  const swapUsed = memoryCurrentValues[3];
  const swapTotal = memoryCurrentValues[4];

  // Merged memory+swap data for the chart
  const memChartData = useMemo(() => {
    if (!memoryHistory || !swapHistory) return [];
    const result: any[] = [];
    const allSlots = new Set([
      ...memoryHistory.map((p: any) => p.slot),
      ...swapHistory.map((p: any) => p.slot),
    ]);
    for (const slot of allSlots) {
      const memPt = memoryHistory.find((p: any) => p.slot === slot);
      const swpPt = swapHistory.find((p: any) => p.slot === slot);
      const ts = memPt?.timestamp ? new Date(memPt.timestamp) : new Date();
      result.push({
        slot,
        timestamp: ts,
        memory: memPt?.value != null ? Math.round(memPt.value * 10) / 10 : null,
        swap: swpPt?.value != null ? Math.round(swpPt.value * 10) / 10 : null,
      });
    }
    return result.sort((a, b) => a.slot - b.slot);
  }, [memoryHistory, swapHistory]);

  return (
    <main className="ov-grid dashboard-grid">
      {/* ── GPU ── */}
      <OvCard className="overview-gpu-row">
        <OvCardHead
          icon={<GpuIcon />}
          title="GPU"
          badge={<OvBadge pct={gpuUtil} />}
        />
        <div className="ov-statrow">
          <RadialGauge pct={gpuUtil} />
          <div className="ov-statmeta">
            <OvKV
              label="Temperature"
              value={
                gpuTemp != null ? `${gpuTemp.toFixed(0)}\u00B0C` : "\u2014"
              }
            />
            <OvKV
              label="Power draw"
              value={
                gpuPower != null && gpuPowerLimit != null
                  ? `${gpuPower.toFixed(0)} / ${gpuPowerLimit.toFixed(0)} W`
                  : "\u2014"
              }
            />
            <OvKV
              label="VRAM used"
              value={
                gpuVramUsed != null && gpuVramTotal != null
                  ? `${gpuVramUsed.toFixed(1)} / ${gpuVramTotal.toFixed(1)} GB`
                  : "\u2014"
              }
            />
          </div>
        </div>
      </OvCard>

      <OvChartCard title="GPU utilization" note="last 60s">
        <MetricChart
          accent={accent}
          title=""
          data={gpuHistory ?? []}
          style={{
            height: "100%",
            flex: "none",
            padding: 0,
            backgroundColor: "transparent",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
          }}
        />
      </OvChartCard>

      {/* ── CPU ── */}
      <OvCard className="overview-cpu-row">
        <OvCardHead
          icon={<CpuIcon />}
          title="CPU"
          badge={<OvBadge pct={cpuUtil} />}
        />
        <div className="ov-statrow">
          <RadialGauge pct={cpuUtil} />
          <div className="ov-statmeta">
            <OvKV
              label="Temperature"
              value={
                cpuTemp != null ? `${cpuTemp.toFixed(0)}\u00B0C` : "\u2014"
              }
            />
            <OvKV label="Frequency" value={fmtFreq(cpuFreq, cpuMaxFrequency)} />
            <OvKV
              label="Cores / threads"
              value={
                cpuCores != null && cpuThreads != null
                  ? `${cpuCores} / ${cpuThreads}`
                  : "\u2014"
              }
            />
            <OvKV
              label="Load"
              value={[cpuLoad1, cpuLoad5, cpuLoad15]
                .map((v) => (v != null ? v.toFixed(2) : "\u2014"))
                .join(" \u00B7 ")}
            />
          </div>
        </div>
      </OvCard>

      <OvChartCard title="CPU utilization" note="last 60s">
        <MetricChart
          accent={accent}
          title=""
          data={cpuHistory ?? []}
          style={{
            height: "100%",
            flex: "none",
            padding: 0,
            backgroundColor: "transparent",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
          }}
        />
      </OvChartCard>

      {/* ── Memory ── */}
      <OvCard className="overview-memory-row">
        <OvCardHead
          icon={<MemIcon />}
          title="Memory"
          badge={<OvBadge pct={memUtil} />}
        />
        <div className="ov-statrow">
          <RadialGauge pct={memUtil} />
          <div className="ov-statmeta">
            <OvKV
              label="Used"
              value={
                memUsed != null && memTotal != null
                  ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB`
                  : "\u2014"
              }
            />
            <OvKV
              label="Swap used"
              value={
                swapUsed != null && swapTotal != null
                  ? `${swapUsed.toFixed(1)} / ${swapTotal.toFixed(1)} GB`
                  : "\u2014"
              }
            />
          </div>
        </div>
      </OvCard>

      <OvChartCard
        title="Memory utilization"
        note="last 60s"
        legend={
          <>
            <OvLegendSwatch color="var(--accent-fill-stop-1)" label="Mem" />
            <OvLegendSwatch
              color="var(--accent-fill-stop-2)"
              dashed
              label="Swap"
            />
          </>
        }
      >
        <MetricChart
          accent={accent}
          title=""
          data={memChartData}
          dataKeys={["memory", "swap"]}
          style={{
            height: "100%",
            flex: "none",
            padding: 0,
            backgroundColor: "transparent",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
          }}
        />
      </OvChartCard>

      {/* ── Storage (one row per drive) ── */}
      {storageDevices.length === 0 ? (
        <OvCard className="storage-row">
          <OvCardHead icon={<StorIcon />} title="Storage" badge={null} />
        </OvCard>
      ) : (
        storageDevices.map((drive, i) => {
          const usagePct = driveUsagePct(drive);
          const isActive = (drive.io_stats?.utilization_percent ?? 0) > 0;
          const rdBps = drive.io_stats?.read_bytes_per_sec ?? 0;
          const wrBps = drive.io_stats?.write_bytes_per_sec ?? 0;
          const rdIops = drive.io_stats?.read_iops ?? 0;
          const wrIops = drive.io_stats?.write_iops ?? 0;
          const temp = drive.temperature_celsius;
          const histKey = drive.device.replace(/^\/dev\//, "");
          const history =
            storageHistories.get(histKey) ??
            storageHistories.get(drive.device) ??
            [];

          return (
            <StorageRowPair
              key={drive.device}
              drive={drive}
              driveIndex={i}
              usagePct={usagePct}
              isActive={isActive}
              rdBps={rdBps}
              wrBps={wrBps}
              rdIops={rdIops}
              wrIops={wrIops}
              temp={temp}
              history={history}
            />
          );
        })
      )}
    </main>
  );
}

// ── Storage row pair ───────────────────────────────────────────────────────

function StorageRowPair({
  drive,
  driveIndex,
  usagePct,
  isActive,
  rdBps,
  wrBps,
  rdIops,
  wrIops,
  temp,
  history,
}: {
  drive: any;
  driveIndex: number;
  usagePct: number;
  isActive: boolean;
  rdBps: number;
  wrBps: number;
  rdIops: number;
  wrIops: number;
  temp: number | null | undefined;
  history: any[];
}) {
  return (
    <>
      {/* Stat card */}
      <OvCard className="storage-row">
        <OvCardHead
          icon={<StorIcon />}
          title="Storage"
          badge={<OvBadge pct={usagePct} />}
        />
        <div className="ov-statrow">
          <RadialGauge pct={usagePct} />
          <div className="ov-statmeta">
            <OvKV label="Device" value={drive.device} />
            <OvKV
              label="Temperature"
              value={temp != null ? `${temp.toFixed(0)}\u00B0C` : "\u2014"}
            />
            <OvKV label="Status" value={isActive ? "Active" : "Idle"} />
            <OvKV
              label="Mounts"
              value={`${drive.mounts?.length ?? 0} mount${(drive.mounts?.length ?? 0) !== 1 ? "s" : ""}`}
            />
          </div>
        </div>
        {/* I/O line */}
        <div className="ov-io-line">
          <span>
            Read{" "}
            <b style={{ display: "inline-block", minWidth: 80 }}>
              {fmtBps(rdBps)}
            </b>
          </span>
          <span>
            Write{" "}
            <b style={{ display: "inline-block", minWidth: 80 }}>
              {fmtBps(wrBps)}
            </b>
          </span>
          <span>
            IOPS{" "}
            <b style={{ display: "inline-block", minWidth: 80 }}>
              {Math.round(rdIops)} / {Math.round(wrIops)}
            </b>
          </span>
        </div>
        {/* Mount rows */}
        <div className="ov-mount-list">
          {(drive.mounts ?? []).map((m: any) => {
            const pct = m.utilization_percent ?? 0;
            const barColor = mountBarColor(pct);
            const isAccentFill = pct < 60;
            return (
              <div key={m.mount_point} className="ov-disk">
                <span className="ov-disk-nm">{m.mount_point}</span>
                <span className="ov-disk-track">
                  <span
                    className="ov-disk-fill"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: barColor,
                      backgroundSize: isAccentFill
                        ? "var(--accent-fill-size)"
                        : undefined,
                    }}
                  />
                </span>
                <span
                  className="ov-disk-pct"
                  style={{
                    color:
                      barColor === "var(--accent-fill)"
                        ? "var(--accent-primary)"
                        : barColor,
                  }}
                >
                  {pct.toFixed(1)}%
                </span>
                <span className="ov-disk-sz">
                  {formatBytes(m.used_bytes)} / {formatBytes(m.total_bytes)}
                </span>
              </div>
            );
          })}
        </div>
      </OvCard>

      {/* Chart card */}
      <OvChartCard
        title={`Storage ${driveIndex + 1} throughput`}
        note="last 60s"
        legend={
          <>
            <OvLegendSwatch color="var(--accent-fill-stop-1)" label="Read" />
            <OvLegendSwatch
              color="var(--accent-fill-stop-2)"
              dashed
              label="Write"
            />
          </>
        }
      >
        <OverviewStorageChart data={history} />
      </OvChartCard>
    </>
  );
}
