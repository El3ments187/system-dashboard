import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemePage from "../../../pages/ThemePage";

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    accent: "blue",
    onAccentChange: vi.fn(),
    accentMode: "solid",
    onAccentModeChange: vi.fn(),
    bg: "dark",
    onBgChange: vi.fn(),
    onReset: vi.fn(),
    breathe: false,
    onBreatheChange: vi.fn(),
    surge: false,
    onSurgeChange: vi.fn(),
    ...overrides,
  };
}

const PALE_ACCENTS = ["Ice", "Silver", "Platinum"] as const;
const LIGHT_BGS = ["Light", "Paper", "Nord Light", "Cream"] as const;

describe("Contrast blocking — pale accent × light background", () => {
  it("pale accents are NOT disabled on a dark background", () => {
    render(<ThemePage {...makeProps({ bg: "dark" })} />);
    for (const name of PALE_ACCENTS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).not.toHaveClass("disabled");
    }
  });

  it("pale accents are disabled when bg is light", () => {
    render(<ThemePage {...makeProps({ bg: "light" })} />);
    for (const name of PALE_ACCENTS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).toHaveClass("disabled");
    }
  });

  it("pale accents are disabled on all four light bg variants", () => {
    for (const bg of ["paper", "nord-light", "cream"] as const) {
      const { unmount } = render(<ThemePage {...makeProps({ bg })} />);
      const iceSwatch = screen.getByText("Ice").closest(".color-option");
      expect(iceSwatch, `Ice should be disabled for bg=${bg}`).toHaveClass(
        "disabled",
      );
      unmount();
    }
  });

  it("clicking a disabled accent swatch does NOT call onAccentChange", () => {
    const onAccentChange = vi.fn();
    render(<ThemePage {...makeProps({ bg: "light", onAccentChange })} />);
    const iceSwatch = screen.getByText("Ice").closest(".color-option")!;
    fireEvent.click(iceSwatch);
    expect(onAccentChange).not.toHaveBeenCalled();
  });

  it("light backgrounds are disabled when accent is ice", () => {
    render(<ThemePage {...makeProps({ accent: "ice" })} />);
    for (const name of LIGHT_BGS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).toHaveClass("disabled");
    }
  });

  it("light backgrounds are disabled when accent is silver", () => {
    render(<ThemePage {...makeProps({ accent: "silver" })} />);
    for (const name of LIGHT_BGS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).toHaveClass("disabled");
    }
  });

  it("light backgrounds are disabled when accent is platinum", () => {
    render(<ThemePage {...makeProps({ accent: "platinum" })} />);
    for (const name of LIGHT_BGS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).toHaveClass("disabled");
    }
  });

  it("clicking a disabled bg swatch does NOT call onBgChange", () => {
    const onBgChange = vi.fn();
    render(<ThemePage {...makeProps({ accent: "ice", onBgChange })} />);
    const lightSwatch = screen.getByText("Light").closest(".color-option")!;
    fireEvent.click(lightSwatch);
    expect(onBgChange).not.toHaveBeenCalled();
  });

  it("non-pale accents do NOT disable light backgrounds", () => {
    render(<ThemePage {...makeProps({ accent: "blue" })} />);
    for (const name of LIGHT_BGS) {
      const swatch = screen.getByText(name).closest(".color-option");
      expect(swatch).not.toHaveClass("disabled");
    }
  });

  it("disabled swatch carries a tooltip that mentions contrast", () => {
    render(<ThemePage {...makeProps({ bg: "light" })} />);
    const iceSwatch = screen.getByText("Ice").closest(".color-option") as HTMLElement;
    expect(iceSwatch.title).toMatch(/contrast/i);
  });

  it("disabled bg swatch carries a tooltip that mentions contrast", () => {
    render(<ThemePage {...makeProps({ accent: "ice" })} />);
    const lightSwatch = screen.getByText("Light").closest(".color-option") as HTMLElement;
    expect(lightSwatch.title).toMatch(/contrast/i);
  });
});
