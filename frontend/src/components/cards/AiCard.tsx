import { useMetricsContext } from '../../context/MetricsContext';
import { BrainCircuit } from 'lucide-react';
import PanelErrorBoundary from '../common/PanelErrorBoundary';
import PanelErrorState from '../common/PanelErrorState';
import ProgressBar from '../shared/ProgressBar';
import { useProgressStatus } from '../../hooks/useProgressStatus';

export default function AiCard() {
  const { aiCurrentMetrics, aiLoading, aiError, retryAi } = useMetricsContext();

  const getLlmUtilization = (): number | null => {
    if (!aiCurrentMetrics?.kv_cache_stats || aiCurrentMetrics.kv_cache_stats.length === 0) return null;
    return aiCurrentMetrics.kv_cache_stats[0]?.gpu_cache_usage_pct ?? null;
  };

  const getKvCacheUsedGb = (): number | null => {
    if (!aiCurrentMetrics?.kv_cache_stats || aiCurrentMetrics.kv_cache_stats.length === 0) return null;
    const usedMb = aiCurrentMetrics.kv_cache_stats[0]?.used_gpu_memory_mb ?? null;
    return usedMb != null ? usedMb / 1024 : null;
  };

  const getTokensCached = (): number | null => {
    if (!aiCurrentMetrics?.token_usage) return null;
    return aiCurrentMetrics.token_usage.cached_tokens ?? null;
  };

  const llmUtil = getLlmUtilization();
  const { color: statusColor, label: statusLabel } = useProgressStatus(llmUtil);

  const llamaStatus = aiCurrentMetrics?.llama_server;
  const openwebuiStatus = aiCurrentMetrics?.openwebui;
  const opencodeStatus = aiCurrentMetrics?.opencode;

  if (aiLoading) {
    return (
      <PanelErrorBoundary panelName="AI">
        <div className="metric-card" style={{ opacity: 0.5 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BrainCircuit size={16} style={{ color: 'var(--accent-primary)' }} />
              <span className="card-title">AI</span>
            </div>
          </div>
          <div style={{ padding: 8, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton" style={{ height: 200, width: '100%' }} />
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

  if (aiError) {
    return (
      <PanelErrorBoundary panelName="AI">
        <PanelErrorState
          panelName="AI"
          error={new Error(aiError)}
          errorInfo={null}
          onRetry={retryAi}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panelName="AI">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BrainCircuit size={16} style={{ color: 'var(--accent-primary)' }} />
            <span className="card-title">AI</span>
          </div>
          <div className="card-status">
            <div className="status-dot" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div className="card-value">
          {aiLoading ? '\u2014' : llmUtil != null ? llmUtil.toFixed(1) : '\u2014'}
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={llmUtil ?? 0} />
        <div className="card-details">
          <div className="card-detail-item">
            <span className="card-detail-label">KV Cache Used</span>
            <span className="card-detail-value">
              {getKvCacheUsedGb() != null ? `${getKvCacheUsedGb()!.toFixed(1)} GB` : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item">
            <span className="card-detail-label">Tokens Cached</span>
            <span className="card-detail-value">
              {getTokensCached() != null ? getTokensCached()!.toLocaleString() : '\u2014'}
            </span>
          </div>
          <div className="card-detail-item">
            <span className="card-detail-label">Llama Server</span>
            <span style={{ color: llamaStatus?.available ? 'var(--success)' : 'var(--danger)', textTransform: 'capitalize' }}>
              {llamaStatus?.available ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="card-detail-item">
            <span className="card-detail-label">OpenWebUI</span>
            <span style={{ color: openwebuiStatus?.available ? 'var(--success)' : 'var(--danger)', textTransform: 'capitalize' }}>
              {openwebuiStatus?.available ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="card-detail-item">
            <span className="card-detail-label">OpenCode</span>
            <span style={{ color: opencodeStatus?.available ? 'var(--success)' : 'var(--danger)', textTransform: 'capitalize' }}>
              {opencodeStatus?.available ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="card-filler" />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
