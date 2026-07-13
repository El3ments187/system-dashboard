// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThresholdColors } from "../../utils/accentColors";

describe("useThresholdColors", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--danger");
    document.documentElement.style.removeProperty("--warning");
  });

  it("returns empty strings when CSS vars are not set", () => {
    const { result } = renderHook(() => useThresholdColors());
    expect(result.current.danger).toBe("");
    expect(result.current.warning).toBe("");
  });

  it("returns the set CSS var values", () => {
    document.documentElement.style.setProperty("--danger", "#ff0000");
    document.documentElement.style.setProperty("--warning", "#ffaa00");
    const { result } = renderHook(() => useThresholdColors());
    expect(result.current.danger).toBe("#ff0000");
    expect(result.current.warning).toBe("#ffaa00");
  });

  it("returns an object with danger and warning keys", () => {
    const { result } = renderHook(() => useThresholdColors());
    expect(result.current).toHaveProperty("danger");
    expect(result.current).toHaveProperty("warning");
  });
});
