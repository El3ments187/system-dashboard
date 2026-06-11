import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { MetricDescription } from '../../data/metricDescriptions';

interface TooltipPosition {
  x: number;
  y: number;
}

interface ChartTooltipData {
  timestamp?: string;
  series: Array<{ name: string; value: string | number; color?: string }>;
  description?: MetricDescription;
}

interface CardTooltipData {
  title: string;
  description: string;
  unit?: string;
  direction?: 'higher-is-better' | 'lower-is-better' | 'neutral';
}

interface TooltipContextValue {
  chartTooltip: ChartTooltipData | null;
  setChartTooltip: (data: ChartTooltipData | null, event?: React.MouseEvent) => void;
  cardTooltip: CardTooltipData | null;
  setCardTooltip: (data: CardTooltipData | null, event?: React.MouseEvent) => void;
  position: TooltipPosition | null;
  setPosition: (pos: TooltipPosition | null) => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [chartTooltip, setChartTooltip] = useState<ChartTooltipData | null>(null);
  const [cardTooltip, setCardTooltip] = useState<CardTooltipData | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const handleChartHover = useCallback((data: ChartTooltipData | null, event?: React.MouseEvent) => {
    setChartTooltip(data);
    if (event) {
      setPosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

  const handleCardHover = useCallback((data: CardTooltipData | null, event?: React.MouseEvent) => {
    setCardTooltip(data);
    if (event) {
      setPosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

  return (
    <TooltipContext.Provider value={{
      chartTooltip,
      setChartTooltip: handleChartHover,
      cardTooltip,
      setCardTooltip: handleCardHover,
      position,
      setPosition,
    }}>
      {children}
      {chartTooltip && position && (
        <FloatingTooltip type="chart" data={chartTooltip} position={position} />
      )}
      {cardTooltip && position && (
        <FloatingTooltip type="card" data={cardTooltip} position={position} />
      )}
    </TooltipContext.Provider>
  );
}

function FloatingTooltip({ type, data, position }: {
  type: 'chart' | 'card';
  data: ChartTooltipData | CardTooltipData;
  position: TooltipPosition;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        let x = position.x + 16;
        let y = position.y + 16;

        if (x + rect.width > viewportW - 16) {
          x = position.x - rect.width - 16;
        }
        if (y + rect.height > viewportH - 16) {
          y = position.y - rect.height - 16;
        }

        setAdjustedPos({ x: Math.max(8, x), y: Math.max(8, y) });
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [position]);

  if (type === 'chart') {
    const chartData = data as ChartTooltipData;
    return (
      <div ref={ref} style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 10000,
        pointerEvents: 'none',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: '12px 16px',
        color: 'var(--text-primary)',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 12,
        minWidth: 200,
        maxWidth: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'fadeIn 150ms ease',
      }}>
        {chartData.timestamp && (
          <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 8, fontSize: 11 }}>
            {chartData.timestamp}
          </div>
        )}
        {chartData.series.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {s.color && (
              <div style={{ width: 10, height: 3, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            )}
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{s.name}:</span>
            <span style={{ marginLeft: 'auto', fontWeight: 500 }}>{s.value}</span>
          </div>
        ))}
        {chartData.description && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)', fontSize: 10, color: 'var(--text-muted)' }}>
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>{chartData.description.title}</div>
            <div>{chartData.description.description}</div>
            {chartData.description.direction && (
              <div style={{ marginTop: 4, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {chartData.description.direction === 'higher-is-better' ? '↑ Higher is better' :
                 chartData.description.direction === 'lower-is-better' ? '↓ Lower is better' :
                 '→ No preference'}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const cardData = data as CardTooltipData;
  return (
    <div ref={ref} style={{
      position: 'fixed',
      left: adjustedPos.x,
      top: adjustedPos.y,
      zIndex: 10000,
      pointerEvents: 'none',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '10px 14px',
      color: 'var(--text-primary)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11,
      minWidth: 160,
      maxWidth: 280,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'fadeIn 150ms ease',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 4 }}>{cardData.title}</div>
      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{cardData.description}</div>
      {cardData.unit && (
        <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Unit: {cardData.unit}
        </div>
      )}
      {cardData.direction && (
        <div style={{ marginTop: 2, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {cardData.direction === 'higher-is-better' ? '↑ Higher is better' :
           cardData.direction === 'lower-is-better' ? '↓ Lower is better' :
           '→ No preference'}
        </div>
      )}
    </div>
  );
}

export function useTooltip() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltip must be used within TooltipProvider');
  return ctx;
}
