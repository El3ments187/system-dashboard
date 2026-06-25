import { useMetricsContext } from '../context/MetricsContext';
import LlamaCppCard from '../components/cards/LlamaCppCard';
import OpenCodeCard from '../components/cards/OpenCodeCard';
import OpenWebUICard from '../components/cards/OpenWebUICard';
import ComfyUICard from '../components/cards/ComfyUICard';
import Sparkline from '../components/shared/Sparkline';
import { Cpu, MemoryStick, Gauge, Database, Thermometer } from 'lucide-react';

function FooterStat({ icon, label, value, color, history }: { icon: React.ReactNode; label: string; value: string; color: string; history?: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%',
        background: `color-mix(in srgb, ${color} 18%, transparent)`, color, flexShrink: 0,
      }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
      {history && <div style={{ flex: 1, minWidth: 0, height: 32 }}><Sparkline data={history} color={color} width={160} height={32} /></div>}
    </div>
  );
}

export default function AiPage() {
  const {
    cpuCurrentValues, memoryCurrentValues, gpuCurrentValues,
    cpuHistory, memoryHistory, gpuHistory, gpuVramUtilHistory,
  } = useMetricsContext();

  const cpuPct = cpuCurrentValues[0];
  const memUsed = memoryCurrentValues[1];
  const memTotal = memoryCurrentValues[2];
  const memPct = memoryCurrentValues[0];
  const gpuPct = gpuCurrentValues[0];
  const gpuTemp = gpuCurrentValues[1];
  const vramUsed = gpuCurrentValues[2];
  const vramTotal = gpuCurrentValues[3];

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 6, padding: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: 6,
        flex: 1,
        minHeight: 0,
      }}>
        <div style={{ gridColumn: 1, gridRow: '1 / span 3', minHeight: 0, display: 'flex' }}>
          <LlamaCppCard />
        </div>
        <div style={{ gridColumn: 2, gridRow: 1, minHeight: 0, display: 'flex' }}>
          <OpenCodeCard />
        </div>
        <div style={{ gridColumn: 2, gridRow: 2, minHeight: 0, display: 'flex' }}>
          <OpenWebUICard />
        </div>
        <div style={{ gridColumn: 2, gridRow: 3, minHeight: 0, display: 'flex' }}>
          <ComfyUICard />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0,
        borderTop: '1px solid var(--border-color)',
        padding: '10px 4px 2px',
      }}>
        <FooterStat icon={<Cpu size={13} />} label="CPU" value={cpuPct != null ? `${cpuPct.toFixed(1)}%` : '\u2014'} color="var(--success)" history={cpuHistory} />
        <FooterStat icon={<MemoryStick size={13} />} label="RAM" value={memUsed != null && memTotal != null ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GB (${memPct?.toFixed(0) ?? '\u2014'}%)` : '\u2014'} color="var(--warning)" history={memoryHistory} />
        <FooterStat icon={<Gauge size={13} />} label="GPU" value={gpuPct != null ? `${gpuPct.toFixed(0)}%` : '\u2014'} color="var(--accent-primary)" history={gpuHistory} />
        <FooterStat icon={<Database size={13} />} label="VRAM" value={vramUsed != null && vramTotal != null ? `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB` : '\u2014'} color="var(--accent-primary)" history={gpuVramUtilHistory} />
        <FooterStat icon={<Thermometer size={13} />} label="GPU Temp" value={gpuTemp != null ? `${gpuTemp.toFixed(0)}\u00b0C` : '\u2014'} color="var(--danger)" />
      </div>
    </main>
  );
}
