import { useEffect, useState, type DependencyList } from "react";
import { ACCENT_THEMES } from "../hooks/useTheme";

/** Full 32-color palette used by Spectrum Per-Element mode. */
const SPECTRUM = ACCENT_THEMES.map((t) => t.color);

/** Attributes that affect resolved accent colors — pass to MutationObserver's attributeFilter. */
export const ACCENT_OBSERVER_ATTRS = [
  "data-bg",
  "data-accent",
  "data-accent-mode",
];

/** Modes whose colors shift over time and so need more than a one-shot resolve. */
const ANIMATED_MODES = new Set(["sheen", "flow", "rainbow-wave"]);

export function getAccentMode(): string {
  return document.documentElement.getAttribute("data-accent-mode") || "solid";
}

/**
 * Single entry point every chart uses to stay in sync with the theme engine — replaces the
 * previous copy-pasted MutationObserver boilerplate in each chart file. Calls `callback`
 * immediately, whenever accent/background/mode attributes change (instant propagation), and
 * on a lightweight interval while an animated mode (Animated Gradient / Rainbow Wave) is
 * active, so charts visibly participate in the animation without per-frame re-renders.
 */
export function useAccentSync(
  callback: () => void,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    callback();
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ACCENT_OBSERVER_ATTRS,
    });
    const interval = window.setInterval(() => {
      if (ANIMATED_MODES.has(getAccentMode())) callback();
    }, 800);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * --accent-secondary (and other derived tokens) are defined as CSS functions like
 * `color-mix(in srgb, ...)`. getComputedStyle() does NOT resolve custom properties to a
 * concrete color the way it resolves real color properties — it hands back the literal
 * function text. Any caller that alpha-suffixes a color string (`${color}20`) silently
 * produces invalid CSS (`color-mix(...)20`), which paints as black/transparent. Resolving
 * through a throwaway element's `color` property forces the browser to compute the real
 * `rgb()` value, so every color this module returns is a plain, safely-suffixable hex string.
 */
let probeEl: HTMLElement | null = null;

function ensureProbeEl(): HTMLElement {
  if (!probeEl) {
    probeEl = document.createElement("div");
    probeEl.style.display = "none";
    document.body.appendChild(probeEl);
  }
  return probeEl;
}

let probeCanvas: HTMLCanvasElement | null = null;
let probeCtx: CanvasRenderingContext2D | null = null;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (!probeCanvas) {
    probeCanvas = document.createElement("canvas");
    probeCanvas.width = probeCanvas.height = 1;
    probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
  }
  return probeCtx;
}

function toHex(colorValue: string): string {
  if (!colorValue) return "";
  if (/^#[0-9a-f]{6}$/i.test(colorValue)) return colorValue.toLowerCase();
  if (typeof document === "undefined") return "";
  const el = ensureProbeEl();
  // jsdom does not resolve var() references when computing standard CSS property
  // values (getComputedStyle(el).color with `color: var(--x)` returns "" instead
  // of the resolved color). Read the custom property value directly and recurse.
  const varMatch = colorValue.match(/^var\(--([\w-]+)(?:,.*?)?\)$/);
  if (varMatch) {
    const raw = getComputedStyle(el)
      .getPropertyValue(`--${varMatch[1]}`)
      .trim();
    if (raw) return toHex(raw);
    return "";
  }
  el.style.color = colorValue;
  const resolved = getComputedStyle(el).color;
  if (!resolved || resolved === colorValue) return "";
  // Convert via canvas — handles rgb(), oklch(), lab(), color() uniformly.
  // Chrome returns oklch() strings for oklch-defined colors instead of rgb(),
  // so string-parsing the channel values gives wrong results; canvas always
  // renders to sRGB bytes regardless of the input color space.
  const ctx = ensureCanvas();
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] > 0) {
      const toByte = (v: number) => v.toString(16).padStart(2, "0");
      return `#${toByte(d[0])}${toByte(d[1])}${toByte(d[2])}`;
    }
  }
  // Fallback: parse rgb(r, g, b) string (0-255 channels).
  const m = resolved.match(/[\d.]+/g);
  if (!m) return "";
  const scale = resolved.startsWith("color(") ? 255 : 1;
  const [r, g, b] = m.slice(0, 3).map((v) => Math.round(parseFloat(v) * scale));
  const toByte = (v: number) =>
    Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s * 100, l * 100];
}

