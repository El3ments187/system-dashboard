import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithTheme } from '../helpers/renderWithTheme';
import {
  expectThemeApplied,
  expectNoBlackElements,
  expectNoInvalidCssValues,
  setAccentMode,
} from '../helpers/themeAssertions';
import GpuCard from '../../components/cards/GpuCard';
import CpuCard from '../../components/cards/CpuCard';
import * as MetricsContext from '../../context/MetricsContext';

const mockMetricsContext = () => ({
  gpuCurrentValues: [65, 72, 8.5, 12.0, 250, 300],
  gpuLoading: false,
  gpuError: null,
  retryGpu: vi.fn(),
  cpuCurrentValues: [45, 65, 3800, 8, 16, 2.5, 2.1, 1.8],
  cpuLoading: false,
  cpuError: null,
  retryCpu: vi.fn(),
});

function renderWithProviders(ui: React.ReactElement) {
  return renderWithTheme(
    <MetricsContext.MetricsContext.Provider value={mockMetricsContext()}>
      {ui}
    </MetricsContext.MetricsContext.Provider>,
  );
}

const MODES = ['solid', 'animated-gradient', 'rainbow-wave', 'spectrum'];

/**
 * One parametrized suite replaces what were four near-identical files (SolidMode,
 * GradientMode, RainbowMode, SpectrumMode), each repeating the same black-element /
 * invalid-CSS-value checks under a different `data-accent-mode`. Mode-specific behavior
 * (e.g. Solid-only per-core exemption) has its own dedicated test files elsewhere.
 */
describe.each(MODES)('%s mode - card rendering', (mode) => {
  beforeEach(() => {
    setAccentMode(mode);
  });

  it('sets the mode attribute on the document element', () => {
    expectThemeApplied(mode);
  });

  it('renders GPU + CPU cards with no black elements', () => {
    const { container } = renderWithProviders(
      <div>
        <GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
        <CpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
      </div>,
    );
    expectNoBlackElements(container);
  });

  it('renders GPU + CPU cards with no invalid CSS values (undefined/NaN/null)', () => {
    const { container } = renderWithProviders(
      <div>
        <GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
        <CpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
      </div>,
    );
    expectNoInvalidCssValues(container);
  });
});

describe('Solid mode - accent consistency', () => {
  beforeEach(() => {
    setAccentMode('solid');
  });

  it('GPU and CPU cards reference the same --accent-primary variable, not divergent literals', () => {
    const { container } = renderWithProviders(
      <div>
        <GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
        <CpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />
      </div>,
    );
    const accentRefs = Array.from(container.querySelectorAll<HTMLElement>('[style*="--accent-primary"]'));
    expect(accentRefs.length).toBeGreaterThan(0);
    accentRefs.forEach(el => {
      expect(el.getAttribute('style')).toContain('var(--accent-primary)');
    });
  });
});
