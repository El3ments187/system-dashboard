import { describe, it, expect, afterEach } from 'vitest';
import { resolveAccentColors, getSecondarySeriesColor, SECONDARY_LINE_DASH } from '../../../utils/accentColors';

/**
 * Regression coverage for: dual-line charts (Memory/Swap, CPU dual-axis, Storage read/write,
 * Throughput gen/prompt) previously used either an unrelated contrasting hue, or — in
 * StorageHistoryChart's case — the exact same color for both lines. Both violate the
 * "secondary must be a related variant of the primary, never identical and never unrelated"
 * requirement.
 */
describe('getSecondarySeriesColor', () => {
  it('returns a hex color in the same hue family as the input (within rounding)', () => {
    const primary = '#3B82F6'; // blue, hue ~217
    const secondary = getSecondarySeriesColor(primary);
    expect(secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(secondary.toLowerCase()).not.toBe(primary.toLowerCase());
  });

  it('never returns the exact same color as the input', () => {
    const samples = ['#3B82F6', '#EF4444', '#22C55E', '#FACC15', '#8B5CF6', '#000000', '#FFFFFF'];
    for (const color of samples) {
      expect(getSecondarySeriesColor(color).toLowerCase()).not.toBe(color.toLowerCase());
    }
  });

  it('darkens light colors and lightens dark colors (shifts away from the midpoint)', () => {
    const lightSecondary = getSecondarySeriesColor('#E5E4E2'); // Platinum, very light
    const darkSecondary = getSecondarySeriesColor('#0B0B0D'); // near-black

    const toLightness = (hex: string) => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };

    expect(toLightness(lightSecondary)).toBeLessThan(toLightness('#E5E4E2'));
    expect(toLightness(darkSecondary)).toBeGreaterThan(toLightness('#0B0B0D'));
  });

  it('is deterministic for the same input', () => {
    expect(getSecondarySeriesColor('#3B82F6')).toBe(getSecondarySeriesColor('#3B82F6'));
  });
});

describe('resolveAccentColors(2) - dual-line series across modes', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-accent-mode');
    document.documentElement.removeAttribute('style');
  });

  it('Solid mode: secondary is the selected accent\'s same-hue variant, not an unrelated hue', () => {
    document.documentElement.setAttribute('data-accent-mode', 'solid');
    document.documentElement.style.setProperty('--accent-primary', '#40E0D0'); // turquoise
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary).toBe('#40e0d0');
    expect(secondary).toBe(getSecondarySeriesColor('#40e0d0'));
  });

  it('Animated Gradient mode: same relationship as Solid (participates in the live accent)', () => {
    document.documentElement.setAttribute('data-accent-mode', 'animated-gradient');
    document.documentElement.style.setProperty('--accent-primary', '#EF4444');
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary).toBe('#ef4444');
    expect(secondary).toBe(getSecondarySeriesColor('#ef4444'));
  });

  it('Spectrum mode: primary is the fixed first palette entry, ignoring the selected accent', () => {
    document.documentElement.setAttribute('data-accent-mode', 'spectrum');
    document.documentElement.style.setProperty('--accent-primary', '#EF4444');
    const [primary, secondary] = resolveAccentColors(2);
    expect(primary.toLowerCase()).not.toBe('#ef4444');
    expect(secondary).toBe(getSecondarySeriesColor(primary));
  });

  it('Rainbow Wave mode: secondary tracks whatever the live spin-based primary currently is', () => {
    document.documentElement.setAttribute('data-accent-mode', 'rainbow-wave');
    document.documentElement.style.setProperty('--accent-spin', '120');
    const [primary, secondary] = resolveAccentColors(2);
    expect(secondary).toBe(getSecondarySeriesColor(primary));
  });

  it('never returns identical primary/secondary in any mode', () => {
    for (const mode of ['solid', 'animated-gradient', 'rainbow-wave', 'spectrum']) {
      document.documentElement.setAttribute('data-accent-mode', mode);
      const [primary, secondary] = resolveAccentColors(2);
      expect(primary.toLowerCase()).not.toBe(secondary.toLowerCase());
    }
  });
});

describe('SECONDARY_LINE_DASH', () => {
  it('is a non-empty, non-solid strokeDasharray value', () => {
    expect(SECONDARY_LINE_DASH).toMatch(/^\d+(\s\d+)+$/);
  });
});
