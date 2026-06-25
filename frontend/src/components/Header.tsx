import { useQuery } from '@tanstack/react-query';
import { getSystemMetrics } from '../services/api';
import { SystemMetrics } from '../types/metrics';
import { Wifi, WifiOff, Pause, Play, Bell, Trash2 } from 'lucide-react';
import { useLiveDataControlsContext } from '../context/LiveDataControlsContext';
import { useAlertsContext, AlertSeverity } from '../context/AlertsContext';
import { useFetchAlerts } from '../hooks/useFetchAlerts';
import { useEffect, useRef, useState, useMemo } from 'react';

interface HeaderProps {
  accent: { color: string; glow: string };
  showThemePanel: boolean;
  onToggleThemePanel: () => void;
  healthOk?: boolean;
  activePage?: 'overview' | 'gpu' | 'cpu' | 'ai' | 'settings';
  onPageChange?: (page: 'overview' | 'gpu' | 'cpu' | 'ai' | 'settings') => void;
}

const severityColors: Record<AlertSeverity, string> = {
  [AlertSeverity.Info]: 'var(--info)',
  [AlertSeverity.Warning]: 'var(--warning)',
  [AlertSeverity.Error]: 'var(--danger)',
};

const severityBgColors: Record<AlertSeverity, string> = {
  [AlertSeverity.Info]: 'var(--info)20',
  [AlertSeverity.Warning]: 'var(--warning)20',
  [AlertSeverity.Error]: 'var(--danger)20',
};

export default function Header({ accent, onToggleThemePanel, healthOk, activePage = 'overview', onPageChange }: HeaderProps) {
  const pages: Array<'overview' | 'gpu' | 'cpu' | 'ai' | 'settings'> = ['overview', 'gpu', 'cpu', 'ai', 'settings'];
  const { data: system } = useQuery<SystemMetrics>({
    queryKey: ['metrics', 'system'],
    queryFn: getSystemMetrics,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  const { isPaused, toggle: toggleLiveData } = useLiveDataControlsContext();
  const { addAlert, alerts: frontendAlerts, clearAlerts } = useAlertsContext();
  const { alerts: backendAlerts, refetch: refetchAlerts } = useFetchAlerts();
  const alerts = useMemo(() => {
    const backendIds = new Set(backendAlerts.map(a => a.id));
    const merged = [...backendAlerts];
    for (const a of frontendAlerts) {
      if (!backendIds.has(a.id)) merged.push(a);
    }
    return merged;
  }, [backendAlerts, frontendAlerts]);
  const [showAlerts, setShowAlerts] = useState(false);

  useEffect(() => {
    if (showAlerts) {
      refetchAlerts();
    }
  }, [showAlerts, refetchAlerts]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (healthOk === false) {
      addAlert(AlertSeverity.Error, 'backend', 'Backend connection lost');
    }
  }, [healthOk, addAlert]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          <div className="accent-fill" style={{
            width: 24, height: 24, borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4l-2 2 1-3M12 22v-4l-2-2 1-3M2 12h4l2-2-3-1M22 12h-4l-2 2 3-1" />
            </svg>
          </div>
          <span className="header-title">System Dashboard</span>
          <nav style={{ display: 'flex', gap: 3, marginLeft: 12, alignItems: 'center' }}>
            {pages.map((page) => (
              <button
                key={page}
                onClick={() => onPageChange?.(page)}
                style={{
                  background: activePage === page ? 'var(--accent-tint-15)' : 'transparent',
                  color: activePage === page ? accent.color : 'var(--text-secondary)',
                  padding: '3px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: "inherit",
                  fontSize: '12px',
                  fontWeight: activePage === page ? 600 : 400,
                  transition: 'all 0.15s ease',
                  border: activePage === page ? '1px solid var(--accent-tint-40)' : '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (activePage !== page) {
                    e.currentTarget.style.color = accent.color;
                    e.currentTarget.style.background = 'var(--accent-tint-10)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activePage !== page) {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {page === 'overview' ? 'Overview' : page === 'gpu' ? 'GPU' : page === 'cpu' ? 'CPU' : page === 'ai' ? 'AI' : 'Settings'}
              </button>
            ))}
          </nav>
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
          <button
            className="live-toggle-btn"
            onClick={toggleLiveData}
            style={{
              background: isPaused ? 'var(--warning)20' : 'var(--success)20',
              color: isPaused ? 'var(--warning)' : 'var(--success)',
              border: `1px solid ${isPaused ? 'var(--warning)40' : 'var(--success)40'}`,
            }}
            title={isPaused ? 'Resume Live Updates' : 'Pause Live Updates'}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: isPaused ? 'var(--warning)' : 'var(--success)',
              display: 'inline-block', marginRight: 4,
              animation: isPaused ? 'none' : 'pulse 2s infinite',
            }} />
            {isPaused ? 'PAUSED' : 'LIVE'}
            {isPaused ? <Play size={12} style={{ marginLeft: 4 }} /> : <Pause size={12} style={{ marginLeft: 4 }} />}
          </button>
          <div style={{ position: 'relative' }} ref={panelRef}>
            <button
              className="alerts-btn"
              onClick={() => setShowAlerts(!showAlerts)}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Alerts"
            >
              <Bell size={14} />
              {alerts.length > 0 && (
                <span style={{
                  background: 'var(--danger)',
                  color: 'white',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 600,
                  minWidth: 16,
                  textAlign: 'center',
                }}>
                  {alerts.length > 99 ? '99+' : alerts.length}
                </span>
              )}
            </button>
            {showAlerts && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 380,
                maxHeight: 480,
                background: 'var(--surface)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                zIndex: 100,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Alerts</span>
                  <button
                    onClick={clearAlerts}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                    title="Clear Alerts"
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {alerts.length === 0 && (
                    <div style={{
                      textAlign: 'center',
                      padding: 24,
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                    }}>
                      No alerts
                    </div>
                  )}
                  {alerts.slice().reverse().map(alert => (
                    <div
                      key={alert.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        background: severityBgColors[alert.severity],
                      }}
                    >
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: severityColors[alert.severity],
                        flexShrink: 0,
                        marginTop: 3,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 2,
                        }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: severityColors[alert.severity],
                            textTransform: 'uppercase',
                          }}>
                            {alert.subsystem}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {alert.message}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const url = `/api/alerts?severity=${alert.severity}&subsystem=${alert.subsystem}&message=${encodeURIComponent(alert.message)}`;
                          if (url) {
                            // close button only - alert removal handled by context
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: 2,
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
