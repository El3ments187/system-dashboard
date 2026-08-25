import { useCallback, useEffect, useRef, useState } from "react";

/** The height Run Models ships with, and what a reset returns to. */
export const DEFAULT_RUN_MODELS_HEIGHT = 204;

/** Below this the Run Models header plus one row no longer fit. */
export const MIN_RUN_MODELS = 120;

/** The console has a filter row and six toggles; below this nothing readable is left. */
export const MIN_CONSOLE = 100;

/** Matches the work area's `gap: 9`. Counted against the console's share. */
export const SPLIT_GAP = 9;

/**
 * Persisted as a RATIO of the work area, not pixels. 600px is half the column
 * on one display and the whole of it on another, so a pixel value reopens the
 * page with no console on a smaller screen. Key follows the existing
 * `llama_cpp_*` convention rather than inventing a third scheme.
 */
export const SPLIT_STORAGE_KEY = "llama_cpp_split_ratio";

/**
 * The largest Run Models may be without starving the console. Derived from the
 * container measured at drag start — never a hardcoded page height, since the
 * work area is viewport-locked and differs per display.
 */
export function maxRunModels(containerHeight: number): number {
  return Math.max(MIN_RUN_MODELS, containerHeight - MIN_CONSOLE - SPLIT_GAP);
}

/** Clamp a height into the legal band for a given container. */
export function clampRunModels(height: number, containerHeight: number): number {
  if (!Number.isFinite(height)) return DEFAULT_RUN_MODELS_HEIGHT;
  return Math.min(Math.max(height, MIN_RUN_MODELS), maxRunModels(containerHeight));
}

/**
 * Read the stored ratio back as a height. A ratio that would leave the console
 * below its minimum is REJECTED rather than clamped — a value that far out of
 * range is corrupt or from a very different layout, and silently clamping it
 * would hide that. Malformed values are cleared so the fault does not persist.
 */
export function heightFromStoredRatio(
  raw: string | null,
  containerHeight: number,
): number | null {
  if (raw === null) return null;
  const ratio = Number.parseFloat(raw);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return null;
  const height = ratio * containerHeight;
  if (height < MIN_RUN_MODELS) return null;
  if (height > maxRunModels(containerHeight)) return null;
  return Math.round(height);
}

interface DragState {
  startY: number;
  startHeight: number;
  containerHeight: number;
}

/**
 * Owns exactly one number: Run Models' height. The console stays `flex: 1` and
 * follows automatically — giving it an explicit height is what breaks the
 * arrangement.
 */
export function useRunModelsSplit(
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const [height, setHeight] = useState<number>(DEFAULT_RUN_MODELS_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const hydrated = useRef(false);

  /**
   * Mirrors `height` for reads that must not go through a render. `pointerup`
   * can land in the same React batch as the last `pointermove`, and a closure
   * over `height` would then persist the value from BEFORE the drag.
   */
  const heightRef = useRef(DEFAULT_RUN_MODELS_HEIGHT);
  const applyHeight = useCallback((next: number) => {
    heightRef.current = next;
    setHeight(next);
  }, []);

  const containerHeight = useCallback(
    () => containerRef.current?.getBoundingClientRect().height ?? 0,
    [containerRef],
  );

  // Restore the stored ratio once the container has a measurable height.
  useEffect(() => {
    if (hydrated.current) return;
    const ch = containerHeight();
    if (ch <= 0) return;
    hydrated.current = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    } catch {
      return;
    }
    const restored = heightFromStoredRatio(raw, ch);
    if (restored === null) {
      // Out of range or malformed: clear it so the bad value does not persist.
      if (raw !== null) {
        try {
          localStorage.removeItem(SPLIT_STORAGE_KEY);
        } catch {
          /* storage unavailable — the default still applies */
        }
      }
      return;
    }
    // Hydration needs the container MEASURED, which only exists after mount —
    // there is no render-time value to seed useState with. Runs once, guarded
    // by `hydrated`. Same targeted exemption SettingsPage uses for this rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyHeight(restored);
  }, [containerHeight, applyHeight]);

  const persist = useCallback(
    (next: number, ch: number) => {
      if (ch <= 0) return;
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, String(next / ch));
      } catch {
        /* storage unavailable — the session still honours the drag */
      }
    },
    [],
  );

  // A height legal at 1080p can leave no console at 720p, so clamp on resize,
  // not only on drag.
  useEffect(() => {
    const onResize = () => {
      const ch = containerHeight();
      if (ch <= 0) return;
      applyHeight(clampRunModels(heightRef.current, ch));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [containerHeight, applyHeight]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ch = containerHeight();
      if (ch <= 0) return;
      dragRef.current = { startY: e.clientY, startHeight: heightRef.current, containerHeight: ch };
      setDragging(true);
      // Pointer capture, not mouse events: dragging past the window edge or
      // over an iframe would otherwise drop the drag and strand the divider.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [containerHeight],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    applyHeight(clampRunModels(d.startHeight + (e.clientY - d.startY), d.containerHeight));
  }, [applyHeight]);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      persist(clampRunModels(heightRef.current, d.containerHeight), d.containerHeight);
    },
    [persist],
  );

  const reset = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    applyHeight(DEFAULT_RUN_MODELS_HEIGHT);
    try {
      localStorage.removeItem(SPLIT_STORAGE_KEY);
    } catch {
      /* storage unavailable — the height is still reset for this session */
    }
  }, [applyHeight]);

  /**
   * `user-select: none` goes on the body for the duration of the drag only.
   * Without it the gesture highlights model names and log lines; leaving it on
   * would stop the user copying log text, which the console's Copy button
   * exists to support.
   */
  useEffect(() => {
    if (!dragging) return;
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    // Held on the body so the cursor does not flicker back to a caret once the
    // pointer leaves the 9px strip mid-drag.
    document.body.style.cursor = "row-resize";
    return () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  return {
    height,
    dragging,
    isModified: height !== DEFAULT_RUN_MODELS_HEIGHT,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    reset,
  };
}
