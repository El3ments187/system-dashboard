/**
 * The accent indexer's "inherit" opt-out — the mechanism the rainbow-mode
 * chart bug rode in on. Charts' ChartFrame carries data-accent-el="inherit"
 * so they take the nearest PAGE-provided scope; the indexer must (a) assign
 * distinct --el-index values to real markers and (b) never index an
 * "inherit" element (and must CLEAR a stale index from one). Regression here
 * silently collapses spectrum/rainbow modes back to one-hue-one-phase.
 */
import { renderHook } from "@testing-library/react";
import { useAccentIndexer } from "../utils/accentColors";

describe("accent indexer inherit opt-out", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-accent-mode", "spectrum");
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.documentElement.removeAttribute("data-accent-mode");
    document.body.innerHTML = "";
  });

  it("indexes plain markers distinctly and skips (and clears) inherit markers", () => {
    document.body.innerHTML = `
      <div id="a" data-accent-el=""></div>
      <div id="b" data-accent-el=""></div>
      <div id="c" data-accent-el="inherit" style="--el-index: 7"></div>
      <div id="d" data-accent-el=""></div>
    `;
    renderHook(() => useAccentIndexer());

    const idx = (id: string) =>
      (document.getElementById(id) as HTMLElement).style.getPropertyValue(
        "--el-index",
      );
    const assigned = [idx("a"), idx("b"), idx("d")];
    expect(assigned.every((v) => v !== "")).toBe(true);
    expect(
      new Set(assigned).size,
      "plain markers must get DISTINCT indices",
    ).toBe(3);
    expect(idx("c"), "inherit marker must have its stale index CLEARED").toBe(
      "",
    );
  });
});
