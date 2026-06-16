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
        <div className="theme-preview-row">
          <div className="theme-preview-info">
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: `radial-gradient(circle at 30% 30%, ${current.color}, ${current.glow})`,
              border: '2px solid var(--border-color)',
            }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                {presets.find(p => p.value === accent)?.name || 'Blue'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {current.color}
              </div>
            </div>
          </div>
          <div className="theme-preview-swatches">
            <div className="theme-preview-swatch" style={{ background: current.color }} />
            <div className="theme-preview-swatch" style={{ background: current.glow }} />
            <div className="theme-preview-swatch" style={{ background: 'var(--bg-card)', border: `2px solid ${current.color}` }} />
            <div className="theme-preview-swatch gradient" />
          </div>
        </div>
        <div className="theme-section-header">Accent Colors</div>
        <div className="accent-grid">
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
        <div className="theme-section-header">Background Colors</div>
        <div className="bg-grid">
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
                  border: ['Light', 'Paper', 'Nord Light', 'Cream'].includes(bgPreset.name) ? '1px solid #ccc' : 'none',
                }}
              />
              <span className="color-label">{bgPreset.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
