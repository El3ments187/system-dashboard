import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");
const CANONICAL = path.join(SRC, "utils/accentColors.ts");

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") return walk(full);
    if (e.isFile() && /\.(tsx?|js)$/.test(e.name)) return [full];
    return [];
  });
}

describe("colorSingleSource invariant", () => {
  it("no src/ file outside accentColors.ts reads --accent* via getPropertyValue", () => {
    const files = walk(SRC).filter(
      (f) => f !== CANONICAL && !f.includes("/test/") && !f.includes("/invariants/"),
    );

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (/getPropertyValue\s*\(\s*["'`]--accent/.test(content)) {
        violations.push(path.relative(SRC, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("no src/ file has an alpha-suffix on a CSS var() (e.g. `${var(--x)}20`)", () => {
    const files = walk(SRC).filter(
      (f) => f !== CANONICAL && !f.includes("/test/") && !f.includes("/invariants/"),
    );

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (/`\$\{var\(/.test(content)) {
        violations.push(path.relative(SRC, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
