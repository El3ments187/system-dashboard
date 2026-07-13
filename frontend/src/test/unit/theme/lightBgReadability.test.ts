import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const variablesCss = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf-8",
);

describe("Light-background readability floor — CSS overrides (REQ-AM-77/78)", () => {
  const LIGHT_BG_SELECTOR =
    ':is(\n  [data-bg="light"],\n  [data-bg="paper"],\n  [data-bg="nord-light"],\n  [data-bg="cream"]\n)';

  it("ice accent is darkened on light backgrounds", () => {
    expect(variablesCss).toContain(`${LIGHT_BG_SELECTOR}[data-accent="ice"]`);
    const idx = variablesCss.indexOf(`${LIGHT_BG_SELECTOR}[data-accent="ice"]`);
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).toContain("--accent-base:");
  });

  it("silver accent is darkened on light backgrounds", () => {
    expect(variablesCss).toContain(
      `${LIGHT_BG_SELECTOR}[data-accent="silver"]`,
    );
    const idx = variablesCss.indexOf(
      `${LIGHT_BG_SELECTOR}[data-accent="silver"]`,
    );
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).toContain("--accent-base:");
  });

  it("platinum accent is darkened on light backgrounds", () => {
    expect(variablesCss).toContain(
      `${LIGHT_BG_SELECTOR}[data-accent="platinum"]`,
    );
    const idx = variablesCss.indexOf(
      `${LIGHT_BG_SELECTOR}[data-accent="platinum"]`,
    );
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).toContain("--accent-base:");
  });

  it("ice floor color is darker than its original base (#8fd8ff)", () => {
    const idx = variablesCss.indexOf(`${LIGHT_BG_SELECTOR}[data-accent="ice"]`);
    const block = variablesCss.slice(idx, idx + 200);
    // Floor value must not be the original ice color
    expect(block).not.toContain("#8fd8ff");
    expect(block).not.toContain("#8FD8FF");
  });

  it("platinum floor color is darker than its original base (#e5e4e2)", () => {
    const idx = variablesCss.indexOf(
      `${LIGHT_BG_SELECTOR}[data-accent="platinum"]`,
    );
    const block = variablesCss.slice(idx, idx + 200);
    expect(block).not.toContain("#e5e4e2");
    expect(block).not.toContain("#E5E4E2");
  });

  it("--accent-base-rgb is also overridden alongside --accent-base", () => {
    for (const accent of ["ice", "silver", "platinum"]) {
      const idx = variablesCss.indexOf(
        `${LIGHT_BG_SELECTOR}[data-accent="${accent}"]`,
      );
      const block = variablesCss.slice(idx, idx + 200);
      expect(block, `${accent} should override --accent-base-rgb`).toContain(
        "--accent-base-rgb:",
      );
    }
  });
});
