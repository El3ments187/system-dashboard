// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CardShell, Card } from "../components/shared/CardComponents";

describe("CardShell structure", () => {
  it("renders with data-accent-el attribute on the root", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-accent-el");
  });

  it("renders .card-accent-spine.accent-glow-target as first child", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const card = container.firstChild as HTMLElement;
    const spine = card.querySelector(".card-accent-spine.accent-glow-target");
    expect(spine).toBeTruthy();
    expect(card.firstChild).toBe(spine);
  });

  it("has overflow:visible so spine ::after glow is not clipped", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.style.overflow).toBe("visible");
  });

  it("has position:relative so spine can be positioned absolutely", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.style.position).toBe("relative");
  });

  it("spine has no inline opacity — Pulse animation targets ::after in CSS only", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const spine = container.querySelector(
      ".card-accent-spine",
    ) as HTMLElement | null;
    expect(spine).toBeTruthy();
    expect(spine!.style.opacity).toBe("");
  });

  it("renders children after the spine", () => {
    const { getByText } = render(
      <CardShell>
        <div>inner content</div>
      </CardShell>,
    );
    expect(getByText("inner content")).toBeTruthy();
  });

  it("renders exactly one .card-accent-spine.accent-glow-target", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines).toHaveLength(1);
  });

  it("spine contains exactly one .bright-breathe and one .bright-surge", () => {
    const { container } = render(
      <CardShell>
        <div>content</div>
      </CardShell>,
    );
    const spine = container.querySelector(".card-accent-spine")!;
    expect(spine.querySelectorAll(".bright-breathe")).toHaveLength(1);
    expect(spine.querySelectorAll(".bright-surge")).toHaveLength(1);
  });
});

describe("Card structure", () => {
  it("renders with data-accent-el attribute on the root", () => {
    const { container } = render(
      <Card>
        <div>content</div>
      </Card>,
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-accent-el");
  });

  it("renders exactly one .card-accent-spine.accent-glow-target", () => {
    const { container } = render(
      <Card>
        <div>content</div>
      </Card>,
    );
    const spines = container.querySelectorAll(
      ".card-accent-spine.accent-glow-target",
    );
    expect(spines).toHaveLength(1);
  });

  it("spine contains exactly one .bright-breathe and one .bright-surge", () => {
    const { container } = render(
      <Card>
        <div>content</div>
      </Card>,
    );
    const spine = container.querySelector(".card-accent-spine")!;
    expect(spine.querySelectorAll(".bright-breathe")).toHaveLength(1);
    expect(spine.querySelectorAll(".bright-surge")).toHaveLength(1);
  });

  it("spine is the first child of the card root", () => {
    const { container } = render(
      <Card>
        <div>content</div>
      </Card>,
    );
    const card = container.firstChild as HTMLElement;
    const spine = card.querySelector(".card-accent-spine");
    expect(card.firstChild).toBe(spine);
  });

  it("renders children after the spine", () => {
    const { getByText } = render(
      <Card>
        <div>inner content</div>
      </Card>,
    );
    expect(getByText("inner content")).toBeTruthy();
  });
});
