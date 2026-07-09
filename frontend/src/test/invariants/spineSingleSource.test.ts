import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");
const CANONICAL = path.join(SRC, "components/shared/CardComponents.tsx");

const SPINE_STRINGS = [
  "card-accent-spine",
  "accent-glow-target",
  "bright-breathe",
  "bright-surge",
];

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") return walk(full);
    if (e.isFile() && /\.(tsx?|js)$/.test(e.name)) return [full];
    return [];
  });
}

describe("spineSingleSource invariant", () => {
  it("spine class strings appear only in CardComponents.tsx, nowhere else in src/", () => {
    const files = walk(SRC).filter(
      (f) => f !== CANONICAL && !f.includes("/test/") && !f.includes("/invariants/"),
    );

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const str of SPINE_STRINGS) {
        if (content.includes(str)) {
          violations.push(`${path.relative(SRC, file)} contains "${str}"`);
          break;
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
