import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const variablesCss = readFileSync(
  resolve(__dirname, "../../../styles/variables.css"),
  "utf-8",
).replace(/\s+/g, " ");

describe("Breathe effect — data element exclusions in variables.css", () => {
  it("excludes warning-state accent-fill glow targets from bright-breathe animation", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target[data-state="warning"] .bright-breathe',
    );
  });

  it("excludes critical-state accent-fill glow targets from bright-breathe animation", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target[data-state="critical"] .bright-breathe',
    );
  });

  it("excludes warning-state accent-fill glow targets from breathe ::after glow", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target[data-state="warning"]::after',
    );
  });

  it("excludes critical-state accent-fill glow targets from breathe ::after glow", () => {
    expect(variablesCss).toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target[data-state="critical"]::after',
    );
  });

  it("breathe exclusion rules set animation: none", () => {
    const idx = variablesCss.indexOf(
      '[data-breathe="on"] .accent-fill.accent-glow-target[data-state="warning"] .bright-breathe',
    );
    expect(idx).not.toBe(-1);
    const ruleBlock = variablesCss.slice(idx, idx + 300);
    expect(ruleBlock).toContain("animation: none");
  });

  it("normal-state bars are NOT excluded from bright-breathe (no blanket exclusion)", () => {
    // The blanket `.accent-fill.accent-glow-target .bright-breathe { animation: none }` must not exist
    expect(variablesCss).not.toContain(
      '[data-breathe="on"] .accent-fill.accent-glow-target .bright-breathe',
    );
  });
});

describe("Surge effect — data element exclusions in variables.css", () => {
  it("excludes warning-state accent-fill glow targets from bright-surge animation", () => {
    expect(variablesCss).toContain(
      '[data-surge="on"] .accent-fill.accent-glow-target[data-state="warning"] .bright-surge',
    );
  });

  it("excludes critical-state accent-fill glow targets from bright-surge animation", () => {
    expect(variablesCss).toContain(
      '[data-surge="on"] .accent-fill.accent-glow-target[data-state="critical"] .bright-surge',
    );
  });

  it("surge exclusion rules set animation: none", () => {
    const idx = variablesCss.indexOf(
      '[data-surge="on"] .accent-fill.accent-glow-target[data-state="warning"] .bright-surge',
    );
    expect(idx).not.toBe(-1);
    const ruleBlock = variablesCss.slice(idx, idx + 200);
    expect(ruleBlock).toContain("animation: none");
  });

  it("normal-state bars are NOT excluded from bright-surge (no blanket exclusion)", () => {
    expect(variablesCss).not.toContain(
      '[data-surge="on"] .accent-fill.accent-glow-target .bright-surge',
    );
  });
});
