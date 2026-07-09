import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccentSpine } from "../components/shared/CardComponents";

describe("AccentSpine", () => {
  it("renders the canonical card-accent-spine class", () => {
    const { container } = render(<AccentSpine />);
    const spine = container.querySelector(".card-accent-spine");
    expect(spine).not.toBeNull();
  });

  it("has accent-glow-target class for glow effects", () => {
    const { container } = render(<AccentSpine />);
    const spine = container.querySelector(".card-accent-spine");
    expect(spine?.classList.contains("accent-glow-target")).toBe(true);
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<AccentSpine />);
    const spine = container.querySelector(".card-accent-spine");
    expect(spine?.getAttribute("aria-hidden")).toBe("true");
  });

  it("contains bright-breathe and bright-surge animation children", () => {
    const { container } = render(<AccentSpine />);
    expect(container.querySelector(".bright-breathe")).not.toBeNull();
    expect(container.querySelector(".bright-surge")).not.toBeNull();
  });

  it("animation children are also hidden from assistive technology", () => {
    const { container } = render(<AccentSpine />);
    const breathe = container.querySelector(".bright-breathe");
    const surge = container.querySelector(".bright-surge");
    expect(breathe?.getAttribute("aria-hidden")).toBe("true");
    expect(surge?.getAttribute("aria-hidden")).toBe("true");
  });

  it("does NOT use the bespoke accent-spine class", () => {
    const { container } = render(<AccentSpine />);
    expect(container.querySelector(".accent-spine")).toBeNull();
  });

  it("does NOT use the ov-spine class", () => {
    const { container } = render(<AccentSpine />);
    expect(container.querySelector(".ov-spine")).toBeNull();
  });
});
