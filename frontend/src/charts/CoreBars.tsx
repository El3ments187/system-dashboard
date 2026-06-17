import { useMemo } from 'react';
import { Cpu } from 'lucide-react';

interface CoreBarProps {
  cores: Array<{ utilization_percent: number; temperature_celsius?: number } | null>;
  accent: { color: string; glow: string };
}

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ─── Hex → HSL conversion ─── */

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16) / 255;
  let g = parseInt(h.substring(2, 4), 16) / 255;
  let b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hslH = 0, hslS = 0;
  const hslL = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    hslS = hslL > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hslH = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hslH = ((b - r) / d + 2) / 6; break;
      case b: hslH = ((r - g) / d + 4) / 6; break;
    }
  }

  return [hslH * 360, hslS * 100, hslL * 100];
}

/* ─── HSL → Hex conversion ─── */

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ─── Derive per-core colors from accent theme ─── */

function getCoreColors(accentColor: string, count: number): string[] {
  const [h, s, l] = hexToHsl(accentColor);
  const step = 360 / count;
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(hslToHex(h + i * step, s, l));
  }
  return colors;
}

/* ─── Core Row ─── */

const CoreRow = ({ index, util, color }: { index: number; util: number; color: string }) => {
   const bg = resolveVar('--bg-secondary') || '#1a1f2e';
   const textMuted = resolveVar('--text-muted') || '#8b95a5';
   const textPrimary = resolveVar('--text-primary') || '#e2e8f0';
   return (
    <div className="core-row" style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) 32px', alignItems: 'center', gap: 4, flex: 1, minHeight: 0, cursor: 'default' }}>
      <span style={{ fontSize: 9, color: textMuted, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', flexShrink: 0 }}>
        C{index}
      </span>
      <div style={{ width: '100%', height: 14, background: bg, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.min(util, 100)}%`,
          minWidth: util > 0 ? 4 : 0,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          borderRadius: 'inherit',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: 9, color: textPrimary, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(util)}%
      </span>
    </div>
  );
};

/* ─── CoreBars Component ─── */

export default function CoreBars({ cores, accent }: CoreBarProps) {
  const accentColor = resolveVar('--accent-primary') || accent.color;
  const textMuted = resolveVar('--text-muted') || '#8b95a5';
  const borderColor = resolveVar('--border-color') || '#2a3143';

  const totalCores = cores.filter(c => c != null).length;

  const colors = useMemo(() => getCoreColors(accentColor, totalCores), [accentColor, totalCores]);

  const indexedCores = useMemo(() => {
    return cores.map((c, i) => ({
      index: i,
      util: c?.utilization_percent ?? 0,
    }));
  }, [cores]);

 const half = Math.ceil(indexedCores.length / 2);
  const colA = indexedCores.slice(0, half);
  const colB = indexedCores.slice(half);

  return (
    <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={14} style={{ color: accent.color }} />
          <span className="card-title" style={{ fontSize: '11px' }}>Per-Core Utilization</span>
        </div>
      </div>

      <div style={{ height: 1, background: borderColor, margin: '0 2px 4px' }} />

      <style>{`
        .core-row:hover { background: rgba(255,255,255,0.03); border-radius: 4px; }
      `}</style>

      <div style={{ flex: 1, minHeight: 0, padding: '0 1px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, height: '100%' }}>
          {[colA, colB].map((col, colIdx) => (
            <div key={colIdx} style={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, height: '100%' }}>
              {col.map(c => (
                <CoreRow key={c.index} index={c.index} util={c.util} color={colors[c.index]} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: borderColor, margin: '6px 2px 0' }} />
      <div style={{ fontSize: 9, color: textMuted, padding: '4px 2px', textAlign: 'center', letterSpacing: 0.5 }}>
        {totalCores} logical threads
      </div>
    </div>
  );
}
