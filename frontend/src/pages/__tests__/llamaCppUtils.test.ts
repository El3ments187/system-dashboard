import { describe, it, expect } from "vitest";
import {
  extractQuant,
  formatCtx,
  formatGB,
  formatTps,
  specLabel,
  fmtUptime,
  fmtKb,
  fmtLatency,
  calcBuildsBehind,
} from "../llamaCppUtils";

// ─── extractQuant ──────────────────────────────────────────────────────────────

describe("extractQuant", () => {
  it("extracts Q3_K_L from end of filename", () => {
    expect(
      extractQuant("Qwen3.6-35B-A3B-REAM-192-heretic-APEX-ICompact-Q3_K_L"),
    ).toBe("Q3_K_L");
  });

  it("extracts Q3_K_M from mid-filename (delimiter before token)", () => {
    expect(extractQuant("Qwen3.6-35B-A3B-UD-Q3_K_M-REAP-RangerX")).toBe(
      "Q3_K_M",
    );
  });

  it("extracts Q4_K_XL", () => {
    expect(extractQuant("gemma-4-26B-A4B-it-qat-UD-Q4_K_XL")).toBe("Q4_K_XL");
  });

  it("extracts Q4_K_M", () => {
    expect(
      extractQuant("Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M"),
    ).toBe("Q4_K_M");
  });

  it("extracts IQ4_XS", () => {
    expect(extractQuant("some-model-IQ4_XS")).toBe("IQ4_XS");
  });

  it("extracts BF16", () => {
    expect(extractQuant("some-model-BF16")).toBe("BF16");
  });

  it("extracts F16", () => {
    expect(extractQuant("some-model-F16")).toBe("F16");
  });

  it("returns empty string when no quant token found", () => {
    expect(extractQuant("some-model-no-quant")).toBe("");
  });

  it("does not match A3B as a quant", () => {
    expect(extractQuant("Qwen3.6-35B-A3B")).toBe("");
  });

  it("does not match UD as a quant", () => {
    expect(extractQuant("some-model-UD-suffix")).toBe("");
  });

  it("returns longest match when multiple quant tokens present", () => {
    const result = extractQuant("model-Q3_K_M-stuff-Q4_K_XL");
    expect(result).toBe("Q4_K_XL");
  });
});

// ─── formatCtx ────────────────────────────────────────────────────────────────

