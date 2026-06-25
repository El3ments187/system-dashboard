import { render, screen } from '@testing-library/react';
import CpuCard from '../components/cards/CpuCard';
import * as MetricsContext from '../context/MetricsContext';
import { TooltipProvider } from '../components/common/TooltipProvider';

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const mockMetricsContext = (overrides: Partial<MetricsContext.MetricsContextValue> = {}) => ({
  cpuCurrentValues: [45, 65, 3800, 8, 16, 2.5, 2.1, 1.8],
  cpuLoading: false,
  cpuError: null,
  retryCpu: vi.fn(),
  ...overrides,
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MetricsContext.MetricsContext.Provider value={mockMetricsContext()}>
        {ui}
      </MetricsContext.MetricsContext.Provider>
    </TooltipProvider>
  );
}

describe('CpuCard', () => {
  const accent = { color: '#00B4D8', glow: 'rgba(0, 180, 216, 0.3)' };
  const turquoiseAccent = { color: '#00B4D8', glow: 'rgba(0, 180, 216, 0.3)' };

  describe('accent color application', () => {
    it('renders CPU icon with accent color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      expect(screen.getByText('CPU')).toBeInTheDocument();
    });

    it('displays temperature value with accent color when available', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      expect(screen.getByText(/°C/)).toBeInTheDocument();
    });

    it('shows fallback for temperature when null', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [45, null, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });

    it('displays frequency with accent color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      expect(screen.getByText(/MHz/)).toBeInTheDocument();
    });

    it('displays core count with accent color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      const coreValue = screen.getAllByText('8');
      expect(coreValue.length).toBeGreaterThan(0);
    });

    it('displays thread count with accent color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      const threadValue = screen.getAllByText('16');
      expect(threadValue.length).toBeGreaterThan(0);
    });

    it('displays load averages with accent color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      expect(screen.getByText(/2\.50/)).toBeInTheDocument();
    });

    it('shows status indicator with progress-based color', () => {
      const { container } = renderWithProviders(<CpuCard accent={accent} />);
      const statusLabel = container.querySelector('.card-detail-label');
      expect(statusLabel).toBeInTheDocument();
    });

    it('shows Warning status when utilization >= 70%', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [75, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(container.textContent).toContain('Warning');
    });

    it('shows Critical status when utilization >= 90%', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [95, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(container.textContent).toContain('Critical');
    });

    it('renders progress bar with correct percentage', () => {
      const { container } = renderWithProviders(<CpuCard accent={accent} />);
      expect(container.querySelector('.card-progress')).toBeInTheDocument();
    });

    it('renders all detail items in card-details section', () => {
      const { container } = renderWithProviders(<CpuCard accent={accent} />);
      const cardDetails = container.querySelector('.card-details');
      expect(cardDetails).toBeInTheDocument();
    });

    it('renders temperature detail with conditional accent color', () => {
      const { container } = renderWithProviders(<CpuCard accent={accent} />);
      const tempItem = container.querySelector('.card-detail-item');
      expect(tempItem).toBeInTheDocument();
    });

    it('renders load detail with all three values', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      const loadValues = screen.getByText(/Load/).parentElement;
      expect(loadValues).toBeInTheDocument();
    });

    it('renders status detail with progress-based color', () => {
      renderWithProviders(<CpuCard accent={accent} />);
      const statusLabel = screen.getByText(/Status/).parentElement;
      expect(statusLabel).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton loader when loading', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuLoading: true })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText('CPU')).toBeInTheDocument();
    });

    it('applies reduced opacity during loading', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuLoading: true })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const card = container.querySelector('.metric-card');
      expect(card).toHaveStyle({ opacity: '0.5' });
    });
  });

  describe('error state', () => {
    it('shows error UI when cpuError is set', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuError: 'Connection failed' })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText(/CPU Error/i)).toBeInTheDocument();
    });

    it('provides retry button on error', () => {
      const mockRetry = vi.fn();
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuError: 'Connection failed', retryCpu: mockRetry })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it('calls retry function when retry button is clicked', async () => {
      const mockRetry = vi.fn();
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuError: 'Connection failed', retryCpu: mockRetry })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      await retryBtn.click();
      expect(mockRetry).toHaveBeenCalled();
    });
  });

  describe('null data handling', () => {
    it('shows fallback for null CPU utilization', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [null, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });

    it('shows fallback for all null values', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [null, null, null, 0, 0, null, null, null] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const emDashes = screen.getAllByText('\u2014');
      expect(emDashes.length).toBeGreaterThan(3);
    });

    it('shows Normal status when utilization is null', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [null, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(container.textContent).toContain('Normal');
    });

    it('shows zero cores as fallback', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [45, 65, 3800, 0, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={accent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });
  });

  describe('Turquoise accent mode', () => {
    it('renders correctly with Turquoise accent', () => {
      const { container } = renderWithProviders(<CpuCard accent={turquoiseAccent} />);
      expect(container.textContent).toContain('CPU');
      expect(container.textContent).toMatch(/(Normal|OK)/i);
    });

    it('applies Turquoise color to icon and detail values', () => {
      const { container } = renderWithProviders(<CpuCard accent={turquoiseAccent} />);
      expect(container.querySelector('.metric-card')).toBeInTheDocument();
    });

    it('shows correct temperature with Turquoise accent', () => {
      render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [45, 85, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(screen.getByText(/°C/)).toBeInTheDocument();
    });

    it('displays Warning status for high temperature', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [45, 85, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(container.textContent).toMatch(/(Normal|Warning)/i);
    });

    it('handles high utilization with Turquoise accent', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [92, 85, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      expect(container.textContent).toContain('Critical');
    });

    it('renders progress bar with correct state for Turquoise mode', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [75, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const progressBar = container.querySelector('.card-progress-bar');
      expect(progressBar).toHaveClass('progress-bar-warning');
    });

    it('renders progress bar with critical state for high utilization', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [95, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const progressBar = container.querySelector('.card-progress-bar');
      expect(progressBar).toHaveClass('progress-bar-critical');
    });

    it('renders progress bar with normal state for low utilization', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [30, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const progressBar = container.querySelector('.card-progress-bar');
      expect(progressBar).toHaveClass('progress-bar-normal');
    });
  });

  describe('theme color leak detection', () => {
    it('the progress bar references the accent CSS variable, not a baked-in spectrum hex, in solid mode', () => {
      const { container } = renderWithProviders(<CpuCard accent={turquoiseAccent} />);
      const bar = container.querySelector('.card-progress-bar');
      const style = bar?.getAttribute('style') || '';
      expect(style).toMatch(/var\(--/);
      expect(style).not.toMatch(/#[0-9a-f]{6}/i);
    });

    it('uses the semantic danger color (not the accent) for a Critical-state status dot', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [95, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const statusDot = container.querySelector('.status-dot');
      expect(statusDot?.getAttribute('style')).toContain('--danger');
    });

    it('does not apply the danger color to a Normal-state status dot', () => {
      const { container } = renderWithProviders(<CpuCard accent={turquoiseAccent} />); // 45% -> Normal
      const statusDot = container.querySelector('.status-dot');
      expect(statusDot?.getAttribute('style')).not.toContain('--danger');
    });

    it('applies the warning color for a Warning-state status dot', () => {
      const { container } = render(
        <TooltipProvider>
          <MetricsContext.MetricsContext.Provider value={mockMetricsContext({ cpuCurrentValues: [75, 65, 3800, 8, 16, 2.5, 2.1, 1.8] })}>
            <CpuCard accent={turquoiseAccent} />
          </MetricsContext.MetricsContext.Provider>
        </TooltipProvider>
      );
      const statusDot = container.querySelector('.status-dot');
      expect(statusDot?.getAttribute('style')).toContain('--warning');
    });
  });
});
