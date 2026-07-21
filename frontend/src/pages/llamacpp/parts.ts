import { useRef, useLayoutEffect } from "react";
import type React from "react";

export function fmtNum(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString();
}

export function getCtxColor(pct: number | null): string {
  if (pct != null && pct > 90) return "var(--danger)";
  if (pct != null && pct > 70) return "var(--warning)";
  return "var(--accent-primary)";
}

export function thresholdClass(pct: number | null | undefined): string {
  if (pct == null) return "";
  if (pct >= 85) return "progress-bar-critical";
  if (pct >= 70) return "progress-bar-warning";
  return "progress-bar-normal";
}

export function updateStateColor(state: string): string {
  if (state === "error") return "var(--danger)";
  if (state === "done") return "var(--success)";
  return "var(--accent-primary)";
}

export function updateStateText(state: string): string {
  if (state === "running") return "Updating\u2026";
  if (state === "done") return "Update complete";
  return "Update failed";
}

export const QUANT_RE = /(?:^|[-_.])(I?Q\d[A-Z0-9_]*|B?F\d+|qat|fp\d+)$/i;

export function splitModelName(name: string): { head: string; quant: string } {
  const m = name.match(QUANT_RE);
  if (!m) return { head: name, quant: "" };
  const i = name.length - m[1].length;
  return { head: name.slice(0, i), quant: name.slice(i) };
}

export function boolLabel(val: boolean | null | undefined): string {
  if (val == null) return "\u2014";
  return val ? "Yes" : "No";
}

export function middleTruncate(s: string, max = 46): string {
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return s.slice(0, head) + "\u2026" + s.slice(s.length - tail);
}

export function useFitText(
  value: string,
  maxPx = 26,
  minPx = 13,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = maxPx;
      el.style.fontSize = size + "px";
      el.style.whiteSpace = "nowrap";
      while (el.scrollWidth > el.clientWidth && size > minPx) {
        size -= 0.5;
        el.style.fontSize = size + "px";
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, maxPx, minPx]);
  return ref;
}

export function rowBackground(
  running: boolean,
  idx: number,
): string | undefined {
  if (running)
    return "color-mix(in srgb, var(--accent-primary) 9%, var(--bg-card))";
  if (idx % 2 === 1) return "rgba(255,255,255,0.015)";
  return undefined;
}

export function contextGaugeLabel(
  contextPct: number | null | undefined,
  llamaOnline: boolean,
): string {
  if (contextPct != null) {
    if (contextPct > 0 && contextPct < 1) return "<1";
    return contextPct.toFixed(0);
  }
  if (llamaOnline) return "\u2014";
  return "0";
}
