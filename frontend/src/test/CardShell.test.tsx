// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CardShell } from "../components/shared/CardComponents";

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
});
