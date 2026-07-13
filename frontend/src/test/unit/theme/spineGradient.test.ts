import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const themeCss = readFileSync(
  resolve(__dirname, "../../../styles/theme.css"),
  "utf-8",
);

describe("card-accent-spine — gradient fill", () => {
  function getSpineRuleBlock(): string {
    // Match only the standalone rule (newline before selector), not a descendant selector
    const start = themeCss.indexOf("\n.card-accent-spine {");
    expect(
      start,
      "standalone .card-accent-spine rule must exist in theme.css",
    ).not.toBe(-1);
    const end = themeCss.indexOf("}", start);
    return themeCss.slice(start, end + 1);
  }

  it("uses var(--accent-fill) for its background", () => {
    expect(getSpineRuleBlock()).toContain("var(--accent-fill)");
  });

  it("does NOT use var(--accent-primary) as background (would be solid-only)", () => {
    const rule = getSpineRuleBlock();
    // background-size may legitimately reference nothing about accent-primary;
    // the background property itself must not be var(--accent-primary)
    expect(rule).not.toMatch(/background:\s*var\(--accent-primary\)/);
  });

  it("specifies background-size for gradient/animated modes", () => {
    expect(getSpineRuleBlock()).toContain("var(--accent-fill-size)");
  });
});
