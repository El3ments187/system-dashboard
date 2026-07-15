// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoreBars from "../../../charts/CoreBars";

// getProgressState thresholds: normal < 70, warning 70–89, critical >= 90

describe("CoreBars per-core bar glow targeting", () => {
  it("normal-state core (util=50) has accent-glow-target and both bright children", () => {
    const { container } = render(
      <CoreBars cores={[{ utilization_percent: 50 }]} />,
    );
    const bar = container.querySelector('[data-testid="per-core-bar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.classList.contains("accent-glow-target")).toBe(true);
    expect(bar.querySelector(".bright-breathe")).not.toBeNull();
    expect(bar.querySelector(".bright-surge")).not.toBeNull();
  });

  it("warning-state core (util=75) has no accent-glow-target and no bright children", () => {
    const { container } = render(
      <CoreBars cores={[{ utilization_percent: 75 }]} />,
    );
    const bar = container.querySelector('[data-testid="per-core-bar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".bright-breathe")).toBeNull();
    expect(bar.querySelector(".bright-surge")).toBeNull();
  });

  it("critical-state core (util=95) has no accent-glow-target and no bright children", () => {
    const { container } = render(
      <CoreBars cores={[{ utilization_percent: 95 }]} />,
    );
    const bar = container.querySelector('[data-testid="per-core-bar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".bright-breathe")).toBeNull();
    expect(bar.querySelector(".bright-surge")).toBeNull();
  });

  it.each([
    [50, true],
    [75, false],
    [95, false],
  ] as const)(
    "class/children always in sync: util=%i% → isTarget=%s",
    (util, shouldBeTarget) => {
      const { container } = render(
        <CoreBars cores={[{ utilization_percent: util }]} />,
      );
      const bar = container.querySelector('[data-testid="per-core-bar"]')!;
      const hasClass = bar.classList.contains("accent-glow-target");
      const hasBreathe = bar.querySelector(".bright-breathe") !== null;
      const hasSurge = bar.querySelector(".bright-surge") !== null;
      expect(hasClass).toBe(shouldBeTarget);
      expect(hasBreathe).toBe(shouldBeTarget);
      expect(hasSurge).toBe(shouldBeTarget);
    },
  );
});
