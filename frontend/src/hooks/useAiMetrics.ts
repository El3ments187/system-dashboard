import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AiMetrics, MetricHistoryPoint } from "../types/metrics";

type HistorySetter = Dispatch<SetStateAction<MetricHistoryPoint[] | null>>;

function appendHistory(
  setter: HistorySetter,
  value: number | null,
  bufferSize: number,
) {
  setter((prev) => {
    const entry = { slot: bufferSize - 1, timestamp: new Date(), value };
    if (!prev || prev.length < bufferSize) return [...(prev ?? []), entry];
    return [...prev.slice(1), entry].map((p, idx) => ({ ...p, slot: idx }));
  });
}

function appendNull(setter: HistorySetter, bufferSize: number) {
  setter((prev) => {
    const ts = new Date();
    if (!prev || prev.length < bufferSize)
      return [
        ...(prev ?? []),
        { slot: prev?.length ?? 0, timestamp: ts, value: null },
      ];
    return [
      ...prev.slice(1),
      { slot: bufferSize - 1, timestamp: ts, value: null },
    ].map((p, idx) => ({ ...p, slot: idx }));
  });
}

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
  const intervalMs = 15000;
  const bufferSize = Math.ceil(120000 / intervalMs);

  const [currentMetrics, setCurrentMetrics] = useState<AiMetrics | null>(null);
  const [genTpsHistory, setGenTpsHistory] = useState<
    MetricHistoryPoint[] | null
  >(null);
  const [promptTpsHistory, setPromptTpsHistory] = useState<
    MetricHistoryPoint[] | null
  >(null);
  const [activeRequestsHistory, setActiveRequestsHistory] = useState<
    MetricHistoryPoint[] | null
  >(null);
  const [queuedRequestsHistory, setQueuedRequestsHistory] = useState<
    MetricHistoryPoint[] | null
  >(null);
  const [contextTokensHistory, setContextTokensHistory] = useState<
    MetricHistoryPoint[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/metrics");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data: AiMetrics = json.data;

      setCurrentMetrics(data);

      appendHistory(setGenTpsHistory, data.gen_tps ?? null, bufferSize);
      appendHistory(setPromptTpsHistory, data.prompt_tps ?? null, bufferSize);
      appendHistory(
        setActiveRequestsHistory,
        data.active_requests ?? null,
        bufferSize,
      );
      appendHistory(
        setQueuedRequestsHistory,
        data.queued_requests ?? null,
        bufferSize,
      );
      appendHistory(
        setContextTokensHistory,
        data.context_tokens ?? null,
        bufferSize,
      );

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      appendNull(setGenTpsHistory, bufferSize);
      appendNull(setPromptTpsHistory, bufferSize);
      appendNull(setActiveRequestsHistory, bufferSize);
      appendNull(setQueuedRequestsHistory, bufferSize);
      appendNull(setContextTokensHistory, bufferSize);
    } finally {
      setLoading(false);
    }
  }, [bufferSize]);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
