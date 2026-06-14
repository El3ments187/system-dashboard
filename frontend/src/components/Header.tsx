import { useQuery } from '@tanstack/react-query';
import { getSystemMetrics } from '../services/api';
import { SystemMetrics } from '../types/metrics';
import { Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  accent: { color: string; glow: string };
  showThemePanel: boolean;
  onToggleThemePanel: () => void;
  healthOk?: boolean;
}

export default function Header({ accent, onToggleThemePanel, healthOk }: HeaderProps) {
  const { data: system } = useQuery<SystemMetrics>({
    queryKey: ['metrics', 'system'],
    queryFn: getSystemMetrics,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  const uptime = (() => {
    if (!system) return '0m';
    const seconds = system.uptime_seconds;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  })();

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${accent.color}, ${accent.glow})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4l-2 2 1-3M12 22v-4l-2-2 1-3M2 12h4l2-2-3-1M22 12h-4l-2 2 3-1" />
            </svg>
          </div>
          <span className="header-title">System Dashboard</span>
        </div>
        <div className="header-center">
          {system && (
            <div className="header-info">
              <span className="header-info-label">Host</span>
              <span style={{ color: accent.color }}>{system.hostname}</span>
            </div>
          )}
          <div className="header-info">
            <span className="header-info-label">Uptime</span>
            <span style={{ color: accent.color }}>{uptime}</span>
          </div>
          <div className="header-info">
            <span className="header-info-label">Updated</span>
            <span style={{ color: accent.color }}>{system?.last_update ?? 'Just now'}</span>
          </div>
          <div className="header-info">
            <span className="header-info-label">Status</span>
            {healthOk ? (
              <Wifi size={14} style={{ color: 'var(--success)' }} />
            ) : (
              <WifiOff size={14} style={{ color: 'var(--danger)' }} />
            )}
          </div>
        </div>
        <div className="header-right">
          <button className="theme-toggle-btn" onClick={onToggleThemePanel} title="Theme Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 2 L12 5 L10 4 L12 2 M12 22 L12 19 L14 20 L12 22 M2 12 L5 12 L4 10 L2 12 M22 12 L19 12 L20 14 L22 12 M4.93 4.93 L7 7 L5.5 5.5 L4.93 4.93 M19.07 19.07 L17 17 L18.5 18.5 L19.07 19.07 M4.93 19.07 L7 17 L5.5 18.5 L4.93 19.07 M19.07 4.93 L17 7 L18.5 5.5 L19.07 4.93" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
