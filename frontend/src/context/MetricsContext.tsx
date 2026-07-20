import { useMultiMetrics } from "../hooks/useMultiMetrics";
import { slideWindow } from "../utils/slideWindow";
import { useStorageMetrics } from "../hooks/useStorageMetrics";
import { useLlamaCppMetrics } from "../hooks/useLlamaCppMetrics";
import { useLiveDataControlsContext } from "./LiveDataControlsContext";
import React, { useContext, useState, useEffect, useRef } from "react";
import { StorageHistoryPoint, MetricHistoryPoint } from "../types/metrics";

function makeCoreHistorySlots(numSlots: number): MetricHistoryPoint[] {
  const now = new Date();
  return Array.from({ length: numSlots }, (_, j) => ({
    slot: j,
    timestamp: new Date(now.getTime() - (numSlots - j) * 500),
    value: 0,
  }));
}

// Module-level extractor arrays so their references are stable across renders
const CPU_EXTRACTORS = [
  (data: any) => data?.utilization_percent ?? null,
  (data: any) => data?.temperature_celsius ?? null,
  (data: any) => data?.frequency_mhz ?? null,
  (data: any) => data?.physical_cores ?? null,
  (data: any) => data?.threads ?? null,
  (data: any) => data?.load_1m ?? null,
  (data: any) => data?.load_5m ?? null,
  (data: any) => data?.load_15m ?? null,
  (data: any) => data?.freq_max_mhz ?? null,
];
const CPU_TRACK = [true, true, false, false, false, false, false, false, false];

const MEMORY_EXTRACTORS = [
  (data: any) => data?.utilization_percent ?? null,
  (data: any) => data?.used_gb ?? null,
  (data: any) => data?.total_gb ?? null,
  (data: any) => data?.swap_used_gb ?? null,
  (data: any) => data?.swap_total_gb ?? null,
  (data: any) =>
    data?.swap_total_gb && data.swap_total_gb > 0
      ? (data.swap_used_gb / data.swap_total_gb) * 100
      : null,
];
const MEMORY_TRACK = [true, false, false, false, false, true];

function gpuField(data: any, field: string): any {
  const gpu = Array.isArray(data) && data.length > 0 ? data[0] : data;
  return gpu?.[field] ?? null;
}

const GPU_EXTRACTORS = [
  (data: any) => gpuField(data, "utilization_percent"),
  (data: any) => gpuField(data, "temperature_celsius"),
  (data: any) => gpuField(data, "vram_used_gb"),
  (data: any) => gpuField(data, "vram_total_gb"),
  (data: any) => gpuField(data, "power_usage_watts"),
  (data: any) => gpuField(data, "power_limit_watts"),
  (data: any) => {
    const gpu = Array.isArray(data) && data.length > 0 ? data[0] : data;
    const vramUsed = gpu?.vram_used_gb;
    const vramTotal = gpu?.vram_total_gb;
    if (vramUsed != null && vramTotal != null && vramTotal > 0) {
      return (vramUsed / vramTotal) * 100;
    }
    return null;
  },
];
const GPU_TRACK = [true, true, false, false, false, false, true];

/**
 * Hook for tracking per-core CPU utilization histories.
 * Extracts core data from raw CPU metrics without duplicate API calls.
 */
function usePerCoreHistory(
  rawData: any | null,
  isPaused?: boolean,
): Array<MetricHistoryPoint[] | null> {
  const [histories, setHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >(() => []);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (!rawData?.cores || !Array.isArray(rawData.cores) || isPausedRef.current)
      return;

    const cores = rawData.cores;
    setHistories((prev) => {
      if (prev.length !== cores.length) {
        return Array.from({ length: cores.length }, () =>
          makeCoreHistorySlots(120),
        );
      }
      return prev.map((h, i) => {
        if (!h) return null;
        const newValue = cores[i]?.utilization_percent ?? 0;
        return slideWindow(h, newValue, new Date());
      });
    });
  }, [rawData?.cores]);

  return histories;
}

interface PerGpuHistories {
  utilHistories: Array<MetricHistoryPoint[] | null>;
  tempHistories: Array<MetricHistoryPoint[] | null>;
  vramUtilHistories: Array<MetricHistoryPoint[] | null>;
}

const GPU_BUFFER_SIZE = 120;

function makeGpuHistorySlots(): MetricHistoryPoint[] {
  const now = new Date();
  return Array.from({ length: GPU_BUFFER_SIZE }, (_, j) => ({
    slot: j,
    timestamp: new Date(now.getTime() - (GPU_BUFFER_SIZE - j) * 500),
    value: 0,
  }));
}

