import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from './components/Header';
import ThemePanel from './components/ThemePanel';
import CpuCard from './components/cards/CpuCard';
import MemoryCard from './components/cards/MemoryCard';
import GpuCard from './components/cards/GpuCard';
import CpuChart from './charts/CpuChart';
import MemoryChart from './charts/MemoryChart';

import GpuChart from './charts/GpuChart';
import StorageCard from './components/cards/StorageCard';
import StoragePerformanceCard from './components/cards/StoragePerformanceCard';
import { MetricsProvider } from './context/MetricsContext';
import { TooltipProvider } from './components/common/TooltipProvider';
import './styles/theme.css';
import { checkHealth } from './services/api';

const ACCENT_COLORS: Record<string, { color: string; glow: string }> = {
  blue:   { color: '#3b8aff', glow: 'rgba(59, 138, 255, 0.3)' },
  cyan:   { color: '#00e0ff', glow: 'rgba(0, 224, 255, 0.3)' },
  green:  { color: '#22c192', glow: 'rgba(34, 193, 146, 0.3)' },
  purple: { color: '#8b5aff', glow: 'rgba(139, 90, 255, 0.3)' },
  orange: { color: '#f59b1c', glow: 'rgba(245, 155, 28, 0.3)' },
  red:    { color: '#e84747', glow: 'rgba(232, 71, 71, 0.3)' },
};

export default function App() {
  const [accent, setAccent] = useState<string>(() => {
    return localStorage.getItem('dashboard-accent') || 'blue';
  });
  const [bg, setBg] = useState<string>(() => {
    return localStorage.getItem('dashboard-bg') || 'dark';
  });
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [loading, setLoading] = useState(true);

  const { data: healthOk } = useQuery<boolean>({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 10000,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('dashboard-accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bg', bg);
    localStorage.setItem('dashboard-bg', bg);
  }, [bg]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const current = ACCENT_COLORS[accent] || ACCENT_COLORS.blue;

  if (loading) {
    return (
      <div className="loading-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="loading-spinner" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '24px', fontSize: '14px' }}>
          Initializing dashboard...
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <MetricsProvider>
        <div className="app-root">
        <Header
          accent={current}
          showThemePanel={showThemePanel}
          onToggleThemePanel={() => setShowThemePanel(!showThemePanel)}
          healthOk={healthOk}
        />
        <ThemePanel
          open={showThemePanel}
          onClose={() => setShowThemePanel(false)}
          accent={accent}
          onAccentChange={setAccent}
          bg={bg}
          onBgChange={setBg}
          current={current}
        />
        <main className="dashboard-grid">
          <div className="dashboard-row">
            <GpuCard accent={current} />
            <GpuChart accent={current} />
          </div>
          <div className="dashboard-row">
            <CpuCard accent={current} />
            <CpuChart accent={current} />
          </div>
          <div className="dashboard-row">
            <MemoryCard accent={current} />
            <MemoryChart accent={current} />
          </div>
          <div className="dashboard-row storage-row">
            <StorageCard accent={current} />
            <StoragePerformanceCard accent={current} />
          </div>
        </main>
      </div>
    </MetricsProvider>
    </TooltipProvider>
  );
}
