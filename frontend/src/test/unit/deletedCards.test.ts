import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// These card components were deleted because they are unused in production.
// This test prevents them from being silently re-created.
const CARDS_DIR = resolve(
  __dirname,
  "../../components/cards",
);

const DELETED_CARDS = [
  "CpuCard.tsx",
  "GpuCard.tsx",
  "MemoryCard.tsx",
  "StorageCard.tsx",
  "StorageSummaryCard.tsx",
  "StoragePerformanceCard.tsx",
  "LlamaCppCard.tsx",
];

describe("deleted card components", () => {
  for (const filename of DELETED_CARDS) {
    it(`${filename} does not exist (unused, deleted in Issue D)`, () => {
      expect(existsSync(resolve(CARDS_DIR, filename))).toBe(false);
    });
  }

  it("only AI service cards remain in the cards directory", () => {
    const { readdirSync } = require("node:fs");
    const remaining = readdirSync(CARDS_DIR) as string[];
    const unexpected = remaining.filter(
      (f: string) => !["ComfyUICard.tsx", "OpenCodeCard.tsx", "OpenWebUICard.tsx"].includes(f),
    );
    expect(unexpected).toEqual([]);
  });
});
