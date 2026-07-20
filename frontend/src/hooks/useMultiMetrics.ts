import { useState, useEffect, useCallback, useRef } from "react";
import { slideWindow } from "../utils/slideWindow";
import { MetricHistoryPoint } from "../types/metrics";

/**
 * Hook for polling metrics from the backend API.
 * Maintains a rolling 60-second history (buffer size derived from interval).
 * Handles errors gracefully without crashing.
 */
export function useMetrics<T>(
  endpoint: string,
  valueExtractor: (data: T) => number | null,
  intervalMs = 1000,
  isPaused?: boolean,
): {
  currentValue: number | null;
  history: MetricHistoryPoint[];
  loading: boolean;
  error: string | null;
} {
  const bufferSize = Math.ceil(60000 / intervalMs);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>(() => {
    const now = new Date();
    return Array.from({ length: bufferSize }, (_, i) => ({
      slot: i,
      timestamp: new Date(now.getTime() - (bufferSize - i) * intervalMs),
      value: 0,
    }));
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const extractorRef = useRef(valueExtractor);
  useEffect(() => {
    extractorRef.current = valueExtractor;
  }, [valueExtractor]);

  const endpointRef = useRef(endpoint);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/metrics${endpointRef.current}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const value = extractorRef.current(json.data);
      const timestamp = new Date();

      setCurrentValue(value);
      setHistory((prev) => slideWindow(prev, value, timestamp));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setHistory((prev) => slideWindow(prev, null, new Date()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Poll only while the tab is visible: rAF pauses in background tabs but
    // setInterval does not, so without this gate the app keeps fetching and
    // re-rendering every recharts tree while completely invisible. On return
    // to visibility, fetch immediately so charts refresh without waiting a
    // full interval.
    const tick = () => {
      if (!document.hidden) fetchData();
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    if (!isPaused) {
      const interval = setInterval(tick, intervalMs);
      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", tick);
      };
    }
    return () => document.removeEventListener("visibilitychange", tick);
  }, [fetchData, intervalMs, isPaused]);

  return { currentValue, history, loading, error };
}

/**
 * Hook for polling a single endpoint and extracting multiple values.
 * Only creates one interval, avoiding redundant API calls.
 *
 * When trackHistory is true for an index, that value's rolling 60-second
 * history is returned so charts and cards can share the same polling data.
 */
export function useMultiMetrics<T>(
  endpoint: string,
  extractors: Array<(data: T) => number | null>,
  trackHistory?: Array<boolean>,
  intervalMs = 1000,
  bufferDurationMs = 60000,
  isPaused?: boolean,
): {
  currentValues: Array<number | null>;
  histories: Array<MetricHistoryPoint[] | null>;
  rawData: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const bufferSize = Math.ceil(bufferDurationMs / intervalMs);
  const [currentValues, setCurrentValues] = useState<Array<number | null>>(() =>
    Array(extractors.length).fill(null),
  );
  const [histories, setHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >(() =>
    extractors.map((_, i) => {
      if (!trackHistory?.[i]) return null;
      const now = new Date();
      return Array.from({ length: bufferSize }, (_, j) => ({
        slot: j,
        timestamp: new Date(now.getTime() - (bufferSize - j) * intervalMs),
        value: 0,
      }));
    }),
  );
  const [rawData, setRawData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resize arrays when extractors count changes (handles HMR)
  const prevExtractorCountRef = useRef(extractors.length);
  useEffect(() => {
    const len = extractors.length;
    if (prevExtractorCountRef.current !== len) {
      prevExtractorCountRef.current = len;
      setCurrentValues(Array(len).fill(null));
      setHistories(
        extractors.map((_, i) =>
          trackHistory?.[i]
            ? Array.from({ length: bufferSize }, (_, j) => ({
                slot: j,
                timestamp: new Date(Date.now() - (bufferSize - j) * intervalMs),
                value: 0,
              }))
            : null,
        ),
      );
    }
  }, [extractors, trackHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const extractorsRef = useRef(extractors);
  useEffect(() => {
    extractorsRef.current = extractors;
  }, [extractors]);

  const endpointRef = useRef(endpoint);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);

  const trackHistoryRef = useRef(trackHistory);
  useEffect(() => {
    trackHistoryRef.current = trackHistory;
  }, [trackHistory]);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/metrics${endpointRef.current}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data = json.data;

      const values = extractorsRef.current.map((ex) => ex(data));
      setCurrentValues(values);
      setRawData(data);

      // Update history buffers for tracked indices
      setHistories((prev) =>
        prev.map((h, i) => {
          if (!h || !trackHistoryRef.current?.[i]) return h;
          const newValue = values[i];

          // Shift buffer: drop oldest, append new value with correct slot indices
          return slideWindow(h, newValue, new Date());
        }),
      );

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setHistories((prev) =>
        prev.map((h, i) => {
          if (!h || !trackHistoryRef.current?.[i]) return h;
          return slideWindow(h, null, new Date());
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Poll only while the tab is visible: rAF pauses in background tabs but
    // setInterval does not, so without this gate the app keeps fetching and
    // re-rendering every recharts tree while completely invisible. On return
    // to visibility, fetch immediately so charts refresh without waiting a
    // full interval.
    const tick = () => {
      if (!document.hidden) fetchData();
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    if (!isPaused) {
      const interval = setInterval(tick, intervalMs);
      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", tick);
      };
    }
    return () => document.removeEventListener("visibilitychange", tick);
  }, [fetchData, intervalMs, isPaused]);

  return { currentValues, histories, rawData, loading, error, retry };
}
