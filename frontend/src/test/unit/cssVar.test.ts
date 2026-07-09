// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readCssVar } from "../../utils/cssVar";

describe("readCssVar", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--test-cssvar-x");
  });

  it("returns the trimmed value of a set CSS custom property", () => {
    document.documentElement.style.setProperty("--test-cssvar-x", "  #abc  ");
    expect(readCssVar("--test-cssvar-x")).toBe("#abc");
  });

  it("returns empty string for an unset property", () => {
    expect(readCssVar("--test-cssvar-unset-prop-xyz")).toBe("");
  });
});
