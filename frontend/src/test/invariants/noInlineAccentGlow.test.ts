import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") return walk(full);
    if (e.isFile() && /\.(tsx?|js)$/.test(e.name)) return [full];
    return [];
  });
}

describe("noInlineAccentGlow invariant", () => {
  it("no src/ file applies an accent glow via inline style", () => {
    const files = walk(SRC).filter(
      (f) => !f.includes("/test/") && !f.includes("/invariants/"),
    );

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const hasViolation = content
        .split("\n")
        .some(
          (line) =>
            /--accent-glow/.test(line) &&
            /(textShadow|boxShadow|filter)\s*:/.test(line),
        );
      if (hasViolation) {
        violations.push(path.relative(SRC, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
