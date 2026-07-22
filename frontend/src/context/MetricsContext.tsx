import { useCombinedMetrics } from "../hooks/useCombinedMetrics";
import type { PerGpuHistories } from "../hooks/useCombinedMetrics";
import { useLlamaCppMetrics } from "../hooks/useLlamaCppMetrics";
import { useLiveDataControlsContext } from "./LiveDataControlsContext";
import React, { useContext } from "react";
import {
  StorageHistoryPoint,
  MetricHistoryPoint,
  SystemMetrics,
} from "../types/metrics";

interface MetricsContextValue {
  cpuCurrentValues: Array<number | null>;
  cpuRawData: any;
  memoryCurrentValues: Array<number | null>;
  gpuCurrentValues: Array<number | null>;
  gpuRawData: any;
  cpuHistories: Array<any | null>;
  memoryHistories: Array<any | null>;
  gpuHistories: Array<any | null>;
  cpuHistory: any | null;
  cpuTemperatureHistory: any | null;
  memoryHistory: any | null;
  swapHistory: any | null;
  gpuHistory: any | null;
  gpuTemperatureHistory: any | null;
  gpuVramUtilHistory: any | null;
  perCoreCpuHistories: Array<MetricHistoryPoint[] | null>;
  perGpuHistories: PerGpuHistories;
  cpuCurrentFrequency: number;
  cpuMaxFrequency: number;
  cpuLoading: boolean;
  memoryLoading: boolean;
  gpuLoading: boolean;
  cpuError: string | null;
  memoryError: string | null;
  gpuError: string | null;
  storageDevices: Array<any>;
  storageHistories: Map<string, StorageHistoryPoint[]>;
  storageLoading: boolean;
  storageError: string | null;
  systemMetrics: SystemMetrics | null;
  aiCurrentMetrics: any | null;
  aiGenTpsHistory: MetricHistoryPoint[] | null;
  aiPromptTpsHistory: MetricHistoryPoint[] | null;
  aiActiveRequestsHistory: MetricHistoryPoint[] | null;
  aiQueuedRequestsHistory: MetricHistoryPoint[] | null;
  aiContextTokensHistory: MetricHistoryPoint[] | null;
  llamaCppLoading: boolean;
  aiError: string | null;
  retryLlamaCpp: () => void;
  retryCpu: () => void;
  retryMemory: () => void;
  retryGpu: () => void;
  retryStorage: () => void;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
}

export const MetricsContext = React.createContext<MetricsContextValue | null>(
  null,
);

export function MetricsProvider({ children }: { children: React.ReactNode }) {
  const { isPaused, pause, resume, toggle } = useLiveDataControlsContext();

  const combined = useCombinedMetrics(500, isPaused);
  const ai = useLlamaCppMetrics(isPaused);

  const value: MetricsContextValue = {
    cpuCurrentValues: combined.cpuValues,
    cpuRawData: combined.cpuRawData,
    memoryCurrentValues: combined.memoryValues,
    gpuCurrentValues: combined.gpuValues,
    gpuRawData: combined.gpuRawData,
    cpuHistories: combined.cpuHistories,
    memoryHistories: combined.memoryHistories,
    gpuHistories: combined.gpuHistories,
    cpuHistory: combined.cpuHistories?.[0] ?? null,
    cpuTemperatureHistory: combined.cpuHistories?.[1] ?? null,
    memoryHistory: combined.memoryHistories?.[0] ?? null,
    swapHistory: combined.memoryHistories?.[5] ?? null,
    gpuHistory: combined.gpuHistories?.[0] ?? null,
    gpuTemperatureHistory: combined.gpuHistories?.[1] ?? null,
    gpuVramUtilHistory: combined.gpuHistories?.[6] ?? null,
    perCoreCpuHistories: combined.perCoreCpuHistories,
    perGpuHistories: combined.perGpuHistories,
    cpuCurrentFrequency: combined.cpuValues?.[2] ?? 0,
    cpuMaxFrequency: combined.cpuValues?.[8] ?? 0,
    cpuLoading: combined.loading,
    memoryLoading: combined.loading,
    gpuLoading: combined.loading,
    cpuError: combined.error,
    memoryError: combined.error,
    gpuError: combined.error,
    storageDevices: combined.storageDevices,
    storageHistories: combined.storageHistories,
    storageLoading: combined.loading,
    storageError: combined.error,
    systemMetrics: combined.systemMetrics,
    aiCurrentMetrics: ai.currentMetrics,
    aiGenTpsHistory: ai.genTpsHistory,
    aiPromptTpsHistory: ai.promptTpsHistory,
    aiActiveRequestsHistory: ai.activeRequestsHistory,
    aiQueuedRequestsHistory: ai.queuedRequestsHistory,
    aiContextTokensHistory: ai.contextTokensHistory,
    llamaCppLoading: ai.loading,
    aiError: ai.error,
    retryLlamaCpp: ai.retry,
    retryCpu: combined.retry,
    retryMemory: combined.retry,
    retryGpu: combined.retry,
    retryStorage: combined.retry,
    isPaused,
    pause,
    resume,
    toggle,
  };

  return (
    <MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>
  );
}

export function useMetricsContext(): MetricsContextValue {
  const ctx = useContext(MetricsContext);
  if (!ctx)
    throw new Error("useMetricsContext must be used within MetricsProvider");
  return ctx;
}
