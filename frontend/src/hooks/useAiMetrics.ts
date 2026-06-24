import { useState, useEffect, useCallback } from 'react';
import { AiMetrics, MetricHistoryPoint } from '../types/metrics';

/**
 * Hook for polling AI metrics from the backend API.
 * Maintains a rolling 120-second history buffer focused on operational metrics.
 */
export function useAiMetrics(isPaused?: boolean): {
  currentMetrics: AiMetrics | null;
  genTpsHistory: MetricHistoryPoint[] | null;
  promptTpsHistory: MetricHistoryPoint[] | null;
  activeRequestsHistory: MetricHistoryPoint[] | null;
  queuedRequestsHistory: MetricHistoryPoint[] | null;
  contextTokensHistory: MetricHistoryPoint[] | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const intervalMs = 2000;
  const bufferSize = Math.ceil(120000 / intervalMs);

  const [currentMetrics, setCurrentMetrics] = useState<AiMetrics | null>(null);
  const [genTpsHistory, setGenTpsHistory] = useState<MetricHistoryPoint[] | null>(null);
  const [promptTpsHistory, setPromptTpsHistory] = useState<MetricHistoryPoint[] | null>(null);
  const [activeRequestsHistory, setActiveRequestsHistory] = useState<MetricHistoryPoint[] | null>(null);
  const [queuedRequestsHistory, setQueuedRequestsHistory] = useState<MetricHistoryPoint[] | null>(null);
  const [contextTokensHistory, setContextTokensHistory] = useState<MetricHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to update a history buffer
  const updateHistory = (setter: React.Dispatch<React.SetStateAction<MetricHistoryPoint[] | null>>, value: number | null) => {
    setter(prev => {
      const entry = { slot: bufferSize - 1, timestamp: new Date(), value };
      if (!prev || prev.length < bufferSize) {
        return [...(prev ?? []), entry];
      }
      return [...prev.slice(1), entry].map((p, idx) => ({ ...p, slot: idx }));
    });
  };

  // Helper to push null on error
  const pushNull = (setter: React.Dispatch<React.SetStateAction<MetricHistoryPoint[] | null>>) => {
    setter(prev => {
      const ts = new Date();
      if (!prev || prev.length < bufferSize) return [...(prev ?? []), { slot: prev?.length ?? 0, timestamp: ts, value: null }];
      return [...prev.slice(1), { slot: bufferSize - 1, timestamp: ts, value: null }].map((p, idx) => ({ ...p, slot: idx }));
    });
  };

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/metrics');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data: AiMetrics = json.data;

      setCurrentMetrics(data);

      updateHistory(setGenTpsHistory, data.gen_tps ?? null);
      updateHistory(setPromptTpsHistory, data.prompt_tps ?? null);
      updateHistory(setActiveRequestsHistory, data.active_requests ?? null);
      updateHistory(setQueuedRequestsHistory, data.queued_requests ?? null);
      updateHistory(setContextTokensHistory, data.context_tokens ?? null);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      pushNull(setGenTpsHistory);
      pushNull(setPromptTpsHistory);
      pushNull(setActiveRequestsHistory);
      pushNull(setQueuedRequestsHistory);
      pushNull(setContextTokensHistory);
    } finally {
      setLoading(false);
    }
  }, [bufferSize]);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    if (!isPaused) {
      const interval = setInterval(fetchData, intervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchData, intervalMs, isPaused]);

  return {
    currentMetrics,
    genTpsHistory,
    promptTpsHistory,
    activeRequestsHistory,
    queuedRequestsHistory,
    contextTokensHistory,
    loading,
    error,
    retry,
  };
}
