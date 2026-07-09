import { describe, it, expect, beforeEach } from "vitest";
import {
  useTheme,
  ACCENT_THEMES,
  ACCENT_MODES,
  ACCENT_COLORS,
} from "../../../hooks/useTheme";

describe("useTheme - exports", () => {
  it("exports ACCENT_THEMES as non-empty array", () => {
    expect(Array.isArray(ACCENT_THEMES)).toBe(true);
    expect(ACCENT_THEMES.length).toBeGreaterThan(10);
  });

  it("exports ACCENT_MODES with expected modes", () => {
    const modeIds = ACCENT_MODES.map((m) => m.id);
    expect(modeIds).toContain("solid");
    expect(modeIds).toContain("sheen");
    expect(modeIds).toContain("rainbow-wave");
    expect(modeIds).toContain("spectrum");
  });

  it("ACCENT_COLORS maps each accent theme", () => {
    for (const theme of ACCENT_THEMES) {
      expect(ACCENT_COLORS[theme.id]).toBeDefined();
      expect(ACCENT_COLORS[theme.id].color).toBe(theme.color);
    }
  });
});

describe("useTheme - defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults accent to blue when not set", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    const { result, unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(result.current.accent).toBe("blue");
    unmount();
    document.body.removeChild(root);
  });

  it("defaults accentMode to solid when not set", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    const { result, unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(result.current.accentMode).toBe("solid");
    unmount();
    document.body.removeChild(root);
  });
});

describe("useTheme - data-glow-color attribute (Fix D)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-glow-color");
  });

  it("sets data-glow-color='match' when glowColor is match (default)", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(document.documentElement.getAttribute("data-glow-color")).toBe("match");
    unmount();
    document.body.removeChild(root);
  });

  it("sets data-glow-color='accent' when glowColor is accent", () => {
    localStorage.setItem("dashboard-glow-color", "accent");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(document.documentElement.getAttribute("data-glow-color")).toBe("accent");
    unmount();
    document.body.removeChild(root);
  });

  it("sets data-glow-color='custom' when glowColor is custom", () => {
    localStorage.setItem("dashboard-glow-color", "custom");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(document.documentElement.getAttribute("data-glow-color")).toBe("custom");
    unmount();
    document.body.removeChild(root);
  });
});

describe("useTheme - accent mode migration", () => {
  it('migrates legacy "gradient" to "sheen"', () => {
    localStorage.setItem("dashboard-accent-mode", "gradient");
    const root = document.createElement("div");
    document.body.appendChild(root);

    const { result, unmount } = require("@testing-library/react").renderHook(
      () => useTheme(),
    );
    expect(result.current.accentMode).toBe("sheen");
    unmount();
    document.body.removeChild(root);
  });
});
