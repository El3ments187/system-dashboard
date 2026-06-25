import { render, waitFor } from '@testing-library/react';
import PerCoreCpuChart from '../charts/PerCoreCpuChart';
import { MetricHistoryPoint } from '../types/metrics';
import { collectPerCoreColors, resetThemeAttributes, setAccent, setAccentMode } from './helpers/themeAssertions';

vi.mock('recharts', () => ({
  LineChart: vi.fn(() => <div data-testid="line-chart">LineChart</div>),
  Line: vi.fn(() => <div data-testid="line">Line</div>),
  XAxis: vi.fn(() => <div data-testid="x-axis">XAxis</div>),
  YAxis: vi.fn(() => <div data-testid="y-axis">YAxis</div>),
  CartesianGrid: vi.fn(() => <div data-testid="cartesian-grid">CartesianGrid</div>),
  Tooltip: vi.fn(() => <div data-testid="tooltip">Tooltip</div>),
}));

class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('PerCoreCpuChart', () => {
  const mockHistory: MetricHistoryPoint[] = Array.from({ length: 10 }, (_, i) => ({
    slot: i,
    timestamp: new Date(Date.now() - (10 - i) * 500),
    value: 50 + (i % 20),
  }));

  beforeEach(() => {
    resetThemeAttributes();
  });

  it('renders without crashing for single core', () => {
    const { container } = render(
      <PerCoreCpuChart title="CPU Cores" data={[mockHistory]} accent={{ color: '#3b82f6', glow: '#60a5fa' }} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles empty history gracefully', () => {
    const { container } = render(
      <PerCoreCpuChart title="CPU Cores" data={[]} accent={{ color: '#3b82f6', glow: '#60a5fa' }} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('assigns a distinct legend color to each active core', async () => {
    setAccentMode('animated-gradient');
    const multiCoreData = Array.from({ length: 8 }, () => mockHistory);
    const { container } = render(
      <PerCoreCpuChart title="CPU Cores" data={multiCoreData} accent={{ color: '#3b82f6', glow: '#60a5fa' }} />
    );
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="per-core-legend-swatch"]').length).toBe(8);
    });
    const { unique } = collectPerCoreColors(container.querySelectorAll('[data-testid="per-core-legend-swatch"]'));
    expect(unique).toBe(8);
  });

  it('keeps legend colors stable across re-renders when theme is unchanged', async () => {
    setAccentMode('spectrum');
    const multiCoreData = Array.from({ length: 6 }, () => mockHistory);
    const { container, rerender } = render(
      <PerCoreCpuChart title="CPU Cores" data={multiCoreData} accent={{ color: '#3b82f6', glow: '#60a5fa' }} />
    );
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="per-core-legend-swatch"]').length).toBe(6);
    });
    const before = collectPerCoreColors(container.querySelectorAll('[data-testid="per-core-legend-swatch"]')).colors;
    rerender(<PerCoreCpuChart title="CPU Cores" data={multiCoreData} accent={{ color: '#3b82f6', glow: '#60a5fa' }} />);
    const after = collectPerCoreColors(container.querySelectorAll('[data-testid="per-core-legend-swatch"]')).colors;
    expect(after).toEqual(before);
  });
});
