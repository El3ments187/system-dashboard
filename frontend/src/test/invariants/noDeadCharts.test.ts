import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");

const DELETED_MODULES = [
  "charts/CpuChart.tsx",
  "charts/GpuChart.tsx",
  "charts/MemoryChart.tsx",
  "charts/PerCoreCpuChart.tsx",
  "charts/StorageHistoryChart.tsx",
  "charts/ThroughputChart.tsx",
  "components/shared/ChartCard.tsx",
  "components/shared/MetricCard.tsx",
  "hooks/usePanelWithErrorHandling.ts",
];

describe("noDeadCharts invariant", () => {
  for (const mod of DELETED_MODULES) {
    it(`deleted module does not exist: src/${mod}`, () => {
      expect(fs.existsSync(path.join(SRC, mod))).toBe(false);
    });
  }

  it("no src/ file imports any deleted module by name", () => {
    const deletedNames = [
      "CpuChart",
      "GpuChart",
      "MemoryChart",
      "PerCoreCpuChart",
      "StorageHistoryChart",
      "ThroughputChart",
      "ChartCard",
      "MetricCard",
      "usePanelWithErrorHandling",
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

    const files = walk(SRC).filter(
      (f) => !f.includes("/test/") && !f.includes("/invariants/"),
    );

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const name of deletedNames) {
        if (
          new RegExp(`from ['"].*${name}['"]`).test(content) ||
          new RegExp(`import\\s+${name}`).test(content)
        ) {
          violations.push(`${path.relative(SRC, file)} imports ${name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
