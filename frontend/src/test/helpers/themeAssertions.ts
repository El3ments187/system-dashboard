import { expect } from 'vitest';

/** Parses any CSS color (computed) into an [r,g,b,a] tuple, or null if unparseable. */
function parseRgba(value: string): [number, number, number, number] | null {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
}

function isBlack([r, g, b, a]: [number, number, number, number]): boolean {
  return r === 0 && g === 0 && b === 0 && a > 0;
}

/**
 * Walks every element under `root` and fails if any element with visible text content
 * and/or a visible fill/background resolves to literal black — this is what "Animated
 * Gradient renders black components" looks like in the DOM (a broken CSS var falling
 * back to nothing, which browsers render as black).
 */
export function expectNoBlackElements(root: ParentNode = document.body) {
  const elements = root.querySelectorAll<HTMLElement>('*');
  const offenders: string[] = [];

  elements.forEach(el => {
    const style = getComputedStyle(el);
    const bg = parseRgba(style.backgroundColor);
    const color = parseRgba(style.color);
    const hasText = !!el.textContent?.trim();

    if (bg && isBlack(bg) && color && isBlack(color)) {
      offenders.push(`${el.tagName}.${el.className}: bg and text both black`);
    }
    if (hasText && color && isBlack(color) && bg && isBlack(bg)) {
      offenders.push(`${el.tagName}.${el.className}: black text on black background`);
    }
  });

  expect(offenders, offenders.join('\n')).toHaveLength(0);
}

/** Fails if any inline style or computed value resolves to the literal strings CSS produces for a broken custom property. */
export function expectNoInvalidCssValues(root: ParentNode = document.body) {
  const elements = root.querySelectorAll<HTMLElement>('*');
  const offenders: string[] = [];

  elements.forEach(el => {
    const inline = el.getAttribute('style') || '';
    if (/undefined|NaN|:\s*null\b/.test(inline)) {
      offenders.push(`${el.tagName}: invalid inline style "${inline}"`);
    }
  });

  expect(offenders, offenders.join('\n')).toHaveLength(0);
}

/** Returns the resolved text color of an element, as an [r,g,b,a] tuple. */
export function getTextColor(el: Element): [number, number, number, number] | null {
  return parseRgba(getComputedStyle(el).color);
}

/** Returns the resolved background color of an element. */
export function getBackgroundColor(el: Element): [number, number, number, number] | null {
  return parseRgba(getComputedStyle(el).backgroundColor);
}

/** True if two resolved colors are the same (within rounding tolerance). */
export function colorsMatch(
  a: [number, number, number, number] | null,
  b: [number, number, number, number] | null,
  tolerance = 2,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
}

/**
 * Collects the resolved `data-core-color` (or `data-core-assigned-color`) values from a
 * NodeList of per-core bar/legend elements, returning the unique count and the raw list.
 * Used to verify per-core palette behavior without depending on formatted percentage text.
 */
export function collectPerCoreColors(elements: NodeListOf<Element> | Element[]): { unique: number; colors: string[] } {
  const colors = Array.from(elements).map(el =>
    (el.getAttribute('data-core-assigned-color') || el.getAttribute('data-core-color') || '').toLowerCase()
  ).filter(Boolean);
  return { unique: new Set(colors).size, colors };
}

export function expectThemeApplied(mode: string) {
  expect(document.documentElement.getAttribute('data-accent-mode')).toBe(mode);
}

export function expectDashboardInSolidMode() {
  expect(document.documentElement.getAttribute('data-accent-mode')).toBe('solid');
}

export function setAccentMode(mode: string) {
  document.documentElement.setAttribute('data-accent-mode', mode);
}

export function setAccent(accent: string) {
  document.documentElement.setAttribute('data-accent', accent);
}

export function resetThemeAttributes() {
  document.documentElement.removeAttribute('data-accent-mode');
  document.documentElement.removeAttribute('data-accent');
  document.documentElement.removeAttribute('data-bg');
  document.documentElement.removeAttribute('style');
}
