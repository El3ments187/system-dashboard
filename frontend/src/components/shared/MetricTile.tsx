interface MetricTileProps {
  label: string;
  value: string | number | null;
  unit?: string;
  color?: string;
}

export default function MetricTile({ label, value, unit = '', color }: MetricTileProps) {
  const displayValue = value !== null && value !== undefined ? `${value}${unit}` : '\u2014';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      padding: '5px 7px', minWidth: 0, minHeight: 34,
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color || 'var(--text-primary)' }}>{displayValue}</span>
    </div>
  );
}
