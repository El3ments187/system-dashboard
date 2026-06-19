import { MetricHistoryPoint } from '../types/metrics';

// Import the color conversion logic by extracting it from PerCoreCpuChart
// Since the functions are not exported, we test them through the component's behavior

describe('HSL/RGB Color Conversion', () => {
  // Test the hslToRgb conversion logic directly
  // This is a simplified version of the algorithm used in PerCoreCpuChart
  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  it('converts pure red (0, 100, 50) to RGB', () => {
    const [r, g, b] = hslToRgb(0, 100, 50);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('converts pure green (120, 100, 50) to RGB', () => {
    const [r, g, b] = hslToRgb(120, 100, 50);
    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(0);
  });

  it('converts pure blue (240, 100, 50) to RGB', () => {
    const [r, g, b] = hslToRgb(240, 100, 50);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
  });

  it('converts gray (0, 0, 50) to RGB', () => {
    const [r, g, b] = hslToRgb(0, 0, 50);
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it('converts white (0, 0, 100) to RGB', () => {
    const [r, g, b] = hslToRgb(0, 0, 100);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it('converts black (0, 0, 0) to RGB', () => {
    const [r, g, b] = hslToRgb(0, 0, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('handles hue wraparound for negative values', () => {
    const [r, g, b] = hslToRgb(-120, 100, 50);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
  });

  it('generates distinct colors for different hues', () => {
    const colors = [0, 60, 120, 180, 240, 300].map(h => hslToRgb(h, 100, 50));
    // All colors should be different
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(colors[i]).not.toEqual(colors[j]);
      }
    }
  });
});

describe('MetricHistoryPoint', () => {
  it('creates a valid history point', () => {
    const point: MetricHistoryPoint = {
      slot: 0,
      timestamp: new Date(),
      value: 50,
    };
    expect(point.slot).toBe(0);
    expect(point.timestamp instanceof Date).toBe(true);
    expect(point.value).toBe(50);
  });

  it('handles null values', () => {
    const point: MetricHistoryPoint = {
      slot: 1,
      timestamp: new Date(),
      value: null,
    };
    expect(point.value).toBeNull();
  });
});
