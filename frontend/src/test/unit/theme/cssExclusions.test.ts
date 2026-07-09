import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const variablesCss = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf-8",
);

describe("Breathe effect — data element exclusions in variables.css", () => {
  it("excludes accent-fill glow targets from bright-breathe animation", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target .bright-breathe',
    );
  });

  it("excludes theme-live-preview-bar from bright-breathe animation", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .theme-live-preview-bar.accent-glow-target .bright-breathe',
    );
  });

  it("excludes accent-fill glow targets from breathe ::after glow", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target::after',
    );
  });

  it("breathe exclusion rules set animation: none", () => {
    const idx = variablesCss.indexOf(
      '[data-breathe="on"] .accent-fill.accent-glow-target .bright-breathe',
    );
    expect(idx).not.toBe(-1);
    const ruleBlock = variablesCss.slice(idx, idx + 200);
    expect(ruleBlock).toContain("animation: none");
  });
});

describe("Surge effect — data element exclusions in variables.css", () => {
  it("excludes accent-fill glow targets from bright-surge animation", () => {
    expect(variablesCss).toContain(
      '[data-surge="on"] .accent-fill.accent-glow-target .bright-surge',
    );
  });

  it("excludes theme-live-preview-bar from bright-surge animation", () => {
    expect(variablesCss).toContain(
      '[data-surge="on"] .theme-live-preview-bar.accent-glow-target .bright-surge',
    );
  });

  it("surge exclusion rules set animation: none", () => {
    const idx = variablesCss.indexOf(
      '[data-surge="on"] .accent-fill.accent-glow-target .bright-surge',
    );
    expect(idx).not.toBe(-1);
    const ruleBlock = variablesCss.slice(idx, idx + 200);
    expect(ruleBlock).toContain("animation: none");
  });
});
