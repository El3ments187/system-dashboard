import { useMetricsContext } from '../../context/MetricsContext';
import { MemoryStick } from 'lucide-react';
import PanelErrorBoundary from '../common/PanelErrorBoundary';
import PanelErrorState from '../common/PanelErrorState';
import { useTooltip } from '../../components/common/TooltipProvider';
import { getMetricDescription } from '../../data/metricDescriptions';

interface CardProps {
  accent: { color: string; glow: string };
}

export default function MemoryCard({ accent }: CardProps) {
  const tooltip = useTooltip();
  const { memoryCurrentValues, memoryLoading, memoryError, retryMemory } = useMetricsContext();

  const currentValue = memoryCurrentValues[0];
  const usedValue = memoryCurrentValues[1];
  const totalValue = memoryCurrentValues[2];
  const swapUsedValue = memoryCurrentValues[3];
  const swapTotalValue = memoryCurrentValues[4];

  const getStatus = (val: number | null) => {
    if (val === null) return 'normal';
    if (val < 70) return 'good';
    if (val < 90) return 'warn';
    return 'bad';
  };

  const status = getStatus(currentValue);
  let statusColor: string;
  if (status === 'good') statusColor = '#22c192';
  else if (status === 'warn') statusColor = '#f59b1c';
  else statusColor = '#e84747';

  let statusLabel: string;
  if (status === 'good') statusLabel = 'Normal';
  else if (status === 'warn') statusLabel = 'Warning';
  else statusLabel = 'Critical';

  if (memoryError) {
    return (
      <PanelErrorBoundary panelName="Memory">
        <PanelErrorState
          panelName="Memory"
          error={new Error(memoryError)}
          errorInfo={null}
          onRetry={retryMemory}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panelName="Memory">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MemoryStick size={20} style={{ color: accent.color }} />
            <span className="card-title">Memory</span>
          </div>
          <div className="card-status">
            <div className="status-dot" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div className="card-value">
          {memoryLoading ? '\u2014' : currentValue !== null ? currentValue.toFixed(1) : '\u2014'}
          <span className="card-unit">%</span>
        </div>
        <div className="card-progress">
          <div
            className="card-progress-bar"
            style={{
              width: `${Math.min(currentValue || 0, 100)}%`,
              background: `linear-gradient(90deg, ${accent.color}, ${accent.glow})`,
            }}
          />
        </div>
        <div className="card-details">
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('memory_used'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Used</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {usedValue !== null ? `${usedValue.toFixed(1)} GB` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('memory_total'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Total</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {totalValue !== null ? `${totalValue.toFixed(1)} GB` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('memory_swap_used'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Swap Used</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {swapUsedValue !== null ? `${swapUsedValue.toFixed(1)} GB` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item"
            onMouseEnter={(e) => { const desc = getMetricDescription('memory_swap_total'); if (desc) tooltip.setCardTooltip({ title: desc.title, description: desc.description, unit: desc.unit }, e); }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Swap Total</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {swapTotalValue !== null ? `${swapTotalValue.toFixed(1)} GB` : '\u2014'}
            </span>
          </div>
          <div className="card-filler" />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
