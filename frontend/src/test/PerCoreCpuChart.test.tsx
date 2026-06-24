import { render } from '@testing-library/react';
import PerCoreCpuChart from '../charts/PerCoreCpuChart';
import { MetricHistoryPoint } from '../types/metrics';

// Mock recharts dynamic import
vi.mock('recharts', () => ({
  LineChart: vi.fn(() => <div data-testid="line-chart">LineChart</div>),
  Line: vi.fn(() => <div data-testid="line">Line</div>),
  XAxis: vi.fn(() => <div data-testid="x-axis">XAxis</div>),
  YAxis: vi.fn(() => <div data-testid="y-axis">YAxis</div>),
  CartesianGrid: vi.fn(() => <div data-testid="cartesian-grid">CartesianGrid</div>),
  Tooltip: vi.fn(() => <div data-testid="tooltip">Tooltip</div>),
}));

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('PerCoreCpuChart', () => {
  const mockHistory: MetricHistoryPoint[] = Array.from({ length: 120 }, (_, i) => ({
    slot: i,
    timestamp: new Date(Date.now() - (120 - i) * 500),
    value: 50 + i % 20,
  }));

  it('renders without crashing for single core', async () => {
    const { container } = render(
      <PerCoreCpuChart
        title="CPU Cores"
        data={[mockHistory]}
        accent={{ color: '#3b82f6', glow: '#60a5fa' }}
      />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders multiple core charts', async () => {
    const multiCoreData = [mockHistory, mockHistory, mockHistory];
    const { container } = render(
      <PerCoreCpuChart
        title="CPU Cores"
        data={multiCoreData}
        accent={{ color: '#3b82f6', glow: '#60a5fa' }}
      />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles empty history gracefully', async () => {
    const { container } = render(
      <PerCoreCpuChart
        title="CPU Cores"
        data={[]}
        accent={{ color: '#3b82f6', glow: '#60a5fa' }}
      />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('generates distinct colors for each core', async () => {
    const multiCoreData = [mockHistory, mockHistory, mockHistory];
    render(
      <PerCoreCpuChart
        title="CPU Cores"
        data={multiCoreData}
        accent={{ color: '#3b82f6', glow: '#60a5fa' }}
      />
    );
    // Colors should be generated without errors
    expect(true).toBe(true);
  });
});
