import { useState, useEffect, useCallback, useRef } from 'react';
import { MetricHistoryPoint } from '../types/metrics';

const BUFFER_SIZE = 60;

/**
 * Hook for polling metrics from the backend API.
 * Maintains a rolling 60-second history (60 data points at 1s interval).
 * Handles errors gracefully without crashing.
 */
export function useMetrics<T>(
  endpoint: string,
  valueExtractor: (data: T) => number | null,
): {
  currentValue: number | null;
  history: MetricHistoryPoint[];
  loading: boolean;
  error: string | null;
} {
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>(() => {
    const now = new Date();
    return Array.from({ length: BUFFER_SIZE }, (_, i) => ({
      slot: i,
      timestamp: new Date(now.getTime() - (BUFFER_SIZE - i) * 1000),
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

      // [TRACE] Stage 1: Raw API response
      console.log(`[TRACE-API] endpoint=${endpointRef.current} raw_data=`, JSON.stringify(json.data), `extracted_value=${value}`);

      setCurrentValue(value);
      setHistory(prev => {
        const next = [...prev.slice(1), { slot: BUFFER_SIZE - 1, timestamp, value }]
          .map((p, idx) => ({ ...p, slot: idx }));
        // [TRACE] Stage 2: History buffer (last point)
        console.log(`[TRACE-BUFFER] endpoint=${endpointRef.current} last_point=`, JSON.stringify(next[next.length - 1]));
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHistory(prev => {
        return [...prev.slice(1), { slot: BUFFER_SIZE - 1, timestamp: new Date(), value: null }]
          .map((p, idx) => ({ ...p, slot: idx }));
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { currentValue, history, loading, error };
}

/**
 * Hook for polling a single endpoint and extracting multiple values.
 * Only creates one interval, avoiding redundant API calls.
 *
 * When trackHistory is true for an index, that value's rolling 60-point
 * history is returned so charts and cards can share the same polling data.
 */
export function useMultiMetrics<T>(
  endpoint: string,
  extractors: Array<(data: T) => number | null>,
  trackHistory?: Array<boolean>,
): {
  currentValues: Array<number | null>;
  histories: Array<MetricHistoryPoint[] | null>;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [currentValues, setCurrentValues] = useState<Array<number | null>>(() => Array(extractors.length).fill(null));
  const [histories, setHistories] = useState<Array<MetricHistoryPoint[] | null>>(() =>
    extractors.map((_, i) => {
      if (!trackHistory?.[i]) return null;
      const now = new Date();
      return Array.from({ length: BUFFER_SIZE }, (_, j) => ({
        slot: j,
        timestamp: new Date(now.getTime() - (BUFFER_SIZE - j) * 1000),
        value: 0,
      }));
    })
  );
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
          trackHistory?.[i] ? Array.from({ length: BUFFER_SIZE }, (_, j) => ({
            slot: j,
            timestamp: new Date(Date.now() - (BUFFER_SIZE - j) * 1000),
            value: 0,
          })) : null
        )
      );
    }
  }, [extractors, trackHistory]);

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

      // [TRACE] Stage 1: Raw API response
      console.log(`[TRACE-API] endpoint=${endpointRef.current} raw_data=`, JSON.stringify(data));

      const values = extractorsRef.current.map(ex => ex(data));
      setCurrentValues(values);

      // [TRACE] Stage 1b: Extracted values
      console.log(`[TRACE-EXTRACT] endpoint=${endpointRef.current} extracted_values=`, JSON.stringify(values));

      // Update history buffers for tracked indices
      setHistories(prev => prev.map((h, i) => {
        if (!h || !trackHistoryRef.current?.[i]) return h;
        const newValue = values[i];

        // Shift buffer: drop oldest, append new value with correct slot indices
        const next = [...h.slice(1), { slot: BUFFER_SIZE - 1, timestamp: new Date(), value: newValue }]
          .map((p, idx) => ({ ...p, slot: idx }));
        // [TRACE] Stage 2: History buffer (last tracked point)
        console.log(`[TRACE-BUFFER] endpoint=${endpointRef.current} history_idx=${i} last_point=`, JSON.stringify(next[next.length - 1]));
        return next;
      }));

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHistories(prev => prev.map((h, i) => {
        if (!h || !trackHistoryRef.current?.[i]) return h;
        return [...h.slice(1), { slot: BUFFER_SIZE - 1, timestamp: new Date(), value: null }]
          .map((p, idx) => ({ ...p, slot: idx }));
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { currentValues, histories, loading, error, retry };
}
