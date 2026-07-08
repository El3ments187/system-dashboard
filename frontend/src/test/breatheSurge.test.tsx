// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemePage from "../pages/ThemePage";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    accent: "blue",
    onAccentChange: vi.fn(),
    accentMode: "solid",
    onAccentModeChange: vi.fn(),
    bg: "dark",
    onBgChange: vi.fn(),
    onReset: vi.fn(),
    glow: false,
    onGlowChange: vi.fn(),
    glowIntensity: 1.4,
    onGlowIntensityChange: vi.fn(),
    pulse: false,
    onPulseChange: vi.fn(),
    pulseSpeed: 4,
    onPulseSpeedChange: vi.fn(),
    innerGlow: false,
    onInnerGlowChange: vi.fn(),
    gradientBorder: false,
    onGradientBorderChange: vi.fn(),
    cardGlow: false,
    onCardGlowChange: vi.fn(),
    breathe: false,
    onBreatheChange: vi.fn(),
    breatheSpeed: 4,
    onBreatheSpeedChange: vi.fn(),
    breatheIntensity: 1,
    onBreatheIntensityChange: vi.fn(),
    surge: false,
    onSurgeChange: vi.fn(),
    surgePeriod: 6,
    onSurgePeriodChange: vi.fn(),
    surgeIntensity: 1,
    onSurgeIntensityChange: vi.fn(),
    ...overrides,
  };
}

describe("ThemePage Breathe + Surge labels", () => {
  it("renders Breathe label in effects section", () => {
    render(<ThemePage {...makeProps()} />);
    expect(screen.getByText("Breathe")).toBeInTheDocument();
  });

  it("renders Surge label in effects section", () => {
    render(<ThemePage {...makeProps()} />);
    expect(screen.getByText("Surge")).toBeInTheDocument();
  });
});

describe("ThemePage Breathe toggle", () => {
  it("calls onBreatheChange(true) when Breathe row is clicked and breathe is off", () => {
    const onBreatheChange = vi.fn();
    render(<ThemePage {...makeProps({ onBreatheChange, breathe: false })} />);
    fireEvent.click(screen.getByText("Breathe").closest(".mode-row")!);
    expect(onBreatheChange).toHaveBeenCalledWith(true);
  });

  it("calls onBreatheChange(false) when Breathe row is clicked and breathe is on", () => {
    const onBreatheChange = vi.fn();
    render(<ThemePage {...makeProps({ onBreatheChange, breathe: true })} />);
    fireEvent.click(screen.getByText("Breathe").closest(".mode-row")!);
    expect(onBreatheChange).toHaveBeenCalledWith(false);
  });

  it("hides Breathe Speed slider when breathe is off", () => {
    render(<ThemePage {...makeProps({ breathe: false })} />);
    expect(screen.queryByText("Breathe Speed")).not.toBeInTheDocument();
  });

  it("shows Breathe Speed slider when breathe is on", () => {
    render(<ThemePage {...makeProps({ breathe: true })} />);
    expect(screen.getByText("Breathe Speed")).toBeInTheDocument();
  });
});

describe("ThemePage Surge toggle", () => {
  it("calls onSurgeChange(true) when Surge row is clicked and surge is off", () => {
    const onSurgeChange = vi.fn();
    render(<ThemePage {...makeProps({ onSurgeChange, surge: false })} />);
    fireEvent.click(screen.getByText("Surge").closest(".mode-row")!);
    expect(onSurgeChange).toHaveBeenCalledWith(true);
  });

  it("calls onSurgeChange(false) when Surge row is clicked and surge is on", () => {
    const onSurgeChange = vi.fn();
    render(<ThemePage {...makeProps({ onSurgeChange, surge: true })} />);
    fireEvent.click(screen.getByText("Surge").closest(".mode-row")!);
    expect(onSurgeChange).toHaveBeenCalledWith(false);
  });

  it("hides Surge Period slider when surge is off", () => {
    render(<ThemePage {...makeProps({ surge: false })} />);
    expect(screen.queryByText("Surge Period")).not.toBeInTheDocument();
  });

  it("shows Surge Period slider when surge is on", () => {
    render(<ThemePage {...makeProps({ surge: true })} />);
    expect(screen.getByText("Surge Period")).toBeInTheDocument();
  });
});

describe("ThemePage bright-breathe / bright-surge children in DOM", () => {
  it("card-accent-spine has bright-breathe child", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines.length).toBeGreaterThan(0);
    spines.forEach((spine) => {
      expect(spine.querySelector(".bright-breathe")).not.toBeNull();
    });
  });

  it("card-accent-spine has bright-surge child", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines.length).toBeGreaterThan(0);
    spines.forEach((spine) => {
      expect(spine.querySelector(".bright-surge")).not.toBeNull();
    });
  });

  it("preview bar fills have bright-breathe child", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const bars = container.querySelectorAll(
      ".preview-bar-fill.accent-glow-target",
    );
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => {
      expect(bar.querySelector(".bright-breathe")).not.toBeNull();
    });
  });

  it("preview bar fills have bright-surge child", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const bars = container.querySelectorAll(
      ".preview-bar-fill.accent-glow-target",
    );
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => {
      expect(bar.querySelector(".bright-surge")).not.toBeNull();
    });
  });
});