/**
 * Allowed hue ranges once the semantic bands (danger/warning/success, see above) are carved
 * out of the 360° wheel — danger (340-20) + warning (20-58) merge into one contiguous excluded
 * arc, leaving [58,122] and [162,340] open. `avoidSemanticHues` is fine for nudging a *single*
 * hue, but generating N evenly-spaced hues and then nudging each one collapses any hue that
 * lands inside a band onto one of only two boundary values — for N as small as ~8 this produces
 * duplicate colors. `spreadHues` instead distributes hues directly within the allowed arcs, so
 * every generated hue is unique by construction regardless of N.
 */
const ALLOWED_HUE_SEGMENTS: Array<[number, number]> = [
  [58, 122],
  [162, 340],
];
const ALLOWED_HUE_TOTAL = ALLOWED_HUE_SEGMENTS.reduce(
  (sum, [start, end]) => sum + (end - start),
  0,
);

function mapFractionToAllowedHue(fraction: number): number {
  let offset = (((fraction % 1) + 1) % 1) * ALLOWED_HUE_TOTAL;
  for (const [start, end] of ALLOWED_HUE_SEGMENTS) {
    const width = end - start;
    if (offset <= width) return start + offset;
    offset -= width;
  }
  return ALLOWED_HUE_SEGMENTS[0][0];
}

function hueToAllowedFraction(hue: number): number {
  const h = ((hue % 360) + 360) % 360;
  let acc = 0;
  for (const [start, end] of ALLOWED_HUE_SEGMENTS) {
    const width = end - start;
    if (h >= start && h <= end) return (acc + (h - start)) / ALLOWED_HUE_TOTAL;
    acc += width;
  }
  // h falls inside an excluded band — snap forward to the next allowed segment's start.
  for (const [start] of ALLOWED_HUE_SEGMENTS) {
    if (h < start) return hueToAllowedFraction(start);
  }
  return 0;
}

