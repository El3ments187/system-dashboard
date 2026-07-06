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
