import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");
// CardComponents.tsx is the single canonical source for the spine element.
// bright-breathe / bright-surge are animation overlay spans that belong on
// every accent-glow-target element, wherever that lives (bars, cards, etc.),
// so they are intentionally NOT restricted here.
const CANONICAL_FILES = new Set([
  path.join(SRC, "components/shared/CardComponents.tsx"),
]);

// Only the structural spine element class is single-source.
// accent-glow-target, bright-breathe, and bright-surge are general
// glow-participation / animation markers used on any element that carries a
// glow target — they are intentionally NOT restricted to CardComponents.tsx.
const SPINE_STRINGS = ["card-accent-spine"];

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
  it("card-accent-spine appears only in CardComponents.tsx, nowhere else in src/", () => {
    const files = walk(SRC).filter(
      (f) =>
        !CANONICAL_FILES.has(f) &&
        !f.includes("/test/") &&
        !f.includes("/invariants/"),
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
