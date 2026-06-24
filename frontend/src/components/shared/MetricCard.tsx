interface MetricCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  color?: string;
}

export default function MetricCard({ label, value, unit = '', color }: MetricCardProps) {
  const displayValue = value !== null && value !== undefined ? `${value}${unit}` : '\u2014';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6, border: '1px solid var(--border-color)',
      background: 'rgba(255,255,255,0.03)',
      padding: '6px 8px', minWidth: 0, minHeight: 40,
    }}>
      <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color || 'var(--text-primary)' }}>{displayValue}</span>
    </div>
  );
}
