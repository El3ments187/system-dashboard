import { useMemo, useState } from 'react';
import { Cpu } from 'lucide-react';
import { resolveAccentColors, useAccentSync } from '../utils/accentColors';
import { getProgressState } from '../utils/progress';

interface CoreBarProps {
  cores: Array<{ utilization_percent: number; temperature_celsius?: number } | null>;
  accent: { color: string; glow: string };
}

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ─── Derive per-core colors from the active accent mode ─── */

function getCoreColors(count: number): string[] {
  return resolveAccentColors(count, true);
}

/* ─── Core Row ─── */

const CoreRow = ({ index, util, color }: { index: number; util: number; color: string }) => {
   const bg = resolveVar('--bg-secondary') || '#1a1f2e';
   const textMuted = resolveVar('--text-muted') || '#8b95a5';
   const textPrimary = resolveVar('--text-primary') || '#e2e8f0';
   const state = getProgressState(util);
   const barColor = state === 'normal' ? color : resolveVar(state === 'critical' ? '--danger' : '--warning');
   return (
    <div className="core-row" style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) 32px', alignItems: 'center', gap: 4, flex: 1, minHeight: 0, cursor: 'default' }}>
      <span style={{ fontSize: 9, color: textMuted, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', flexShrink: 0 }}>
        C{index}
      </span>
      <div style={{ width: '100%', height: 14, background: bg, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div
          data-testid="per-core-bar"
          data-core-color={barColor}
          data-core-assigned-color={color}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(util, 100)}%`,
            minWidth: util > 0 ? 4 : 0,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
            borderRadius: 'inherit',
            transition: 'width 0.3s ease, background 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 9, color: textPrimary, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(util)}%
      </span>
    </div>
  );
};

/* ─── CoreBars Component ─── */

export default function CoreBars({ cores, accent }: CoreBarProps) {
  const [themeTick, setThemeTick] = useState(0);
  useAccentSync(() => setThemeTick(t => t + 1));

  const textMuted = resolveVar('--text-muted') || '#8b95a5';
  const borderColor = resolveVar('--border-color') || '#2a3143';

  const totalCores = cores.filter(c => c != null).length;

  const colors = useMemo(() => getCoreColors(totalCores), [totalCores, themeTick]);

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
