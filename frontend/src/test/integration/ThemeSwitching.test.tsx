import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithTheme } from '../helpers/renderWithTheme';
import {
  expectThemeApplied,
  expectNoBlackElements,
  expectNoInvalidCssValues,
  setAccentMode,
} from '../helpers/themeAssertions';
import GpuCard from '../../components/cards/GpuCard';
import * as MetricsContext from '../../context/MetricsContext';

const mockMetricsContext = () => ({
  gpuCurrentValues: [65, 72, 8.5, 12.0, 250, 300],
  gpuLoading: false,
  gpuError: null,
  retryGpu: vi.fn(),
});

function renderWithProviders(ui: React.ReactElement) {
  return renderWithTheme(
    <MetricsContext.MetricsContext.Provider value={mockMetricsContext()}>
      {ui}
    </MetricsContext.MetricsContext.Provider>,
  );
}

const TRANSITIONS: Array<[string, string]> = [
  ['solid', 'animated-gradient'],
  ['animated-gradient', 'solid'],
  ['solid', 'spectrum'],
  ['spectrum', 'solid'],
  ['solid', 'rainbow-wave'],
  ['rainbow-wave', 'solid'],
];

describe('Theme Switching Integration', () => {
  beforeEach(() => {
    setAccentMode('solid');
  });

  it.each(TRANSITIONS)('transitions cleanly from %s to %s with no black or invalid values', (from, to) => {
    setAccentMode(from);
    const { container } = renderWithProviders(
      <GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />,
    );

    setAccentMode(to);
    expectThemeApplied(to);
    expectNoBlackElements(container);
    expectNoInvalidCssValues(container);
  });

  it('updates the mode attribute exactly to the new value with no leftover stale value', () => {
    setAccentMode('rainbow-wave');
    renderWithProviders(<GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />);
    setAccentMode('solid');
    expect(document.documentElement.getAttribute('data-accent-mode')).toBe('solid');
  });

  it.each(['solid', 'animated-gradient', 'rainbow-wave', 'spectrum'])(
    'keeps progress bar color bound to the live CSS variable in %s mode, never a baked-in hex',
    (mode) => {
      setAccentMode(mode);
      const { container } = renderWithProviders(
        <GpuCard accent={{ color: 'var(--accent-primary)', glow: 'var(--accent-glow)' }} />,
      );
      const bar = container.querySelector('.card-progress-bar');
      expect(bar).toBeTruthy();
      const inlineStyle = bar?.getAttribute('style') || '';
      // A literal #rrggbb here would mean the color was baked in at render time instead of
      // staying bound to --accent-primary, breaking live updates when the accent changes.
      expect(inlineStyle).not.toMatch(/#[0-9a-f]{6}/i);
      expect(inlineStyle).toMatch(/var\(--/);
    },
  );
});
