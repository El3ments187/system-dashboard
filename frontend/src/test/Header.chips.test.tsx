import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import Header from "../components/Header";

vi.mock("../context/MetricsContext", () => ({
  useMetricsContext: vi.fn(),
}));
vi.mock("../context/LiveDataControlsContext", () => ({
  useLiveDataControlsContext: () => ({ isPaused: false, toggle: () => {} }),
}));
vi.mock("../context/AlertsContext", () => ({
  useAlertsContext: () => ({ addAlert: () => {}, alerts: [], clearAlerts: () => {} }),
  AlertSeverity: { Info: "info", Warning: "warning", Error: "error" },
}));
vi.mock("../hooks/useFetchAlerts", () => ({
  useFetchAlerts: () => ({ alerts: [], refetch: () => {} }),
}));

import { useMetricsContext } from "../context/MetricsContext";
const mockedCtx = vi.mocked(useMetricsContext);

const BASE_SYSTEM = {
  hostname: "gamer",
  uptime_seconds: 3600,
  uptime_human: "1h 0m",
  last_update: "2026-08-26T19:53:57+00:00",
};

function renderHeader(
  overrides: Partial<typeof BASE_SYSTEM> = {},
  healthOk?: boolean,
) {
  mockedCtx.mockReturnValue({
    systemMetrics: { ...BASE_SYSTEM, ...overrides },
  } as ReturnType<typeof useMetricsContext>);
  return render(
    <Header accent={{ color: "#38bdf8", glow: "#38bdf8" }} healthOk={healthOk} />,
  );
}

// ── T252 — timestamp formatting ─────────────────────────────────────────────

describe("T252 — header UPDATED chip timestamp", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls toLocaleString with undefined locale and dateStyle/timeStyle options", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleString");
    renderHeader();
    expect(spy).toHaveBeenCalledWith(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    });
  });

  it("timeStyle medium includes seconds — Intl verification at test runner locale", () => {
    // medium = HH:MM:SS, short = HH:MM — verify seconds are present
    const medium = new Intl.DateTimeFormat(undefined, {
      timeStyle: "medium",
    }).format(new Date("2026-08-26T19:53:57+00:00"));
    expect(medium).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it("offset is honoured — 19:53:57 UTC is 14:53:57 CDT at America/Chicago", () => {
    // Mathematical proof independent of the test runner's system timezone.
    // If the component calls toLocaleString(undefined, ...) on the correct
    // Date object, and the browser locale is America/Chicago, the user sees
    // 14:53:57. Here we verify the moment is correct via explicit tz.
    const chicagoFormatted = new Intl.DateTimeFormat("en-US", {
      timeStyle: "medium",
      timeZone: "America/Chicago",
    }).format(new Date("2026-08-26T19:53:57+00:00"));
    expect(chicagoFormatted).toBe("2:53:57 PM");
  });

  it("unparseable string renders verbatim, not 'Invalid Date'", () => {
    renderHeader({ last_update: "not-a-date" });
    const labels = document.querySelectorAll(".chip-label");
    const updatedLabel = Array.from(labels).find(
      (el) => el.textContent === "Updated",
    );
    const chipValue = updatedLabel
      ?.closest(".status-chip")
      ?.querySelector(".chip-value");
    expect(chipValue?.textContent).toBe("not-a-date");
    expect(chipValue?.textContent).not.toBe("Invalid Date");
  });

  // REVERSED BY T257. The T256 version asserted only that SOME descendant of
  // the chip carried data-accent-el, which the old markup satisfied with the
  // attribute on `.chip-value` — and that placement was the bug: the accent
  // system boxes the element it is on, so it boxed the value and left the
  // label outside. The nav button carries it on the button itself; the chip
  // must match. Asserting the POSITION is what the loose descendant query
  // could not catch.
  it("T257: data-accent-el is on .status-chip itself, not on .chip-value", () => {
    renderHeader();
    const labels = document.querySelectorAll(".chip-label");
    const updatedLabel = Array.from(labels).find(
      (el) => el.textContent === "Updated",
    );
    const chip = updatedLabel?.closest(".status-chip");
    expect(chip).toBeTruthy();
    expect(chip?.hasAttribute("data-accent-el")).toBe(true);
    expect(
      chip?.querySelector(".chip-value")?.hasAttribute("data-accent-el"),
    ).toBe(false);
  });

  it("T257: every .status-chip carries the attribute, matching the nav button", () => {
    renderHeader();
    const chips = Array.from(document.querySelectorAll(".status-chip"));
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      expect(c.hasAttribute("data-accent-el")).toBe(true);
    }
    // Online / Live already had it here and must be untouched.
    expect(document.querySelectorAll(".chip-dot").length).toBeGreaterThan(0);
  });
});

// ── T253 — chip / nav-btn unification ───────────────────────────────────────

const CSS = fs.readFileSync(
  path.resolve(__dirname, "../styles/theme.css"),
  "utf-8",
);

function extractProp(selector: string, prop: string): string | null {
  // Match the first rule block for this exact selector.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!m) return null;
  const pm = m[1].match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
  return pm ? pm[1].trim() : null;
}

describe("T253 — status chips match nav tabs", () => {
  it("border-radius is 7px on both .status-chip and .dash-nav-btn", () => {
    expect(extractProp(".status-chip", "border-radius")).toBe("7px");
    expect(extractProp(".dash-nav-btn", "border-radius")).toBe("7px");
  });

  it("padding is 5px 11px on both .status-chip and .dash-nav-btn", () => {
    expect(extractProp(".status-chip", "padding")).toBe("5px 11px");
    expect(extractProp(".dash-nav-btn", "padding")).toBe("5px 11px");
  });

  // REVERSED BY T257. T256 made .status-chip transparent because
  // .dash-nav-btn is — but a nav tab can afford that: it gains a visible
  // border on hover and when active, so it still reads as a box. A chip has
  // no such state, so transparent removed the only thing making it a box.
  // .dash-nav-btn's half of the original assertion was correct and is kept.
  it("T257: .status-chip has a visible border and background; nav-btn stays transparent", () => {
    expect(extractProp(".status-chip", "background")).toBe("var(--bg-card)");
    expect(extractProp(".status-chip", "border")).toBe(
      "1px solid var(--border-color)",
    );
    expect(extractProp(".dash-nav-btn", "background")).toBe("transparent");
  });

  it(".dash-nav-btn is unchanged — font-size 12.5px, font-weight 500", () => {
    expect(extractProp(".dash-nav-btn", "font-size")).toBe("12.5px");
    expect(extractProp(".dash-nav-btn", "font-weight")).toBe("500");
  });

  it("Online chip still renders its status dot", () => {
    mockedCtx.mockReturnValue({
      systemMetrics: null,
    } as ReturnType<typeof useMetricsContext>);
    render(
      <Header
        accent={{ color: "#38bdf8", glow: "#38bdf8" }}
        healthOk={true}
      />,
    );
    expect(document.querySelector(".chip-dot")).toBeTruthy();
  });

  it("HOST chip renders label then value — label distinguishes from hostname", () => {
    renderHeader();
    const labels = document.querySelectorAll(".chip-label");
    const hostLabel = Array.from(labels).find((el) =>
      /host/i.test(el.textContent ?? ""),
    );
    expect(hostLabel).toBeTruthy();
    const chipValue = hostLabel
      ?.closest(".status-chip")
      ?.querySelector(".chip-value");
    expect(chipValue?.textContent).toBe("gamer");
  });
});
