import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

interface PanelErrorStateProps {
  panelName: string;
  error: Error | null;
  errorInfo: any | null;
  onRetry: () => void;
}

/**
 * User-friendly error display for dashboard panels.
 * Shows a collapsible error state that maintains panel dimensions.
 */
export default function PanelErrorState({ panelName, error, errorInfo, onRetry }: PanelErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);

  const panelLabel = panelName || 'Panel';

  // Generate a user-friendly message based on error content
  const getFriendlyMessage = (): string => {
    if (!error) return `Unable to load ${panelLabel} data.`;

    const msg = error.message.toLowerCase();

    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed')) {
      return `Unable to load ${panelLabel} data. Check your connection to the metrics backend.`;
    }
    if (msg.includes('timeout')) {
      return `${panelLabel} request timed out. The backend may be slow or unresponsive.`;
    }
    if (msg.includes('json') || msg.includes('parse')) {
      return `${panelLabel} data format is invalid. The backend may have changed.`;
    }
    if (msg.includes('http 4')) {
      return `${panelLabel} endpoint returned an error. Please try again.`;
    }
    if (msg.includes('http 5')) {
      return `${panelLabel} backend server error. Please try again.`;
    }

    return `Unable to load ${panelLabel} data. Please try refreshing the panel.`;
  };

  // Generate a short error summary
  const getErrorSummary = (): string => {
    if (!error) return 'Unknown error';
    return error.message.split('\n')[0].substring(0, 80);
  };

  return (
    <div
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={20} style={{ color: '#e84747' }} />
          <span className="card-title" style={{ color: '#e84747' }}>{panelLabel} Error</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'var(--transition-fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-card-hover)';
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      {/* Friendly message */}
      <div
        style={{
          padding: '10px 12px',
          background: 'rgba(232, 71, 71, 0.08)',
          border: '1px solid rgba(232, 71, 71, 0.2)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {getFriendlyMessage()}
      </div>

      {/* Error summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: 'var(--text-muted)',
          padding: '6px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <span style={{ color: '#e84747', flexShrink: 0 }}>ERR</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getErrorSummary()}
        </span>
      </div>

      {/* Collapsible detailed error */}
      {showDetails && (
        <div
          style={{
            padding: 12,
            background: 'var(--bg-secondary)',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: 'var(--text-secondary)',
            overflow: 'auto',
            maxHeight: 200,
            border: '1px solid var(--border-color)',
          }}
        >
          {/* Error name */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Error:</span>
            <span style={{ color: '#e84747' }}>{error?.name || 'Error'}</span>
          </div>

          {/* Error message */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Message:</span>
            <span>{getErrorSummary()}</span>
          </div>

          {/* Stack trace */}
          {error?.stack && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Stack:</span>
              <div
                style={{
                  marginTop: 4,
                  paddingLeft: 12,
                  borderLeft: '2px solid var(--border-color)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                  maxHeight: 80,
                  overflow: 'auto',
                }}
              >
                {error.stack.split('\n').slice(0, 8).join('\n')}
              </div>
            </div>
          )}

          {/* Error info (from error boundary) */}
          {errorInfo && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Info:</span>
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {typeof errorInfo === 'object'
                  ? JSON.stringify(errorInfo, null, 2).substring(0, 500)
                  : String(errorInfo)}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Time:</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Retry button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <button
          onClick={onRetry}
          style={{
            background: `linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))`,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'var(--transition-fast)',
            boxShadow: `0 0 12px var(--accent-glow)`,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = `0 0 20px var(--accent-glow)`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = `0 0 12px var(--accent-glow)`;
          }}
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    </div>
  );
}
