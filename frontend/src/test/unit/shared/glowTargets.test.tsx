// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProgressBar from "../../../components/shared/ProgressBar";
import { Card, CardShell } from "../../../components/shared/CardComponents";

describe("ProgressBar glow targeting", () => {
  it("normal bar (50%) is a glow target with bright children", () => {
    const { container } = render(<ProgressBar percent={50} />);
    const bar = container.querySelector(".card-progress-bar")!;
    expect(bar.classList.contains("accent-glow-target")).toBe(true);
    expect(bar.querySelector(".bright-breathe")).not.toBeNull();
    expect(bar.querySelector(".bright-surge")).not.toBeNull();
  });

  it("warning bar (75%) is NOT a glow target", () => {
    const { container } = render(<ProgressBar percent={75} />);
    const bar = container.querySelector(".card-progress-bar")!;
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".bright-breathe")).toBeNull();
    expect(bar.querySelector(".bright-surge")).toBeNull();
  });

  it("critical bar (95%) is NOT a glow target", () => {
    const { container } = render(<ProgressBar percent={95} />);
    const bar = container.querySelector(".card-progress-bar")!;
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".bright-breathe")).toBeNull();
    expect(bar.querySelector(".bright-surge")).toBeNull();
  });

  it("glow={false} suppresses auto-targeting on a normal bar", () => {
    const { container } = render(<ProgressBar percent={50} glow={false} />);
    const bar = container.querySelector(".card-progress-bar")!;
    expect(bar.classList.contains("accent-glow-target")).toBe(false);
    expect(bar.querySelector(".bright-breathe")).toBeNull();
    expect(bar.querySelector(".bright-surge")).toBeNull();
  });

  it("explicit barClassName='accent-glow-target' deduplicates class and renders bright children", () => {
    const { container } = render(
      <ProgressBar percent={50} barClassName="accent-glow-target" />,
    );
    const bar = container.querySelector(".card-progress-bar")!;
    const count = bar.className
      .split(/\s+/)
      .filter((c) => c === "accent-glow-target").length;
    expect(count).toBe(1);
    expect(bar.querySelector(".bright-breathe")).not.toBeNull();
    expect(bar.querySelector(".bright-surge")).not.toBeNull();
  });

  it.each([
    [50, true],
    [75, false],
    [95, false],
  ] as const)(
    "class/children in sync: percent=%i → isTarget=%s",
    (percent, shouldBeTarget) => {
      const { container } = render(<ProgressBar percent={percent} />);
      const bar = container.querySelector(".card-progress-bar")!;
      const hasClass = bar.classList.contains("accent-glow-target");
      const hasBreathe = bar.querySelector(".bright-breathe") !== null;
      const hasSurge = bar.querySelector(".bright-surge") !== null;
      expect(hasClass).toBe(shouldBeTarget);
      expect(hasBreathe).toBe(shouldBeTarget);
      expect(hasSurge).toBe(shouldBeTarget);
    },
  );
});

describe("Card/CardShell Phase-0 regression guards", () => {
  it("<Card> default renders .accent-glow-target", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector(".accent-glow-target")).not.toBeNull();
  });

  it("<Card spine={false}> renders no .accent-glow-target", () => {
    const { container } = render(<Card spine={false}>x</Card>);
    expect(container.querySelector(".accent-glow-target")).toBeNull();
  });

  it("<CardShell> always renders .accent-glow-target", () => {
    const { container } = render(<CardShell>x</CardShell>);
    expect(container.querySelector(".accent-glow-target")).not.toBeNull();
  });
});
