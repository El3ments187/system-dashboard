// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import ThemePage from "../../../pages/ThemePage";
import {
  readIntensity,
  GLOW_INTENSITY_MIN,
  GLOW_INTENSITY_MAX,
  GLOW_INTENSITY_DEFAULT,
} from "../../../hooks/useTheme";

// ── NaN guard and clamp ──────────────────────────────────────────────────────

describe("readIntensity — NaN guard and clamp", () => {
  const KEYS = [
    "dashboard-glow-intensity",
    "dashboard-inner-glow-intensity",
  ] as const;

  afterEach(() => {
    localStorage.clear();
  });

  it.each(KEYS)("stored '9' returns 9 for %s", (key) => {
    localStorage.setItem(key, "9");
    expect(readIntensity(key)).toBe(9);
  });

  it.each(KEYS)("stored '999' clamps to GLOW_INTENSITY_MAX for %s", (key) => {
    localStorage.setItem(key, "999");
    expect(readIntensity(key)).toBe(GLOW_INTENSITY_MAX);
  });

  it.each(KEYS)("stored '0' clamps to GLOW_INTENSITY_MIN for %s", (key) => {
    localStorage.setItem(key, "0");
    expect(readIntensity(key)).toBe(GLOW_INTENSITY_MIN);
  });

  it.each(KEYS)("stored 'abc' returns default, not NaN for %s", (key) => {
    localStorage.setItem(key, "abc");
    const result = readIntensity(key);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(GLOW_INTENSITY_DEFAULT);
  });

  it.each(KEYS)("missing key returns default for %s", (key) => {
    localStorage.removeItem(key);
    expect(readIntensity(key)).toBe(GLOW_INTENSITY_DEFAULT);
  });
});

// ── Slider bounds — deliberate scope lock ────────────────────────────────────

const noop = () => {};

const minimalProps = {
  accent: "#00bfff",
  onAccentChange: noop,
  accentMode: "single",
  onAccentModeChange: noop,
  bg: "#0a0a0a",
  onBgChange: noop,
  onReset: noop,
  // glow sliders visible
  glow: true,
  onGlowChange: noop,
  glowIntensity: 1.4,
  onGlowIntensityChange: noop,
  innerGlow: true,
  onInnerGlowChange: noop,
  innerGlowIntensity: 1.4,
  onInnerGlowIntensityChange: noop,
  // non-glow sliders visible
  breathe: true,
  onBreatheChange: noop,
  breatheSpeed: 4,
  onBreatheSpeedChange: noop,
  breatheIntensity: 1.0,
  onBreatheIntensityChange: noop,
  surge: true,
  onSurgeChange: noop,
  surgePeriod: 6,
  onSurgePeriodChange: noop,
  surgeIntensity: 1.0,
  onSurgeIntensityChange: noop,
  pulse: true,
  onPulseChange: noop,
  pulseSpeed: 4,
  onPulseSpeedChange: noop,
  pulseIntensity: 1.5,
  onPulseIntensityChange: noop,
} as const;

describe("Glow slider bounds — deliberate scope lock", () => {
  it("glow sliders render max=9; pulse=9; breathe=3; surge=3", () => {
    const { container } = render(<ThemePage {...minimalProps} />);

    const get = (id: string) =>
      container.querySelector(`#${id}`) as HTMLInputElement | null;

    expect(get("tp-glow-intensity")?.max).toBe(String(GLOW_INTENSITY_MAX));
    expect(get("tp-inner-glow-intensity")?.max).toBe(
      String(GLOW_INTENSITY_MAX),
    );
    expect(get("tp-pulse-intensity")?.max).toBe(String(GLOW_INTENSITY_MAX));
    expect(get("tp-breathe-intensity")?.max).toBe("3");
    expect(get("tp-surge-intensity")?.max).toBe("3");
  });

  it("glow sliders render min=GLOW_INTENSITY_MIN", () => {
    const { container } = render(<ThemePage {...minimalProps} />);
    const get = (id: string) =>
      container.querySelector(`#${id}`) as HTMLInputElement | null;
    expect(get("tp-glow-intensity")?.min).toBe(String(GLOW_INTENSITY_MIN));
    expect(get("tp-inner-glow-intensity")?.min).toBe(
      String(GLOW_INTENSITY_MIN),
    );
  });
});
