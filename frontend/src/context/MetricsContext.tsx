import { useMultiMetrics } from '../hooks/useMultiMetrics';
import { useStorageMetrics } from '../hooks/useStorageMetrics';
import { useAiMetrics } from '../hooks/useAiMetrics';
import { useLiveDataControlsContext } from './LiveDataControlsContext';
import React, { useContext, useState, useEffect, useRef } from 'react';
import { StorageHistoryPoint, MetricHistoryPoint } from '../types/metrics';

/**
 * Hook for tracking per-core CPU utilization histories.
 * Extracts core data from raw CPU metrics without duplicate API calls.
 */
function usePerCoreHistory(rawData: any | null, isPaused?: boolean): Array<MetricHistoryPoint[] | null> {
  const [histories, setHistories] = useState<Array<MetricHistoryPoint[] | null>>(() => []);
  const rawDataRef = useRef(rawData);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    rawDataRef.current = rawData;
    isPausedRef.current = isPaused;
  }, [rawData, isPaused]);

  // Initialize histories when cores become available
  useEffect(() => {
    if (rawData?.cores && Array.isArray(rawData.cores)) {
      const numCores = rawData.cores.length;
      if (histories.length !== numCores) {
        const now = new Date();
        setHistories(
          Array.from({ length: numCores }, () => {
            return Array.from({ length: 120 }, (_, j) => ({
              slot: j,
              timestamp: new Date(now.getTime() - (120 - j) * 500),
              value: 0,
            }));
          })
        );
      }
    }
  }, [rawData?.cores?.length]);

  // Update histories when raw data changes
  useEffect(() => {
    if (!rawData?.cores || !Array.isArray(rawData.cores) || isPausedRef.current) return;

    const cores = rawData.cores;
    setHistories(prev => {
      // Reinitialize if core count changed
      if (prev.length !== cores.length) {
        const now = new Date();
        return Array.from({ length: cores.length }, () => {
          return Array.from({ length: 120 }, (_, j) => ({
            slot: j,
            timestamp: new Date(now.getTime() - (120 - j) * 500),
            value: 0,
          }));
        });
      }
      return prev.map((h, i) => {
        if (!h) return null;
        const newValue = cores[i]?.utilization_percent ?? 0;
        const next = [...h.slice(1), { slot: 119, timestamp: new Date(), value: newValue }]
          .map((p, idx) => ({ ...p, slot: idx }));
        return next;
      });
    });
  }, [rawData?.cores]);

  return histories;
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
  perCoreCpuHistories: Array<any | null>;
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
  aiLoading: boolean;
  aiError: string | null;
  retryAi: () => void;
  retryCpu: () => void;
  retryMemory: () => void;
  retryGpu: () => void;
  retryStorage: () => void;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
}

const MetricsContext = React.createContext<MetricsContextValue | null>(null);

export function MetricsProvider({ children }: { children: React.ReactNode }) {
  const { isPaused, pause, resume, toggle } = useLiveDataControlsContext();

  const cpu = useMultiMetrics(
      '/cpu',
      [
        (data: any) => data?.utilization_percent ?? null,
        (data: any) => data?.temperature_celsius ?? null,
        (data: any) => data?.frequency_mhz ?? null,
        (data: any) => data?.physical_cores ?? null,
        (data: any) => data?.threads ?? null,
        (data: any) => data?.load_1m ?? null,
        (data: any) => data?.load_5m ?? null,
        (data: any) => data?.load_15m ?? null,
      ],
      [true, true, false, false, false, false, false, false],
      500,
      60000,
      isPaused,
    );

   // Track per-core histories from raw CPU data without duplicate API calls
   const perCoreHistories = usePerCoreHistory(cpu.rawData, isPaused);

  const memory = useMultiMetrics(
     '/memory',
     [
       (data: any) => data?.utilization_percent ?? null,
       (data: any) => data?.used_gb ?? null,
       (data: any) => data?.total_gb ?? null,
       (data: any) => data?.swap_used_gb ?? null,
       (data: any) => data?.swap_total_gb ?? null,
       (data: any) =>
         data?.swap_total_gb && data.swap_total_gb > 0
           ? (data.swap_used_gb / data.swap_total_gb) * 100
           : null,
     ],
     [true, false, false, false, false, true],
     1000,
     60000,
     isPaused,
   );

  const gpu = useMultiMetrics(
       '/gpu',
       [
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.utilization_percent ?? null;
           return data?.utilization_percent ?? null;
         },
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.temperature_celsius ?? null;
           return data?.temperature_celsius ?? null;
         },
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.vram_used_gb ?? null;
           return data?.vram_used_gb ?? null;
         },
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.vram_total_gb ?? null;
           return data?.vram_total_gb ?? null;
         },
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.power_usage_watts ?? null;
           return data?.power_usage_watts ?? null;
         },
         (data: any) => {
           if (Array.isArray(data) && data.length > 0) return data[0]?.power_limit_watts ?? null;
           return data?.power_limit_watts ?? null;
         },
         (data: any) => {
           const vramUsed = Array.isArray(data) && data.length > 0 ? data[0]?.vram_used_gb : data?.vram_used_gb;
           const vramTotal = Array.isArray(data) && data.length > 0 ? data[0]?.vram_total_gb : data?.vram_total_gb;
           if (vramUsed != null && vramTotal != null && vramTotal > 0) {
             return (vramUsed / vramTotal) * 100;
           }
           return null;
         },
       ],
       [true, true, false, false, false, false, true],
       500,
       120000,
       isPaused,
     );

 const storage = useStorageMetrics(isPaused);

  const ai = useAiMetrics(isPaused);

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
     cpuMaxFrequency: cpu.currentValues?.[2] ?? 0,
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
      aiLoading: ai.loading,
      aiError: ai.error,
      retryAi: ai.retry,
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
    <MetricsContext.Provider value={value}>
      {children}
    </MetricsContext.Provider>
  );
}

export function useMetricsContext(): MetricsContextValue {
  const ctx = useContext(MetricsContext);
  if (!ctx) throw new Error('useMetricsContext must be used within MetricsProvider');
  return ctx;
}
