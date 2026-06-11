import { useMultiMetrics } from '../hooks/useMultiMetrics';
import { useStorageMetrics } from '../hooks/useStorageMetrics';
import React, { useContext } from 'react';
import { StorageHistoryPoint } from '../types/metrics';

interface MetricsContextValue {
  cpuCurrentValues: Array<number | null>;
  memoryCurrentValues: Array<number | null>;
  gpuCurrentValues: Array<number | null>;
  cpuHistories: Array<any | null>;
  memoryHistories: Array<any | null>;
  gpuHistories: Array<any | null>;
  cpuHistory: any | null;
  memoryHistory: any | null;
  swapHistory: any | null;
  gpuHistory: any | null;
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
  retryCpu: () => void;
  retryMemory: () => void;
  retryGpu: () => void;
  retryStorage: () => void;
}

const MetricsContext = React.createContext<MetricsContextValue | null>(null);

export function MetricsProvider({ children }: { children: React.ReactNode }) {
  // console.log('[MetricsProvider] START');
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
    [true, false, false, false, false, false, false, false],
  );

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
    ],
    [true, false, false, false, false, false],
  );

  const storage = useStorageMetrics();

  const value: MetricsContextValue = {
    cpuCurrentValues: cpu.currentValues,
    memoryCurrentValues: memory.currentValues,
    gpuCurrentValues: gpu.currentValues,
    cpuHistories: cpu.histories,
    memoryHistories: memory.histories,
    gpuHistories: gpu.histories,
    cpuHistory: cpu.histories?.[0] ?? null,
    memoryHistory: memory.histories?.[0] ?? null,
    swapHistory: memory.histories?.[5] ?? null,
    gpuHistory: gpu.histories?.[0] ?? null,
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
    retryCpu: cpu.retry,
    retryMemory: memory.retry,
    retryGpu: gpu.retry,
    retryStorage: storage.retry,
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
