import { useTheme } from '../hooks/useTheme';

interface ThemePanelProps {
  open: boolean;
  onClose: () => void;
  accent: string;
  onAccentChange: (color: string) => void;
  bg: string;
  onBgChange: (color: string) => void;
  current: { color: string; glow: string };
}

export default function ThemePanel({ open, onClose, accent, onAccentChange, bg, onBgChange, current }: ThemePanelProps) {
  const { presets, bgPresets } = useTheme();

  if (!open) return null;

  return (
    <>
      <div className={`theme-panel-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`theme-panel ${open ? 'open' : ''}`}>
        <button className="theme-panel-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 0l-4 4-8 8-4 4-4-4-8-8-4-4z" />
          </svg>
        </button>
        <div className="theme-panel-title">Theme Settings</div>
        <div className="theme-panel-subtitle">Choose an accent color for the dashboard</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: 16,
          background: 'var(--bg-card)', borderRadius: 10,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${current.color}, ${current.glow})`,
            border: '2px solid var(--border-color)',
          }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              {presets.find(p => p.value === accent)?.name || 'Blue'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {current.color}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Accent Colors
        </div>
        <div className="color-grid">
          {presets.map(preset => (
            <div
              key={preset.value}
              className={`color-option ${accent === preset.value ? 'active' : ''}`}
              onClick={() => onAccentChange(preset.value)}
            >
              <div
                className="color-preview"
                style={{ background: `radial-gradient(circle at 30% 30%, ${preset.color}, ${preset.color}44)` }}
              />
              <span className="color-label">{preset.name}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Background Colors
        </div>
        <div className="color-grid" style={{ marginBottom: 24 }}>
          {bgPresets.map(bgPreset => (
            <div
              key={bgPreset.value}
              className={`color-option ${bg === bgPreset.value ? 'active' : ''}`}
              onClick={() => onBgChange(bgPreset.value)}
            >
              <div
                className="color-preview"
                style={{
                  background: `linear-gradient(135deg, ${bgPreset.color}, ${bgPreset.color}88)`,
                  border: bgPreset.name === 'Light' ? '1px solid #ccc' : 'none',
                }}
              />
              <span className="color-label">{bgPreset.name}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, padding: 16, background: 'var(--bg-card)', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Live Preview
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: accent === 'blue' ? accent : 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
            <div style={{ width: 40, height: 40, borderRadius: 8, background: current.glow, border: '1px solid var(--border-color)' }} />
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-card)', border: `2px solid ${current.color}` }} />
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: `linear-gradient(90deg, ${current.color}, ${current.glow})`,
              border: '1px solid var(--border-color)',
            }} />
          </div>
        </div>
      </div>
    </>
  );
}
