import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithTimeout } from "../services/api";
import { slideWindow } from "../utils/slideWindow";
import type {
  MetricHistoryPoint,
  StorageHistoryPoint,
  DeviceStorageInfo,
  SystemMetrics,
} from "../types/metrics";

// ── Buffer sizes ──────────────────────────────────────────────────────────────
const CPU_BUF = 120; // 60 s @ 500 ms
const MEM_BUF = 120; // 60 s @ 500 ms
const GPU_BUF = 240; // 120 s @ 500 ms
const STORAGE_BUF = 120; // 60 s @ 500 ms
const CORE_BUF = 120;

// ── History slot initializers ─────────────────────────────────────────────────
function makeSlots(count: number, intervalMs: number): MetricHistoryPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    slot: i,
    timestamp: new Date(now - (count - i) * intervalMs),
    value: 0,
  }));
}

function makeGpuSlots(): MetricHistoryPoint[] {
  const now = Date.now();
  return Array.from({ length: GPU_BUF }, (_, i) => ({
    slot: i,
    timestamp: new Date(now - (GPU_BUF - i) * 500),
    value: 0,
  }));
}

function makeCoreSlots(): MetricHistoryPoint[] {
  const now = Date.now();
  return Array.from({ length: CORE_BUF }, (_, i) => ({
    slot: i,
    timestamp: new Date(now - (CORE_BUF - i) * 500),
    value: 0,
  }));
}

function initTrackedHistories(
  track: boolean[],
  bufSize: number,
  intervalMs: number,
): Array<MetricHistoryPoint[] | null> {
  return track.map((tracked) =>
    tracked ? makeSlots(bufSize, intervalMs) : null,
  );
}

// ── Value extractors ──────────────────────────────────────────────────────────
function computeCpuValues(data: any): Array<number | null> {
  return [
    data?.utilization_percent ?? null,
    data?.temperature_celsius ?? null,
    data?.frequency_mhz ?? null,
    data?.physical_cores ?? null,
    data?.threads ?? null,
    data?.load_1m ?? null,
    data?.load_5m ?? null,
    data?.load_15m ?? null,
    data?.freq_max_mhz ?? null,
  ];
}

function computeMemoryValues(data: any): Array<number | null> {
  return [
    data?.utilization_percent ?? null,
    data?.used_gb ?? null,
    data?.total_gb ?? null,
    data?.swap_used_gb ?? null,
    data?.swap_total_gb ?? null,
    data?.swap_total_gb && data.swap_total_gb > 0
      ? (data.swap_used_gb / data.swap_total_gb) * 100
      : null,
  ];
}

