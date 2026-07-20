import { useState, useEffect, useCallback } from "react";
import { DeviceStorageInfo, StorageHistoryPoint } from "../types/metrics";

// Fixed rolling buffer size for 60s window at 500ms polling
const STORAGE_BUFFER_SIZE = 120;

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

export function useStorageMetrics(isPaused?: boolean): {
  storageDevices: DeviceStorageInfo[];
  storageHistories: Map<string, StorageHistoryPoint[]>;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [storageDevices, setStorageDevices] = useState<DeviceStorageInfo[]>([]);
  const [storageHistories, setStorageHistories] = useState<
    Map<string, StorageHistoryPoint[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStorage = useCallback(async () => {
    try {
      const [devicesRes, historyRes] = await Promise.all([
        fetch("/api/metrics/storage/devices"),
        fetch("/api/metrics/storage/history"),
      ]);

      if (!devicesRes.ok) {
        throw new Error(`HTTP ${devicesRes.status}: ${devicesRes.statusText}`);
      }
      if (!historyRes.ok) {
        throw new Error(`HTTP ${historyRes.status}: ${historyRes.statusText}`);
      }

      const [devicesJson, historyJson] = await Promise.all([
        devicesRes.json(),
        historyRes.json(),
      ]);

      const devices = devicesJson.data as DeviceStorageInfo[];
      const history = historyJson.data as StorageHistoryPoint[];

      setStorageDevices(devices);
      setError(null);

      const grouped = groupHistoryByDevice(history);
      const buffered = new Map<string, StorageHistoryPoint[]>();
      for (const [device, points] of grouped.entries()) {
        buffered.set(
          device,
          buildDeviceBuffer(device, points, STORAGE_BUFFER_SIZE),
        );
      }
      setStorageHistories(buffered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Visibility-gated poll: rAF pauses in background tabs but setInterval
    // does not — this 500ms storage poll is the hottest loop in the app and
    // must not fetch or churn state while the tab is hidden. On return to
    // visibility, tick immediately so charts refresh without waiting.
    const tick = () => {
      if (!document.hidden) {
        fetchStorage();
      }
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    if (!isPaused) {
      const interval = setInterval(tick, 500);
      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", tick);
      };
    }
    return () => document.removeEventListener("visibilitychange", tick);
  }, [fetchStorage, isPaused]);

  const retry = useCallback(() => {
    fetchStorage();
  }, [fetchStorage]);

  return { storageDevices, storageHistories, loading, error, retry };
}