function buildGpuHistoryUpdate(
  gpus: any[],
  getValue: (gpu: any) => number | null,
): (
  prev: Array<MetricHistoryPoint[] | null>,
) => Array<MetricHistoryPoint[] | null> {
  return (prev) => {
    const base =
      prev.length !== gpus.length
        ? Array.from({ length: gpus.length }, () => makeGpuHistorySlots())
        : prev;
    return base.map((h, i) => {
      if (!h) return null;
      return slideWindow(h, getValue(gpus[i]), new Date());
    });
  };
}

function usePerGpuHistory(
  rawData: any | null,
  isPaused?: boolean,
): PerGpuHistories {
  const [utilHistories, setUtilHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);
  const [tempHistories, setTempHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);
  const [vramUtilHistories, setVramUtilHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (!rawData || isPausedRef.current) return;
    const gpus: any[] = Array.isArray(rawData) ? rawData : [rawData];

    setUtilHistories(
      buildGpuHistoryUpdate(gpus, (gpu) => gpu?.utilization_percent ?? null),
    );
    setTempHistories(
      buildGpuHistoryUpdate(gpus, (gpu) => gpu?.temperature_celsius ?? null),
    );
    setVramUtilHistories(
      buildGpuHistoryUpdate(gpus, (gpu) => {
        const used = gpu?.vram_used_gb;
        const total = gpu?.vram_total_gb;
        return used != null && total != null && total > 0
          ? (used / total) * 100
          : null;
      }),
    );
  }, [rawData]);

  return { utilHistories, tempHistories, vramUtilHistories };
}

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

  const cpu = useMultiMetrics(
    "/cpu",
    CPU_EXTRACTORS,
    CPU_TRACK,
    500,
    60000,
    isPaused,
  );

  const perCoreHistories = usePerCoreHistory(cpu.rawData, isPaused);

  const memory = useMultiMetrics(
    "/memory",
    MEMORY_EXTRACTORS,
    MEMORY_TRACK,
    1000,
    60000,
    isPaused,
  );

  const gpu = useMultiMetrics(
    "/gpu",
    GPU_EXTRACTORS,
    GPU_TRACK,
    500,
    120000,
    isPaused,
  );

  const perGpuHistories = usePerGpuHistory(gpu.rawData, isPaused);

  const storage = useStorageMetrics(isPaused);

  const ai = useLlamaCppMetrics(isPaused);

  const value: MetricsContextValue = {
    cpuCurrentValues: cpu.currentValues,
    cpuRawData: cpu.rawData,
    memoryCurrentValues: memory.currentValues,
    gpuCurrentValues: gpu.currentValues,
    gpuRawData: gpu.rawData,
    cpuHistories: cpu.histories,
    memoryHistories: memory.histories,
    gpuHistories: gpu.histories,
    cpuHistory: cpu.histories?.[0] ?? null,
    cpuTemperatureHistory: cpu.histories?.[1] ?? null,
    memoryHistory: memory.histories?.[0] ?? null,
    swapHistory: memory.histories?.[5] ?? null,
    gpuHistory: gpu.histories?.[0] ?? null,
    gpuTemperatureHistory: gpu.histories?.[1] ?? null,
    gpuVramUtilHistory: gpu.histories?.[6] ?? null,
    perCoreCpuHistories: perCoreHistories,
    perGpuHistories,
    cpuCurrentFrequency: cpu.currentValues?.[2] ?? 0,
    cpuMaxFrequency: cpu.currentValues?.[8] ?? 0,
    cpuLoading: cpu.loading,
    memoryLoading: memory.loading,
    gpuLoading: gpu.loading,
    cpuError: cpu.error,
    memoryError: memory.error,
    gpuError: gpu.error,
    storageDevices: storage.storageDevices,
    storageHistories: storage.storageHistories,
    storageLoading: storage.loading,
    storageError: storage.error,
    aiCurrentMetrics: ai.currentMetrics,
    aiGenTpsHistory: ai.genTpsHistory,
    aiPromptTpsHistory: ai.promptTpsHistory,
    aiActiveRequestsHistory: ai.activeRequestsHistory,
    aiQueuedRequestsHistory: ai.queuedRequestsHistory,
    aiContextTokensHistory: ai.contextTokensHistory,
    llamaCppLoading: ai.loading,
    aiError: ai.error,
    retryLlamaCpp: ai.retry,
    retryCpu: cpu.retry,
    retryMemory: memory.retry,
    retryGpu: gpu.retry,
    retryStorage: storage.retry,
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
