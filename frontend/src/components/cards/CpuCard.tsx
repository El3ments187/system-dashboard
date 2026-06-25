import { useMetricsContext } from '../../context/MetricsContext';
import { Cpu } from 'lucide-react';
import PanelErrorBoundary from '../common/PanelErrorBoundary';
import PanelErrorState from '../common/PanelErrorState';
import { useTooltip } from '../../components/common/TooltipProvider';
import { getMetricDescription } from '../../data/metricDescriptions';
import ProgressBar from '../shared/ProgressBar';
import { useProgressStatus } from '../../hooks/useProgressStatus';

interface CardProps {
  accent: { color: string; glow: string };
}

export default function CpuCard({ accent }: CardProps) {
  const tooltip = useTooltip();
  const { cpuCurrentValues, cpuLoading, cpuError, retryCpu } = useMetricsContext();

  const currentValue = cpuCurrentValues[0];
  const temp = cpuCurrentValues[1];
  const freq = cpuCurrentValues[2];
  const cores = cpuCurrentValues[3];
  const threads = cpuCurrentValues[4];
  const load1 = cpuCurrentValues[5];
  const load5 = cpuCurrentValues[6];
  const load15 = cpuCurrentValues[7];

  const { color: statusColor, label: statusLabel } = useProgressStatus(currentValue);

  if (cpuLoading) {
    return (
      <PanelErrorBoundary panelName="CPU">
        <div className="metric-card" style={{ opacity: 0.5 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={16} style={{ color: accent.color }} />
              <span className="card-title">CPU</span>
            </div>
          </div>
          <div style={{ padding: 8, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton" style={{ height: 200, width: '100%' }} />
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

  if (cpuError) {
    return (
      <PanelErrorBoundary panelName="CPU">
        <PanelErrorState
          panelName="CPU"
          error={new Error(cpuError)}
          errorInfo={null}
          onRetry={retryCpu}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panelName="CPU">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={16} style={{ color: accent.color }} />
            <span className="card-title">CPU</span>
          </div>
          <div className="card-status">
            <div className="status-dot" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div className="card-value">
          {cpuLoading ? '\u2014' : currentValue !== null ? currentValue.toFixed(1) : '\u2014'}
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={currentValue ?? 0} />
        <div className="card-details">
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('cpu_temperature'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit, direction: desc.direction }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Temperature</span>
            <span className="card-detail-value" style={{ color: temp != null ? accent.color : 'var(--text-muted)' }}>
              {temp != null ? `${temp.toFixed(0)}\u00B0C` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('cpu_frequency'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit, direction: desc.direction }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Frequency</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {freq != null ? `${freq.toFixed(0)} MHz` : '\u2014'}
            </span>
          </div>
         <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('cpu_cores'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, direction: desc.direction }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Cores</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {cores != null && cores > 0 ? cores : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('cpu_threads'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, direction: desc.direction }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Threads</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {threads != null && threads > 0 ? threads : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item" style={{ gridColumn: '1 / 2' }}
            onMouseEnter={(e) => { const desc = getMetricDescription('cpu_load_1m'); if (desc) tooltip.setCardTooltip({ title: `${desc.title} / ${getMetricDescription('cpu_load_5m')?.title ?? ''} / ${getMetricDescription('cpu_load_15m')?.title ?? ''}`, description: desc.description, direction: desc.direction }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Load</span>
            <span className="card-detail-value" style={{ color: accent.color, fontSize: '14px' }}>
              {[load1, load5, load15].map(v => v != null ? v.toFixed(2) : '\u2014').join(' / ')}
            </span>
          </div>
          <div className="card-detail-item" style={{ gridColumn: '2 / 3' }}>
            <span className="card-detail-label">Status</span>
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
