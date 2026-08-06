// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AccentSpine } from "../components/shared/CardComponents";
import ProgressBar from "../components/shared/ProgressBar";
import CoreBars from "../charts/CoreBars";

describe("sheen/flow overlay span — AccentSpine", () => {
  it("card-accent-spine has .sheen-flow-overlay child", () => {
    const { container } = render(<AccentSpine />);
    const spine = container.querySelector(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spine).not.toBeNull();
    expect(spine!.querySelector(".sheen-flow-overlay")).not.toBeNull();
  });

  it(".sheen-flow-overlay precedes .bright-breathe (renders below in stacking)", () => {
    const { container } = render(<AccentSpine />);
    const spine = container.querySelector(
      ".card-accent-spine.accent-glow-target",
    )!;
    const children = Array.from(spine.children);
    const overlayIdx = children.findIndex((c) =>
      c.classList.contains("sheen-flow-overlay"),
    );
    const breatheIdx = children.findIndex((c) =>
      c.classList.contains("bright-breathe"),
    );
    expect(overlayIdx).toBeGreaterThanOrEqual(0);
    expect(breatheIdx).toBeGreaterThan(overlayIdx);
  });
});

describe("sheen/flow overlay span — ProgressBar", () => {
  it("normal-state progress bar has .sheen-flow-overlay child", () => {
    const { container } = render(<ProgressBar percent={50} />);
    const bar = container.querySelector(
      ".card-progress-bar.accent-glow-target",
    );
    expect(bar).not.toBeNull();
    expect(bar!.querySelector(".sheen-flow-overlay")).not.toBeNull();
  });

  it("warning-state progress bar has no .sheen-flow-overlay (not a glow target)", () => {
    const { container } = render(<ProgressBar percent={75} />);
    const bar = container.querySelector(".card-progress-bar");
    expect(bar).not.toBeNull();
    // warning bars don't get accent-glow-target, so no overlay
    expect(bar!.classList.contains("accent-glow-target")).toBe(false);
    expect(bar!.querySelector(".sheen-flow-overlay")).toBeNull();
  });
});

describe("sheen/flow overlay span — CoreBars", () => {
  it("normal-state core bar has .sheen-flow-overlay child", () => {
    const { container } = render(
      <CoreBars cores={[{ utilization_percent: 50 }]} />,
    );
    const bar = container.querySelector('[data-testid="per-core-bar"]')!;
    expect(bar.classList.contains("accent-glow-target")).toBe(true);
    expect(bar.querySelector(".sheen-flow-overlay")).not.toBeNull();
  });

  it("warning-state core bar has no .sheen-flow-overlay", () => {
    const { container } = render(
      <CoreBars cores={[{ utilization_percent: 75 }]} />,
    );
    const bar = container.querySelector('[data-testid="per-core-bar"]')!;
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".sheen-flow-overlay")).toBeNull();
  });
});
