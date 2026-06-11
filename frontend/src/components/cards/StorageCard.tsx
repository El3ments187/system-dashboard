import { useMetricsContext } from '../../context/MetricsContext';
import { HardDrive } from 'lucide-react';
import PanelErrorBoundary from '../common/PanelErrorBoundary';
import PanelErrorState from '../common/PanelErrorState';
import { useTooltip } from '../../components/common/TooltipProvider';
import { getMetricDescription } from '../../data/metricDescriptions';

interface CardProps {
  accent: { color: string; glow: string };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (Math.abs(bytes) / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatThroughput(bps: number): string {
  if (bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), units.length - 1);
  return (bps / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatIops(iops: number): string {
  if (iops <= 0) return '0 IOPS';
  const units = ['IOPS', 'KIOPS', 'MIOPS'];
  const i = Math.min(Math.floor(Math.log(iops) / Math.log(1000)), units.length - 1);
  return (iops / Math.pow(1000, i)).toFixed(1) + ' ' + units[i];
}

function getUtilColor(util: number): string {
  if (util < 70) return '#22c192';
  if (util < 90) return '#f59b1c';
  return '#e84747';
}

function getDeviceState(io: any): string {
  if (!io) return 'Idle';
  const totalBps = Math.abs(io.read_bytes_per_sec || 0) + Math.abs(io.write_bytes_per_sec || 0);
  if (totalBps > 1048576) return 'Busy';
  if (totalBps > 0) return 'Active';
  return 'Idle';
}

function getDeviceStateColor(state: string): string {
  switch (state) {
    case 'Busy': return '#e84747';
    case 'Active': return '#f59b1c';
    case 'Idle': return '#888';
    default: return '#22c192';
  }
}

interface StorageMount {
  device: string;
  mount_point: string;
  filesystem: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  utilization_percent: number;
}

interface DeviceStorageInfo {
  device: string;
  io_stats: {
    reads: number;
    writes: number;
    read_sectors: number;
    write_sectors: number;
    read_bytes_per_sec: number;
    write_bytes_per_sec: number;
    read_iops: number;
    write_iops: number;
  } | null;
  mounts: StorageMount[];
}

export default function StorageCard({ accent }: CardProps) {
  const tooltip = useTooltip();
  const { storageDevices, storageLoading, storageError, retryStorage } = useMetricsContext();

  const devices: DeviceStorageInfo[] = storageDevices || [];

  const allMounts = devices.flatMap(d => d.mounts);
  const totalUsed = allMounts.reduce((s, m) => s + m.used_bytes, 0);
  const totalCapacity = allMounts.reduce((s, m) => s + m.total_bytes, 0);
  const overallUtil = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  const statusColor = getUtilColor(overallUtil);
  const statusLabel = overallUtil < 70 ? 'Normal' : overallUtil < 90 ? 'Warning' : 'Critical';

  if (storageError) {
    return (
      <PanelErrorBoundary panelName="Storage">
        <PanelErrorState
          panelName="Storage"
          error={new Error(storageError)}
          errorInfo={null}
          onRetry={retryStorage}
        />
      </PanelErrorBoundary>
    );
  }

  if (storageLoading) {
    return (
      <PanelErrorBoundary panelName="Storage">
        <div className="metric-card" style={{ opacity: 0.5 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={20} style={{ color: accent.color }} />
              <span className="card-title">Storage</span>
            </div>
            <div className="card-status">
              <div className="status-dot" style={{ background: '#22c192' }} />
              <span style={{ color: '#22c192' }}>Active</span>
            </div>
          </div>
          <div className="card-value">
            <span className="card-unit">%</span>
          </div>
          <div className="card-progress">
            <div className="card-progress-bar" />
          </div>
          <div style={{ padding: '8px 0' }}>
            <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 40, width: '100%' }} />
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

  if (allMounts.length === 0) {
    return (
      <PanelErrorBoundary panelName="Storage">
        <div className="metric-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={20} style={{ color: accent.color }} />
              <span className="card-title">Storage</span>
            </div>
            <div className="card-status">
              <div className="status-dot" style={{ background: '#22c192' }} />
              <span style={{ color: '#22c192' }}>Active</span>
            </div>
          </div>
          <div className="card-value">
            <span className="card-unit">%</span>
          </div>
          <div className="card-progress">
            <div
              className="card-progress-bar"
              style={{
                width: '0%',
                background: `linear-gradient(90deg, ${accent.color}, ${accent.glow})`,
              }}
            />
          </div>
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            No storage devices detected
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

   return (
    <PanelErrorBoundary panelName="Storage">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HardDrive size={20} style={{ color: accent.color }} />
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
        <div className="card-progress">
          <div
            className="card-progress-bar"
            style={{
              width: `${Math.min(overallUtil, 100)}%`,
              background: `linear-gradient(90deg, ${getUtilColor(overallUtil)}, ${accent.glow})`,
            }}
          />
        </div>

        {/* Device groups */}
        <div className="card-details">
          {devices.map((device, di) => {
            const io = device.io_stats;
            const deviceState = getDeviceState(io);
            const stateColor = getDeviceStateColor(deviceState);

            return (
            <div key={di} style={{ marginBottom: 8, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>
              {/* Device header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: accent.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {device.device}
                </span>
              </div>
             {/* Performance metrics — grouped by type with explicit labels */}
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 8px', marginBottom: 4 }}>
                   <span style={{ fontSize: 9, color: '#4adea4', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'help' }}
                     onMouseEnter={(e) => { const desc = getMetricDescription('storage_read_throughput'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
                     onMouseLeave={() => tooltip.setCardTooltip(null)}
                   >
                     R: {io ? formatThroughput(io.read_bytes_per_sec) : 'N/A'}
                   </span>
                   <span style={{ fontSize: 9, color: '#4adea4', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'help' }}
                     onMouseEnter={(e) => { const desc = getMetricDescription('storage_write_throughput'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
                     onMouseLeave={() => tooltip.setCardTooltip(null)}
                   >
                     W: {io ? formatThroughput(io.write_bytes_per_sec) : 'N/A'}
                   </span>
                   <span style={{ fontSize: 9, color: '#6ab1ff', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'help' }}
                     onMouseEnter={(e) => { const desc = getMetricDescription('storage_read_iops'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description }, e); }}
                     onMouseLeave={() => tooltip.setCardTooltip(null)}
                   >
                     R: {io ? formatIops(io.read_iops) : 'N/A'} IOPS
                   </span>
                   <span style={{ fontSize: 9, color: '#6ab1ff', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'help' }}
                     onMouseEnter={(e) => { const desc = getMetricDescription('storage_write_iops'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description }, e); }}
                     onMouseLeave={() => tooltip.setCardTooltip(null)}
                   >
                     W: {io ? formatIops(io.write_iops) : 'N/A'} IOPS
                   </span>
                 </div>
              {/* Status row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: stateColor }} />
                <span style={{ fontSize: 9, color: stateColor }}>{deviceState}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>
                  {device.mounts.length} mount{device.mounts.length > 1 ? 's' : ''}
                </span>
              </div>
              {/* Mount rows */}
              {device.mounts.map((mount, mi) => (
                <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 14px', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mount.mount_point}
                      </span>
                      <span style={{ fontSize: 11, color: getUtilColor(mount.utilization_percent), fontFamily: 'monospace', flexShrink: 0, cursor: 'help' }}
                        onMouseEnter={(e) => { const desc = getMetricDescription('storage_utilization'); if (desc) tooltip.setCardTooltip({ title: `${mount.mount_point} - ${desc.title}`, description: desc.description, unit: desc.unit }, e); }}
                        onMouseLeave={() => tooltip.setCardTooltip(null)}
                      >
                        {mount.utilization_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="card-progress" style={{ height: 4, marginBottom: 2 }}>
                      <div
                        className="card-progress-bar"
                        style={{
                          height: 4,
                          width: `${Math.min(mount.utilization_percent, 100)}%`,
                          background: `linear-gradient(90deg, ${getUtilColor(mount.utilization_percent)}, ${accent.glow})`,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatBytes(mount.used_bytes)} / {formatBytes(mount.total_bytes)}
                  </div>
                </div>
              ))}
            </div>
            );
          })}
          <div className="card-filler" />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
