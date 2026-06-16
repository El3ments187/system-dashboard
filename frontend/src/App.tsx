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
import { LiveDataControlsProvider } from './context/LiveDataControlsContext';
import { AlertsProvider } from './context/AlertsContext';
import { TooltipProvider } from './components/common/TooltipProvider';
import { useTheme } from './hooks/useTheme';
import './styles/theme.css';
import { checkHealth } from './services/api';
import GpuPage from './pages/GpuPage';

export default function App() {
  const { accent, setAccent, bg, setBg, current } = useTheme();
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<'overview' | 'gpu'>(() => {
    return window.location.pathname === '/gpu' ? 'gpu' : 'overview';
  });

  const { data: healthOk } = useQuery<boolean>({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 10000,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Sync URL with active page
  useEffect(() => {
    const path = activePage === 'gpu' ? '/gpu' : '/';
    window.history.pushState({ page: activePage }, '', path);
  }, [activePage]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      if (window.location.pathname === '/gpu') {
        setActivePage('gpu');
      } else {
        setActivePage('overview');
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

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
      <LiveDataControlsProvider>
        <AlertsProvider>
          <MetricsProvider>
            <div className="app-root">
        <Header
          accent={current}
          showThemePanel={showThemePanel}
          onToggleThemePanel={() => setShowThemePanel(!showThemePanel)}
          healthOk={healthOk}
          activePage={activePage}
          onPageChange={setActivePage}
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
        {activePage === 'overview' ? (
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
              <StoragePerformanceCard />
            </div>
          </main>
        ) : (
          <GpuPage accent={current} />
        )}
           </div>
          </MetricsProvider>
        </AlertsProvider>
      </LiveDataControlsProvider>
    </TooltipProvider>
  );
}
