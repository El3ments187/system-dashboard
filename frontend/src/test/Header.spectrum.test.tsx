import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import Header from "../components/Header";

// Header pulls three contexts and a fetch hook — mock all four so this
// test exercises ONLY the nav markup it exists to guard.
vi.mock("../context/MetricsContext", () => ({
  useMetricsContext: () => ({ systemMetrics: null }),
}));
vi.mock("../context/LiveDataControlsContext", () => ({
  useLiveDataControlsContext: () => ({ isPaused: false, toggle: () => {} }),
}));
vi.mock("../context/AlertsContext", () => ({
  useAlertsContext: () => ({
    addAlert: () => {},
    alerts: [],
    clearAlerts: () => {},
  }),
  AlertSeverity: { Info: "info", Warning: "warning", Error: "error" },
}));
vi.mock("../hooks/useFetchAlerts", () => ({
  useFetchAlerts: () => ({ alerts: [], refetch: () => {} }),
}));

const PAGES = [
  "Overview",
  "GPU",
  "CPU",
  "llama.cpp",
  "AI",
  "Settings",
  "Theme",
];

describe("Header nav participates in per-element accent distribution", () => {
  it("EVERY page name carries data-accent-el, not just the active one (user-reported)", () => {
    // User screenshots (Spectrum Per-Element mode): all page names in the
    // header rendered the SAME color. Root cause: only the ACTIVE button
    // carried data-accent-el, so the other six never received an
    // --el-index — and under spectrum/rainbow-wave the per-element hue is
    // DERIVED from that index. No index, no distribution: six of seven
    // names sat outside the system entirely. Every button must
    // participate so the indexer hands each its own hue slot.
    render(
      <Header
        accent={{ color: "#ff0000", glow: "#ff000080" }}
        activePage="theme"
      />,
    );
    for (const label of PAGES) {
      const btn = screen.getByText(label).closest("button");
      expect(btn, `${label}: nav button not found`).toBeTruthy();
      expect(
        btn!.hasAttribute("data-accent-el"),
        `${label} is missing data-accent-el — it will not receive an --el-index and cannot take a spectrum/rainbow hue`,
      ).toBe(true);
    }
  });

  it("spectrum and rainbow-wave modes color nav names via the per-element accent (CSS source guard)", () => {
    // The attribute above puts each button INTO the index; this pins the
    // other half — the CSS that actually applies the per-element color to
    // nav text in the two distributing modes. Source-level guard (same
    // precedent as the accent-divider guard): jsdom cannot compute
    // oklch()/var() chains, so asserting rendered color here would be
    // vacuously green; the deterministic signal is the rule existing.
    const css = fs.readFileSync(
      path.resolve(__dirname, "../styles/variables.css"),
      "utf-8",
    );
    for (const mode of ["spectrum", "rainbow-wave"]) {
      expect(
        css.includes(`[data-accent-mode="${mode}"] .dash-nav-btn`),
        `variables.css is missing the ${mode} nav-name color rule`,
      ).toBe(true);
    }
  });
});
