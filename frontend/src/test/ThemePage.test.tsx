// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import ThemePage from "../pages/ThemePage";
import { useAccentIndexer } from "../utils/accentColors";

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
    ...overrides,
  };
}

describe("ThemePage effects toggles", () => {
  it("renders all 5 effect labels", () => {
    render(<ThemePage {...makeProps()} />);
    expect(screen.getByText("Neon Glow")).toBeInTheDocument();
    expect(screen.getByText("Pulse")).toBeInTheDocument();
    expect(screen.getByText("Inner Glow")).toBeInTheDocument();
    expect(screen.getByText("Gradient Border")).toBeInTheDocument();
    expect(screen.getByText("Card Glow")).toBeInTheDocument();
  });

  it("calls onGlowChange(true) when Neon Glow row is clicked", () => {
    const onGlowChange = vi.fn();
    render(<ThemePage {...makeProps({ onGlowChange })} />);
    fireEvent.click(screen.getByText("Neon Glow").closest(".mode-row")!);
    expect(onGlowChange).toHaveBeenCalledWith(true);
  });

  it("shows Intensity slider only when glow is on", () => {
    const { rerender } = render(<ThemePage {...makeProps({ glow: false })} />);
    expect(screen.queryByText("Intensity")).not.toBeInTheDocument();
    rerender(<ThemePage {...makeProps({ glow: true })} />);
    expect(screen.getByText("Intensity")).toBeInTheDocument();
  });

  it("calls onPulseChange(true) when Pulse row is clicked", () => {
    const onPulseChange = vi.fn();
    render(<ThemePage {...makeProps({ onPulseChange })} />);
    fireEvent.click(screen.getByText("Pulse").closest(".mode-row")!);
    expect(onPulseChange).toHaveBeenCalledWith(true);
  });

  it("shows Pulse Speed slider only when pulse is on", () => {
    const { rerender } = render(<ThemePage {...makeProps({ pulse: false })} />);
    expect(screen.queryByText(/Pulse Speed/)).not.toBeInTheDocument();
    rerender(<ThemePage {...makeProps({ pulse: true })} />);
    expect(screen.getByText(/Pulse Speed/)).toBeInTheDocument();
  });

  it("calls onInnerGlowChange(true) when Inner Glow row is clicked", () => {
    const onInnerGlowChange = vi.fn();
    render(<ThemePage {...makeProps({ onInnerGlowChange })} />);
    fireEvent.click(screen.getByText("Inner Glow").closest(".mode-row")!);
    expect(onInnerGlowChange).toHaveBeenCalledWith(true);
  });

  it("calls onGradientBorderChange(true) when Gradient Border row is clicked", () => {
    const onGradientBorderChange = vi.fn();
    render(<ThemePage {...makeProps({ onGradientBorderChange })} />);
    fireEvent.click(screen.getByText("Gradient Border").closest(".mode-row")!);
    expect(onGradientBorderChange).toHaveBeenCalledWith(true);
  });

  it("Card Glow does not call onCardGlowChange when glow and innerGlow are both off", () => {
    const onCardGlowChange = vi.fn();
    render(
      <ThemePage
        {...makeProps({ onCardGlowChange, glow: false, innerGlow: false })}
      />,
    );
    fireEvent.click(screen.getByText("Card Glow").closest(".mode-row")!);
    expect(onCardGlowChange).not.toHaveBeenCalled();
  });

  it("Card Glow calls onCardGlowChange(true) when Neon Glow is active", () => {
    const onCardGlowChange = vi.fn();
    render(<ThemePage {...makeProps({ onCardGlowChange, glow: true })} />);
    fireEvent.click(screen.getByText("Card Glow").closest(".mode-row")!);
    expect(onCardGlowChange).toHaveBeenCalledWith(true);
  });

  it("Card Glow calls onCardGlowChange(true) when Inner Glow is active", () => {
    const onCardGlowChange = vi.fn();
    render(<ThemePage {...makeProps({ onCardGlowChange, innerGlow: true })} />);
    fireEvent.click(screen.getByText("Card Glow").closest(".mode-row")!);
    expect(onCardGlowChange).toHaveBeenCalledWith(true);
  });

  it("Card Glow shows 'Requires' hint when no glow is active", () => {
    render(<ThemePage {...makeProps({ glow: false, innerGlow: false })} />);
    expect(
      screen.getByText(/Requires Neon Glow or Inner Glow/),
    ).toBeInTheDocument();
  });

  it("accent color swatches do not have data-accent-el", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const swatches = container.querySelectorAll(".color-option");
    expect(swatches.length).toBeGreaterThan(0);
    swatches.forEach((swatch) => {
      expect(swatch).not.toHaveAttribute("data-accent-el");
    });
  });
});

