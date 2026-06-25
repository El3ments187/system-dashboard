import React from 'react';

/* ─── status badge (identical across all cards) ─── */
export function StatusBadge({ online }: { online: boolean }) {
  const c = online ? 'var(--success)' : 'var(--danger)';
  return (
    <span className="status-badge" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, padding: '2px 6px', borderRadius: 3,
      background: `${c}18`,
      color: c,
      fontWeight: 600, letterSpacing: 0.5,
      textShadow: 'var(--text-shadow-sm)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c, display: 'inline-block' }} />
      {online ? 'ONLINE' : 'OFFLINE'}
    </span>
  );
}

/* ─── section wrapper (identical across all cards) ─── */
export function Section({ title, icon, children, style }: { title: string; icon?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card-section" style={{ padding: '3px 8px 1px', borderBottom: '1px solid var(--border-color)', ...style }}>
      {(title || icon) && (
        <div className="section-header">
          {icon && <span style={{ color: 'var(--accent-primary)' }}>{icon}</span>}
          {title && <span className="section-title" style={{ textShadow: 'var(--text-shadow-sm)' }}>{title}</span>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

/* ─── card header (identical across all cards) ─── */
export function CardHeader({ icon, title, online }: { icon: React.ReactNode; title: string; online: boolean }) {
  return (
    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border-color)' }}>
      {icon}
      <span className="card-title" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-primary)', textShadow: 'var(--text-shadow-sm)' }}>{title}</span>
      <div style={{ flex: 1 }} />
      <StatusBadge online={online} />
    </div>
  );
}

/* ─── card shell (identical across all cards) ─── */
export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden', minWidth: 0, flex: '1 1 0' }}>
      {children}
    </div>
  );
}

/* ─── scrollable content area ─── */
export function ScrollContent({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}
