interface SeriesItem {
  name: string;
  value: string | number;
  color: string;
}

interface ChartTooltipProps {
  timestamp: string;
  series: SeriesItem[];
}

export default function ChartTooltip({ timestamp, series }: ChartTooltipProps) {
  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      padding: '10px 14px',
      color: 'var(--text-primary)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 12,
      minWidth: 180,
      maxWidth: 320,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontWeight: 600,
        fontSize: 11,
        color: 'var(--accent-primary)',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border-color)',
        letterSpacing: 0.5,
      }}>
        {timestamp}
      </div>
      {series.map((s, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: i < series.length - 1 ? 4 : 0,
        }}>
          <div style={{
            width: 12,
            height: 3,
            borderRadius: 2,
            background: s.color,
            flexShrink: 0,
          }} />
          <span style={{
            color: 'var(--text-muted)',
            fontSize: 11,
            flexShrink: 0,
          }}>
            {s.name}
          </span>
          <span style={{
            marginLeft: 'auto',
            fontWeight: 600,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