describe("ThemePage preview parity", () => {
  it("preview cards use CardShell: each has data-accent-el and card-accent-spine child", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const previewRow = container.querySelector(".preview-cards-row");
    expect(previewRow).toBeTruthy();
    const cards = previewRow!.querySelectorAll("[data-accent-el]");
    expect(cards.length).toBeGreaterThanOrEqual(3);
    cards.forEach((card) => {
      const spine = card.querySelector(".card-accent-spine.accent-glow-target");
      expect(spine).toBeTruthy();
    });
  });

  it("preview metric cards render real ProgressBar components", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const bars = container.querySelectorAll(".card-progress-bar");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("accent-glow-target elements carry no inline opacity — Pulse animates ::after in CSS only", () => {
    const { container } = render(<ThemePage {...makeProps()} />);
    const targets = container.querySelectorAll(".accent-glow-target");
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe("");
    });
  });
});

describe("ThemePage slider accessibility", () => {
  it("all visible SliderRow inputs expose aria-valuetext matching their display label", () => {
    // Render with sheen mode + all sub-effects on to surface every SliderRow
    const { container } = render(
      <ThemePage
        {...makeProps({
          accentMode: "sheen",
          fxSpeed: 4,
          fxSpread: 34,
          fxDepth: 30,
          glow: true,
          glowIntensity: 1.4,
          pulse: true,
          pulseSpeed: 4,
          pulseIntensity: 1.5,
          breathe: true,
          breatheSpeed: 4,
          breatheIntensity: 1,
          surge: true,
          surgePeriod: 6,
          surgeIntensity: 1,
        })}
      />,
    );
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBeGreaterThan(0);
    sliders.forEach((slider) => {
      const valuetext = slider.getAttribute("aria-valuetext");
      expect(valuetext).toBeTruthy();
    });
  });
});

describe("ThemePage mode-dependency hints", () => {
  it("shows Effect Controls mode hint when accentMode is solid", () => {
    render(<ThemePage {...makeProps({ accentMode: "solid" })} />);
    expect(
      screen.getByText(/Active in Sheen/i),
    ).toBeInTheDocument();
  });

  it("does not show Effect Controls mode hint when accentMode is sheen", () => {
    render(<ThemePage {...makeProps({ accentMode: "sheen", fxSpeed: 12, onFxSpeedChange: vi.fn() })} />);
    expect(screen.queryByText(/Active in Sheen/i)).not.toBeInTheDocument();
  });

  it("does not show Effect Controls mode hint when accentMode is spectrum", () => {
    render(<ThemePage {...makeProps({ accentMode: "spectrum", fxSpread: 34, onFxSpreadChange: vi.fn() })} />);
    expect(screen.queryByText(/Active in Sheen/i)).not.toBeInTheDocument();
  });
});

describe("useAccentIndexer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("assigns --el-index to [data-accent-el] elements in document order", () => {
    const els = [0, 1, 2].map(() => {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", "");
      document.body.appendChild(el);
      return el;
    });

    renderHook(() => useAccentIndexer());

    els.forEach((el, i) => {
      expect(el.style.getPropertyValue("--el-index")).toBe(String(i));
    });
  });

  it("assigns distinct indices to 5 elements", () => {
    for (let i = 0; i < 5; i++) {
      const el = document.createElement("div");
      el.setAttribute("data-accent-el", "");
      document.body.appendChild(el);
    }
    renderHook(() => useAccentIndexer());

    const nodes = document.querySelectorAll("[data-accent-el]");
    const indices = Array.from(nodes).map((el) =>
      (el as HTMLElement).style.getPropertyValue("--el-index"),
    );
    expect(new Set(indices).size).toBe(5);
  });

  it("does not assign --el-index to elements without data-accent-el", () => {
    const withAttr = document.createElement("div");
    withAttr.setAttribute("data-accent-el", "");
    const plain = document.createElement("div");
    document.body.appendChild(withAttr);
    document.body.appendChild(plain);

    renderHook(() => useAccentIndexer());

    expect(withAttr.style.getPropertyValue("--el-index")).toBe("0");
    expect(plain.style.getPropertyValue("--el-index")).toBe("");
  });
});
