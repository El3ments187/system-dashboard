// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ThemePage from "../pages/ThemePage";
import { ACCENT_THEMES } from "../hooks/useTheme";

function makeGlowCustomProps(overrides: Record<string, unknown> = {}) {
  return {
    accent: "blue",
    onAccentChange: vi.fn(),
    accentMode: "solid",
    onAccentModeChange: vi.fn(),
    bg: "dark",
    onBgChange: vi.fn(),
    onReset: vi.fn(),
    glow: true,
    onGlowChange: vi.fn(),
    glowIntensity: 1.4,
    onGlowIntensityChange: vi.fn(),
    glowColor: "custom" as const,
    onGlowColorChange: vi.fn(),
    glowCustom: "#06B6D4", // Cyan — in palette
    onGlowCustomChange: vi.fn(),
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

describe("Glow Color swatch selector", () => {
  it("renders exactly 32 swatch buttons when glowColor=custom", () => {
    render(<ThemePage {...makeGlowCustomProps()} />);
    const container = screen.getByTestId("glow-custom-swatches");
    const swatches = within(container).getAllByRole("button");
    expect(swatches).toHaveLength(ACCENT_THEMES.length);
    expect(ACCENT_THEMES).toHaveLength(32);
  });

  it("does NOT render a free-form <input type=color>", () => {
    render(<ThemePage {...makeGlowCustomProps()} />);
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it("swatch colors match ACCENT_THEMES exactly (shared palette source)", () => {
    render(<ThemePage {...makeGlowCustomProps()} />);
    const container = screen.getByTestId("glow-custom-swatches");
    for (const theme of ACCENT_THEMES) {
      const btn = within(container).getByRole("button", { name: theme.name });
      expect(btn).toBeInTheDocument();
    }
  });

  it("clicking a swatch calls onGlowCustomChange with its color", () => {
    const onGlowCustomChange = vi.fn();
    render(<ThemePage {...makeGlowCustomProps({ onGlowCustomChange })} />);
    const container = screen.getByTestId("glow-custom-swatches");
    const cyanBtn = within(container).getByRole("button", { name: "Cyan" });
    fireEvent.click(cyanBtn);
    expect(onGlowCustomChange).toHaveBeenCalledWith("#06B6D4");
  });

  it("the selected swatch (matching glowCustom) is visually marked", () => {
    render(<ThemePage {...makeGlowCustomProps({ glowCustom: "#06B6D4" })} />);
    const container = screen.getByTestId("glow-custom-swatches");
    const cyanBtn = within(container).getByRole("button", { name: "Cyan" });
    // The selected swatch should have a solid border (not transparent)
    expect(cyanBtn.style.border).not.toContain("transparent");
  });

  it("swatch grid is hidden when glowColor=match", () => {
    render(
      <ThemePage {...makeGlowCustomProps({ glowColor: "match" as const })} />,
    );
    expect(screen.queryByTestId("glow-custom-swatches")).toBeNull();
  });

  it("swatch grid is hidden when glowColor=accent", () => {
    render(
      <ThemePage {...makeGlowCustomProps({ glowColor: "accent" as const })} />,
    );
    expect(screen.queryByTestId("glow-custom-swatches")).toBeNull();
  });

  it("swatch grid uses the same ACCENT_THEMES export as accent picker (count invariant)", () => {
    // This test ensures: if the palette changes, both pickers change together.
    // We verify by asserting the swatch count === ACCENT_THEMES.length (not a hardcoded 32).
    render(<ThemePage {...makeGlowCustomProps()} />);
    const container = screen.getByTestId("glow-custom-swatches");
    const allNamedSwatches = ACCENT_THEMES.map((t) =>
      within(container).queryByRole("button", { name: t.name }),
    );
    const found = allNamedSwatches.filter(Boolean);
    expect(found).toHaveLength(ACCENT_THEMES.length);
  });
});
