import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AiMetrics, MetricHistoryPoint } from "../types/metrics";

type HistorySetter = Dispatch<SetStateAction<MetricHistoryPoint[] | null>>;

const BUSY_INTERVAL_MS = 1000;
const IDLE_INTERVAL_MS = 5000;
const BUFFER_SIZE = 120;

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

export function useLlamaCppMetrics(isPaused?: boolean): {
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

  const isBusyRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (): Promise<void> => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const response = await fetch("/api/ai/metrics");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data: AiMetrics = json.data;

      const isProcessing = data.slots?.[0]?.is_processing ?? false;
      isBusyRef.current = isProcessing || (data.active_requests ?? 0) > 0;

      setCurrentMetrics(data);
      appendHistory(setGenTpsHistory, data.gen_tps ?? null, BUFFER_SIZE);
      appendHistory(setPromptTpsHistory, data.prompt_tps ?? null, BUFFER_SIZE);
      appendHistory(
        setActiveRequestsHistory,
        data.active_requests ?? null,
        BUFFER_SIZE,
      );
      appendHistory(
        setQueuedRequestsHistory,
        data.queued_requests ?? null,
        BUFFER_SIZE,
      );
      appendHistory(
        setContextTokensHistory,
        data.context_tokens ?? null,
        BUFFER_SIZE,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      appendNull(setGenTpsHistory, BUFFER_SIZE);
      appendNull(setPromptTpsHistory, BUFFER_SIZE);
      appendNull(setActiveRequestsHistory, BUFFER_SIZE);
      appendNull(setQueuedRequestsHistory, BUFFER_SIZE);
      appendNull(setContextTokensHistory, BUFFER_SIZE);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isPaused) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let tabVisible = !document.hidden;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !tabVisible) return;
      const delay = isBusyRef.current ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS;
      timer = setTimeout(async () => {
        if (!cancelled && tabVisible) {
          await fetchData();
          schedule();
        }
      }, delay);
    };

    const handleVisibility = () => {
      tabVisible = !document.hidden;
      if (tabVisible) {
        fetchData().then(() => {
          if (!cancelled) schedule();
        });
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData().then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isPaused, fetchData]);

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