describe("formatCtx", () => {
  it("formats 131072 as 128K", () => {
    expect(formatCtx(131072)).toBe("128K");
  });

  it("formats 32768 as 32K", () => {
    expect(formatCtx(32768)).toBe("32K");
  });

  it("formats 4096 as 4K", () => {
    expect(formatCtx(4096)).toBe("4K");
  });

  it("returns em-dash for null", () => {
    expect(formatCtx(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatCtx(undefined)).toBe("—");
  });

  it("returns em-dash for 0", () => {
    expect(formatCtx(0)).toBe("—");
  });
});

// ─── formatGB ────────────────────────────────────────────────────────────────

describe("formatGB", () => {
  it("formats 13619.2 MB as 13.3 GB", () => {
    expect(formatGB(13619.2)).toBe("13.3 GB");
  });

  it("formats 1024 MB as 1.0 GB", () => {
    expect(formatGB(1024)).toBe("1.0 GB");
  });

  it("formats 7372.8 MB as 7.2 GB", () => {
    expect(formatGB(7372.8)).toBe("7.2 GB");
  });

  it("returns em-dash for null", () => {
    expect(formatGB(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatGB(undefined)).toBe("—");
  });
});

// ─── formatTps ───────────────────────────────────────────────────────────────

describe("formatTps", () => {
  it("rounds 153.4 to 153", () => {
    expect(formatTps(153.4)).toBe("153");
  });

  it("rounds 182.6 to 183", () => {
    expect(formatTps(182.6)).toBe("183");
  });

  it("handles 0", () => {
    expect(formatTps(0)).toBe("0");
  });

  it("returns em-dash for null", () => {
    expect(formatTps(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatTps(undefined)).toBe("—");
  });
});

// ─── specLabel ───────────────────────────────────────────────────────────────

describe("specLabel", () => {
  it('returns "Draft" for "draft"', () => {
    expect(specLabel("draft")).toBe("Draft");
  });

  it('returns "MTP" for "draft-mtp"', () => {
    expect(specLabel("draft-mtp")).toBe("MTP");
  });

  it('returns "EAGLE" for "eagle"', () => {
    expect(specLabel("eagle")).toBe("EAGLE");
  });

  it('returns "EAGLE-3" for "eagle3"', () => {
    expect(specLabel("eagle3")).toBe("EAGLE-3");
  });

  it('returns "None" for null', () => {
    expect(specLabel(null)).toBe("None");
  });

  it('returns "None" for undefined', () => {
    expect(specLabel(undefined)).toBe("None");
  });

  it('returns "None" for empty string', () => {
    expect(specLabel("")).toBe("None");
  });

  it('returns "Other" for unknown spec type', () => {
    expect(specLabel("unknown-spec")).toBe("Other");
  });
});

// ─── fmtUptime ───────────────────────────────────────────────────────────────

describe("fmtUptime", () => {
  it("formats 30s as 30s", () => {
    expect(fmtUptime(30)).toBe("30s");
  });

  it('formats 90s as "1m 30s"', () => {
    expect(fmtUptime(90)).toBe("1m 30s");
  });

  it('formats 3661s as "1h 1m"', () => {
    expect(fmtUptime(3661)).toBe("1h 1m");
  });

  it('formats 8424s (from live data) as "2h 20m"', () => {
    expect(fmtUptime(8424)).toBe("2h 20m");
  });

  it('formats 0s as "0s"', () => {
    expect(fmtUptime(0)).toBe("0s");
  });

  it("returns em-dash for null", () => {
    expect(fmtUptime(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtUptime(undefined)).toBe("—");
  });
});

// ─── fmtKb ──────────────────────────────────────────────────────────────────

describe("fmtKb", () => {
  it('formats 500 KB as "500 KB"', () => {
    expect(fmtKb(500)).toBe("500 KB");
  });

  it("formats 941372 KB as MB value (< 1 GB)", () => {
    expect(fmtKb(941372)).toBe("919.3 MB");
  });

  it('formats 2048 KB as "2.0 MB"', () => {
    expect(fmtKb(2048)).toBe("2.0 MB");
  });

  it('formats 1024 * 1024 KB as "1.00 GB"', () => {
    expect(fmtKb(1024 * 1024)).toBe("1.00 GB");
  });

  it("returns em-dash for null", () => {
    expect(fmtKb(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtKb(undefined)).toBe("—");
  });
});

// ─── fmtLatency ──────────────────────────────────────────────────────────────

describe("fmtLatency", () => {
  it('formats 808ms as "808ms"', () => {
    expect(fmtLatency(808)).toBe("808ms");
  });

  it('formats 1500ms as "1.5s"', () => {
    expect(fmtLatency(1500)).toBe("1.5s");
  });

  it('formats 999ms as "999ms"', () => {
    expect(fmtLatency(999)).toBe("999ms");
  });

  it('formats 1000ms as "1.0s"', () => {
    expect(fmtLatency(1000)).toBe("1.0s");
  });

  it("returns em-dash for null", () => {
    expect(fmtLatency(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtLatency(undefined)).toBe("—");
  });
});

// ─── calcBuildsBehind ────────────────────────────────────────────────────────

describe("calcBuildsBehind", () => {
  it("returns 18 when local is b9833 and latest is b9851", () => {
    expect(calcBuildsBehind("b9833", "b9851")).toBe(18);
  });

  it("returns 0 when local equals latest", () => {
    expect(calcBuildsBehind("b9851", "b9851")).toBe(0);
  });

  it("returns 0 when local is ahead of latest", () => {
    expect(calcBuildsBehind("b9900", "b9851")).toBe(0);
  });

  it("returns null when local is null", () => {
    expect(calcBuildsBehind(null, "b9851")).toBeNull();
  });

  it("returns null when latest is null", () => {
    expect(calcBuildsBehind("b9833", null)).toBeNull();
  });

  it("returns null when both are null", () => {
    expect(calcBuildsBehind(null, null)).toBeNull();
  });

  it('handles build strings without "b" prefix', () => {
    expect(calcBuildsBehind("9833", "9851")).toBe(18);
  });

  it("handles build strings with commit hash suffix", () => {
    expect(calcBuildsBehind("b9833-c818263f2", "b9851")).toBe(18);
  });
});
