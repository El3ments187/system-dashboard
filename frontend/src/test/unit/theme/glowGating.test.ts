import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const raw = readFileSync(
  resolve(__dirname, "../../../styles/theme.css"),
  "utf-8",
);
const css = raw.replace(/\s+/g, " ");

function getStandaloneBlock(selector: string): string | null {
  const start = raw.indexOf("\n" + selector + " {");
  if (start === -1) return null;
  const end = raw.indexOf("}", start);
  return end === -1 ? null : raw.slice(start, end + 1);
}

describe('Neon Glow gating — decorative glows must be behind [data-glow="neon"]', () => {
  describe(".btn-accent:hover", () => {
    it("standalone rule does not contain --accent-glow (or does not exist)", () => {
      const block = getStandaloneBlock(".btn-accent:hover");
      if (block !== null) {
        expect(block).not.toContain("--accent-glow");
      }
    });

    it("gated rule exists in normalized CSS", () => {
      expect(css).toContain('[data-glow="neon"] .btn-accent:hover');
    });
  });

  describe(".color-swatch.active", () => {
    it("standalone rule does not contain --accent-glow (or does not exist)", () => {
      const block = getStandaloneBlock(".color-swatch.active");
      if (block !== null) {
        expect(block).not.toContain("--accent-glow");
      }
    });

    it("gated rule exists in normalized CSS", () => {
      expect(css).toContain('[data-glow="neon"] .color-swatch.active');
    });
  });

  describe(".settings-btn-accent:hover:not(:disabled)", () => {
    it("standalone rule does not contain --accent-glow (or does not exist)", () => {
      const block = getStandaloneBlock(
        ".settings-btn-accent:hover:not(:disabled)",
      );
      if (block !== null) {
        expect(block).not.toContain("--accent-glow");
      }
    });

    it("gated rule exists in normalized CSS", () => {
      expect(css).toContain(
        '[data-glow="neon"] .settings-btn-accent:hover:not(:disabled)',
      );
    });
  });

  describe(".accent-text-glow", () => {
    it("gated rule exists in normalized CSS", () => {
      expect(css).toContain('[data-glow="neon"] .accent-text-glow');
    });
  });

  describe("focus ring exception", () => {
    it(".settings-input:focus retains its zero-blur accessibility ring (ungated)", () => {
      const block = getStandaloneBlock(".settings-input:focus");
      expect(block).not.toBeNull();
      expect(block).toContain("0 0 0 3px var(--accent-glow)");
    });
  });
});
