import { useMetricsContext } from '../../context/MetricsContext';
import { Monitor } from 'lucide-react';
import PanelErrorBoundary from '../common/PanelErrorBoundary';
import PanelErrorState from '../common/PanelErrorState';
import { useTooltip } from '../../components/common/TooltipProvider';
import { getMetricDescription } from '../../data/metricDescriptions';
import ProgressBar from '../shared/ProgressBar';
import { useProgressStatus } from '../../hooks/useProgressStatus';

export default function GpuCard({ accent }: { accent: { color: string; glow: string } }) {
  const tooltip = useTooltip();
  const { gpuCurrentValues, gpuLoading, gpuError, retryGpu } = useMetricsContext();

  const gpu = gpuCurrentValues[0];
  const temp = gpuCurrentValues[1];
  const vramUsed = gpuCurrentValues[2];
  const vramTotal = gpuCurrentValues[3];
  const powerDraw = gpuCurrentValues[4];
  const powerLimit = gpuCurrentValues[5];

  const { color: statusColor, label: statusLabel } = useProgressStatus(gpu);

  if (gpuLoading) {
    return (
      <PanelErrorBoundary panelName="GPU">
        <div className="metric-card" style={{ opacity: 0.5 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={16} style={{ color: accent.color }} />
              <span className="card-title">GPU</span>
            </div>
          </div>
          <div style={{ padding: 8, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton" style={{ height: 200, width: '100%' }} />
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

  if (gpuError) {
    return (
      <PanelErrorBoundary panelName="GPU">
        <PanelErrorState
          panelName="GPU"
          error={new Error(gpuError)}
          errorInfo={null}
          onRetry={retryGpu}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panelName="GPU">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Monitor size={16} style={{ color: accent.color }} />
            <span className="card-title">GPU</span>
          </div>
          <div className="card-status">
            <div className="status-dot" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div className="card-value">
          {gpuLoading ? '\u2014' : gpu != null ? gpu.toFixed(1) : '\u2014'}
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={gpu ?? 0} />
        <div className="card-details">
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('gpu_temperature'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Temperature</span>
            <span className="card-detail-value" style={{ color: temp != null ? accent.color : 'var(--text-muted)' }}>
              {temp != null ? `${temp.toFixed(0)}°C` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('gpu_vram_used'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">VRAM Used</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
            {vramUsed != null && vramTotal != null
                 ? `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`
              : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('gpu_power_draw'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Power Draw</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
            {powerDraw != null && powerLimit != null
                 ? `${powerDraw.toFixed(0)}W / ${powerLimit.toFixed(0)}W`
              : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item">
            <span className="card-detail-label">Status</span>
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
          <div className="card-filler" />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