function computeGpuValues(data: any): Array<number | null> {
  const gpu = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const vramUsed = gpu?.vram_used_gb;
  const vramTotal = gpu?.vram_total_gb;
  return [
    gpu?.utilization_percent ?? null,
    gpu?.temperature_celsius ?? null,
    vramUsed ?? null,
    vramTotal ?? null,
    gpu?.power_usage_watts ?? null,
    gpu?.power_limit_watts ?? null,
    vramUsed != null && vramTotal != null && vramTotal > 0
      ? (vramUsed / vramTotal) * 100
      : null,
  ];
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function groupHistoryByDevice(
  history: StorageHistoryPoint[],
): Map<string, StorageHistoryPoint[]> {
  const grouped = new Map<string, StorageHistoryPoint[]>();
  for (const point of history) {
    const existing = grouped.get(point.device) ?? [];
    existing.push(point);
    grouped.set(point.device, existing);
  }
  for (const [device, points] of grouped.entries()) {
    points.sort((a, b) => a.slot - b.slot);
    grouped.set(device, points);
  }
  return grouped;
}

function buildDeviceBuffer(
  device: string,
  points: StorageHistoryPoint[],
  bufferSize: number,
): StorageHistoryPoint[] {
  const buffer: (StorageHistoryPoint | null)[] = new Array(bufferSize).fill(
    null,
  );
  const offset = bufferSize - points.length;
  for (let i = 0; i < points.length; i++) {
    const slotIdx = offset + i;
    if (slotIdx >= 0 && slotIdx < bufferSize) {
      buffer[slotIdx] = { ...points[i], slot: slotIdx };
    }
  }
  for (let i = 0; i < bufferSize; i++) {
    if (!buffer[i]) {
      buffer[i] = {
        device,
        slot: i,
        timestamp: new Date().toISOString(),
        read_bytes_per_sec: null,
        write_bytes_per_sec: null,
        utilization: null,
      };
    }
  }
  return buffer as StorageHistoryPoint[];
}

function buildGpuHistoryUpdater(
  gpus: any[],
  getValue: (gpu: any) => number | null,
): (
  prev: Array<MetricHistoryPoint[] | null>,
) => Array<MetricHistoryPoint[] | null> {
  return (prev) => {
    const base =
      prev.length !== gpus.length
        ? Array.from({ length: gpus.length }, () => makeGpuSlots())
        : prev;
    return base.map((h, i) => {
      if (!h) return null;
      return slideWindow(h, getValue(gpus[i]), new Date());
    });
  };
}

// ── Per-core history updater ──────────────────────────────────────────────────
// Module-level so it doesn't count toward fetchData's cognitive complexity.
function makeCoreHistoryUpdater(
  cores: any[],
  now: Date,
  slide: boolean,
): (prev: Array<MetricHistoryPoint[] | null>) => Array<MetricHistoryPoint[] | null> {
  return (prev) => {
    if (prev.length !== cores.length) {
      return Array.from({ length: cores.length }, () => makeCoreSlots());
    }
    if (!slide) return prev;
    return prev.map((h, i) =>
      h ? slideWindow(h, cores[i]?.utilization_percent ?? 0, now) : null,
    );
  };
}

// ── Which history indices to track ────────────────────────────────────────────
const CPU_TRACK = [true, true, false, false, false, false, false, false, false];
const MEM_TRACK = [true, false, false, false, false, true];
const GPU_TRACK = [true, true, false, false, false, false, true];

// ── Public interface ──────────────────────────────────────────────────────────
export interface PerGpuHistories {
  utilHistories: Array<MetricHistoryPoint[] | null>;
  tempHistories: Array<MetricHistoryPoint[] | null>;
  vramUtilHistories: Array<MetricHistoryPoint[] | null>;
}

export interface CombinedMetricsState {
  cpuValues: Array<number | null>;
  cpuHistories: Array<MetricHistoryPoint[] | null>;
  cpuRawData: any;
  perCoreCpuHistories: Array<MetricHistoryPoint[] | null>;

  memoryValues: Array<number | null>;
  memoryHistories: Array<MetricHistoryPoint[] | null>;
  memoryRawData: any;

  gpuValues: Array<number | null>;
  gpuHistories: Array<MetricHistoryPoint[] | null>;
  gpuRawData: any;
  perGpuHistories: PerGpuHistories;

  storageDevices: DeviceStorageInfo[];
  storageHistories: Map<string, StorageHistoryPoint[]>;

  systemMetrics: SystemMetrics | null;

  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCombinedMetrics(
  intervalMs = 500,
  isPaused?: boolean,
): CombinedMetricsState {
  // CPU
  const [cpuValues, setCpuValues] = useState<Array<number | null>>(() =>
    new Array(9).fill(null),
  );
  const [cpuHistories, setCpuHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >(() => initTrackedHistories(CPU_TRACK, CPU_BUF, intervalMs));
  const [cpuRawData, setCpuRawData] = useState<any>(null);
  const [perCoreCpuHistories, setPerCoreCpuHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);

  // Memory
  const [memoryValues, setMemoryValues] = useState<Array<number | null>>(() =>
    new Array(6).fill(null),
  );
  const [memoryHistories, setMemoryHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >(() => initTrackedHistories(MEM_TRACK, MEM_BUF, intervalMs));
  const [memoryRawData, setMemoryRawData] = useState<any>(null);

  // GPU
  const [gpuValues, setGpuValues] = useState<Array<number | null>>(() =>
    new Array(7).fill(null),
  );
  const [gpuHistories, setGpuHistories] = useState<
    Array<MetricHistoryPoint[] | null>
  >(() => initTrackedHistories(GPU_TRACK, GPU_BUF, intervalMs));
  const [gpuRawData, setGpuRawData] = useState<any>(null);
  const [perGpuUtil, setPerGpuUtil] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);
  const [perGpuTemp, setPerGpuTemp] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);
  const [perGpuVram, setPerGpuVram] = useState<
    Array<MetricHistoryPoint[] | null>
  >([]);

  // Storage
  const [storageDevices, setStorageDevices] = useState<DeviceStorageInfo[]>(
    [],
  );
  const [storageHistories, setStorageHistories] = useState<
    Map<string, StorageHistoryPoint[]>
  >(new Map());

  // System
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(
    null,
  );

  // Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart histories update at 1 Hz (every other 500 ms tick)
  const chartTickRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetchWithTimeout("/api/metrics/all", 1500);
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const json = await response.json();
      const now = new Date();

      const cpu = json.cpu ?? null;
      const memory = json.memory ?? null;
      const gpu = json.gpu ?? null;
      const devices: DeviceStorageInfo[] = json.storage_devices ?? [];
      const history: StorageHistoryPoint[] = json.storage_history ?? [];

      // Numeric readouts update every tick (2 Hz); chart histories update every
      // other tick (1 Hz) to halve recharts reconciliation and paint cost.
      const updateCharts = chartTickRef.current % 2 === 0;
      chartTickRef.current += 1;

      // ── Pre-compute values ────────────────────────────────────────────────
      const cpuVals = computeCpuValues(cpu);
      const memVals = computeMemoryValues(memory);
      const gpuVals = computeGpuValues(gpu);
      const cores: any[] =
        cpu?.cores && Array.isArray(cpu.cores) ? cpu.cores : [];
      const gpuSingleton: any[] = gpu ? [gpu] : [];
      const gpus: any[] = Array.isArray(gpu) ? gpu : gpuSingleton;

      // ── Numeric readouts (2 Hz) ──────────────────────────────────────────
      setCpuValues(cpuVals);
      setCpuRawData(cpu);
      setMemoryValues(memVals);
      setMemoryRawData(memory);
      setGpuValues(gpuVals);
      setGpuRawData(gpu);
      setStorageDevices(devices);
      setSystemMetrics((json.system as SystemMetrics) ?? null);
      // Per-core length reset runs every tick; slide only on even ticks.
      setPerCoreCpuHistories(makeCoreHistoryUpdater(cores, now, updateCharts));

      // ── Chart histories (1 Hz) ───────────────────────────────────────────
      if (updateCharts) {
        setCpuHistories((prev) =>
          prev.map((h, i) => (h ? slideWindow(h, cpuVals[i], now) : null)),
        );
        setMemoryHistories((prev) =>
          prev.map((h, i) => (h ? slideWindow(h, memVals[i], now) : null)),
        );
        setGpuHistories((prev) =>
          prev.map((h, i) => (h ? slideWindow(h, gpuVals[i], now) : null)),
        );
        setPerGpuUtil(
          buildGpuHistoryUpdater(gpus, (g) => g?.utilization_percent ?? null),
        );
        setPerGpuTemp(
          buildGpuHistoryUpdater(gpus, (g) => g?.temperature_celsius ?? null),
        );
        setPerGpuVram(
          buildGpuHistoryUpdater(gpus, (g) => {
            const u = g?.vram_used_gb;
            const t = g?.vram_total_gb;
            return u != null && t != null && t > 0 ? (u / t) * 100 : null;
          }),
        );
        const grouped = groupHistoryByDevice(history);
        const buffered = new Map<string, StorageHistoryPoint[]>();
        for (const [device, points] of grouped.entries()) {
          buffered.set(device, buildDeviceBuffer(device, points, STORAGE_BUF));
        }
        setStorageHistories(buffered);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    cpuValues,
    cpuHistories,
    cpuRawData,
    perCoreCpuHistories,
    memoryValues,
    memoryHistories,
    memoryRawData,
    gpuValues,
    gpuHistories,
    gpuRawData,
    perGpuHistories: {
      utilHistories: perGpuUtil,
      tempHistories: perGpuTemp,
      vramUtilHistories: perGpuVram,
    },
    storageDevices,
    storageHistories,
    systemMetrics,
    loading,
    error,
    retry,
  };
}