/** Distributes `n` hues evenly across the allowed (non-semantic) hue space, starting near `startHue`. */
function spreadHues(startHue: number, n: number): number[] {
  const baseFraction = hueToAllowedFraction(startHue);
  return Array.from({ length: n }, (_, i) =>
    mapFractionToAllowedHue(baseFraction + i / n),
  );
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toByte = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/**
 * The single dash pattern used for every "secondary" line on a two-series chart, dashboard-
 * wide. Centralized so a chart can never accidentally ship a different pattern (or a solid
 * line) for what's supposed to be the secondary series.
 */
export const SECONDARY_LINE_DASH = "6 4";

/**
 * Derives the dual-line chart's secondary color from its primary: same hue and saturation,
 * shifted lightness so the two are clearly distinguishable while staying visibly "the same
 * accent family" — e.g. Turquoise primary -> a darker/lighter turquoise secondary, never an
 * unrelated hue. Shifts away from the midpoint (lighten if already on the dark side, darken
 * if already on the light side) so the result reads as a deliberate variant at any starting
 * lightness, including very dark or very light accents.
 */
export function getSecondarySeriesColor(primaryHex: string): string {
  const hex = toHex(primaryHex) || primaryHex;
  const [h, s, l] = hexToHsl(hex);
  const targetL = l > 55 ? Math.max(15, l - 25) : Math.min(85, l + 25);
  return hslToHex(h, s, targetL);
}

function spectrumColors(n: number): string[] {
  const probe = ensureProbeEl();
  const rootCs = getComputedStyle(document.documentElement);
  const fxSpread =
    parseFloat(rootCs.getPropertyValue("--fx-spread").trim()) || 34;
  return Array.from({ length: n }, (_, i) => {
    probe.style.setProperty(
      "--accent-primary",
      `oklch(from var(--accent-base) l c calc(h + ${i * fxSpread}))`,
    );
    const resolved = toHex("var(--accent-primary)");
    return /^#[0-9a-f]{6}$/i.test(resolved)
      ? resolved
      : SPECTRUM[i % SPECTRUM.length];
  });
}

function rainbowColors(n: number, cs: CSSStyleDeclaration): string[] {
  const spin = parseFloat(cs.getPropertyValue("--accent-spin").trim()) || 0;
  const accentHex = toHex("var(--accent-base)") || "#3b82f6";
  const [accentH, , accentL] = hexToHsl(accentHex);
  let lit = accentL;
  if (accentL > 60) {
    lit = accentL - 10;
  } else if (accentL < 40) {
    lit = accentL + 10;
  }
  return spreadHues(accentH + spin, n).map((hue) => hslToHex(hue, 80, lit));
}

/** Resolves the single "primary" series color for the active mode, ignoring count entirely. */
function resolvePrimaryModeColor(mode: string): string {
  if (mode === "spectrum") {
    return toHex("var(--accent-primary)") || SPECTRUM[0];
  }
  return toHex("var(--accent-primary)") || "#6366f1";
}

/**
 * Resolve `count` distinct colors for chart series / per-element lists according to the
 * currently active accent mode. Components call this instead of reading --accent-primary
 * directly, so any future accent-colored component automatically supports all modes.
 *
 * `perCoreExemption` must be passed as `true` ONLY by the CPU per-core utilization chart
 * (CoreBars) — per spec, that is the *one* component required to ignore the selected accent
 * in Solid mode and always use the fixed 32-color palette. Every other multi-series consumer
 * with n > 2 must keep participating in the live accent like any other Solid-mode element.
 */
export function resolveAccentColors(
  count: number,
  perCoreExemption = false,
  contextEl?: Element | null,
): string[] {
  const n = Math.max(1, count);
  const mode = getAccentMode();

  // Propagate --el-index from the DOM context so --accent-primary resolves with the
  // right per-element hue offset in Rainbow Wave / Spectrum modes. Without this,
  // getComputedStyle(documentElement) always sees el-index=0 (the registered initial
  // value) regardless of where on the page the chart is actually rendered.
  const probe = ensureProbeEl();
  if (contextEl) {
    const rawIndex = getComputedStyle(contextEl)
      .getPropertyValue("--el-index")
      .trim();
    const index = parseFloat(rawIndex) || 0;
    probe.style.setProperty("--el-index", String(index));
    // Chrome evaluates the entire custom-property chain at the html element and
    // inherits already-substituted values, so setting --el-index on the probe has
    // no downstream effect. For per-element-hue modes we set --accent-primary (and
    // fill counterparts) directly using relative-color-syntax so the accent base hue
    // is preserved and only the hue offset changes per element.
    const rootCs = getComputedStyle(document.documentElement);
    const spread =
      parseFloat(rootCs.getPropertyValue("--fx-spread").trim()) || 34;
    const depth =
      parseFloat(rootCs.getPropertyValue("--fx-depth").trim()) || 30;
    const spin =
      parseFloat(rootCs.getPropertyValue("--accent-spin").trim()) || 0;
    const elOff = spin + index * spread;
    probe.style.setProperty("--el-off", String(elOff));
    if (mode === "spectrum" || mode === "rainbow-wave") {
      probe.style.setProperty(
        "--accent-primary",
        `oklch(from var(--accent-base) l c calc(h + ${elOff}))`,
      );
      probe.style.setProperty(
        "--accent-fill-stop-1",
        `oklch(from var(--accent-base) l c calc(h + ${elOff}))`,
      );
      probe.style.setProperty(
        "--accent-fill-stop-2",
        `oklch(from var(--accent-base) l c calc(h + ${elOff + depth}))`,
      );
    } else {
      probe.style.removeProperty("--accent-primary");
      probe.style.removeProperty("--accent-fill-stop-1");
      probe.style.removeProperty("--accent-fill-stop-2");
    }
  } else {
    probe.style.removeProperty("--el-index");
    probe.style.removeProperty("--el-off");
    probe.style.removeProperty("--accent-primary");
    probe.style.removeProperty("--accent-fill-stop-1");
    probe.style.removeProperty("--accent-fill-stop-2");
  }
  const cs = getComputedStyle(probe);

  // Spectrum always uses its fixed palette regardless of count, including n <= 2,
  // so it must be checked before the n<=2 shortcut that reads --accent-primary.
  if (mode === "spectrum") {
    const cols = spectrumColors(n);
    if (n === 2) return [cols[0], getSecondarySeriesColor(cols[0])];
    return cols;
  }

  if (n <= 2) {
    // Every genuinely two-series consumer (Memory/Swap, dual-axis charts, storage
    // read/write, throughput gen/prompt) wants the *same* relationship in every mode: one
    // primary line in the mode's active color, one secondary line that's clearly a variant
    // of that same color (never an unrelated hue) so the dashed/solid distinction is the
    // only thing doing double duty with color, not fighting it.
    const primary = resolvePrimaryModeColor(mode);
    if (n === 1) return [primary];
    return [primary, getSecondarySeriesColor(primary)];
  }

  if (mode === "rainbow-wave") {
    return rainbowColors(n, cs);
  }

  // In Solid mode, the per-core utilization chart always uses the fixed SPECTRUM palette
  // regardless of the selected accent — it is the one component exempted from accent tracking.
  if (mode === "solid" && perCoreExemption) {
    return Array.from({ length: n }, (_, i) => SPECTRUM[i % SPECTRUM.length]);
  }

  const primary = toHex("var(--accent-primary)") || "#6366f1";
  const [h, s, l] = hexToHsl(primary);
  return spreadHues(h, n).map((hue) => hslToHex(hue, s, l));
}

export function resolveAccentColor(contextEl?: Element | null): string {
  return resolveAccentColors(1, false, contextEl)[0];
}

/**
 * For UI that displays several distinct metrics (e.g. a device's UTIL/TEMP/POWER bars, or
 * per-core utilization bars) rather than several simultaneous data series that need visual
 * differentiation, every bar should share the single resolved accent color — only deviating
 * to warning/critical colors when a threshold is crossed. Use this instead of
 * `resolveAccentColors(n)`, which spreads n *different* hues and is only appropriate for
 * genuinely multi-series contexts (e.g. distinguishing Memory vs Swap lines on a chart).
 */
export function useResolvedAccentColor(): string {
  const [color, setColor] = useState(() => resolveAccentColor());
  useAccentSync(() => setColor(resolveAccentColor()));
  return color;
}

function hasAccentEl(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.hasAttribute("data-accent-el") ||
      node.querySelector("[data-accent-el]") !== null)
  );
}

export function useAccentIndexer(): void {
  useEffect(() => {
    function assignIndices() {
      const els = document.querySelectorAll<HTMLElement>("[data-accent-el]");
      let i = 0;
      els.forEach((el) => {
        if (el.dataset.accentEl === "inherit") {
          // Explicitly marked to inherit parent card's --el-index instead of having its own
          el.style.removeProperty("--el-index");
          return;
        }
        el.style.setProperty("--el-index", String(i));
        i++;
      });
    }
    assignIndices();

    let rafId = 0;
    const observer = new MutationObserver((mutations) => {
      // Early-exit: skip re-index if no [data-accent-el] elements were added or removed
      const relevant = mutations.some((m) =>
        [...m.addedNodes, ...m.removedNodes].some(hasAccentEl),
      );
      if (!relevant) return;
      // rAF coalescing: multiple mutations in one frame collapse into one re-index
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(assignIndices);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);
}
