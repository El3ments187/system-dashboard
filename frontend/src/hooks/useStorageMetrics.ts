import { useState, useEffect, useCallback } from 'react';
import { DeviceStorageInfo, StorageHistoryPoint } from '../types/metrics';

// Fixed rolling buffer size for 60s window at 500ms polling
const STORAGE_BUFFER_SIZE = 120;

export function useStorageMetrics(): {
  storageDevices: DeviceStorageInfo[];
  storageHistories: Map<string, StorageHistoryPoint[]>;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [storageDevices, setStorageDevices] = useState<DeviceStorageInfo[]>([]);
  const [storageHistories, setStorageHistories] = useState<Map<string, StorageHistoryPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStorage = useCallback(async () => {
    try {
      const [devicesRes, historyRes] = await Promise.all([
        fetch('/api/metrics/storage/devices'),
        fetch('/api/metrics/storage/history'),
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

      // Group history points by device
      const grouped = new Map<string, StorageHistoryPoint[]>();
      for (const point of history) {
        const existing = grouped.get(point.device) ?? [];
        existing.push(point);
        grouped.set(point.device, existing);
      }

      // Sort each device's history by slot ascending (oldest first)
      for (const [device, points] of grouped.entries()) {
        points.sort((a, b) => a.slot - b.slot);
        grouped.set(device, points);
      }

      // Build fixed-size rolling buffer per device with null placeholders
      const buffered = new Map<string, StorageHistoryPoint[]>();
      for (const [device, points] of grouped.entries()) {
        // Create a fixed-size array indexed by slot position
        const buffer: (StorageHistoryPoint | null)[] = new Array(STORAGE_BUFFER_SIZE).fill(null);

        // Place real data at the correct slot positions
        // Backend sends slots 0..N-1 where N is the number of collected samples.
        // Map them to the rightmost positions so the chart fills left-to-right.
        const offset = STORAGE_BUFFER_SIZE - points.length;
        for (let i = 0; i < points.length; i++) {
          const slotIdx = offset + i;
          if (slotIdx >= 0 && slotIdx < STORAGE_BUFFER_SIZE) {
            const pt = { ...points[i], slot: slotIdx };
            buffer[slotIdx] = pt;
          }
        }

        // Fill null slots with placeholder entries to maintain fixed chart width
        for (let i = 0; i < STORAGE_BUFFER_SIZE; i++) {
          if (!buffer[i]) {
            buffer[i] = {
              device,
              slot: i,
              timestamp: new Date().toISOString(),
              read_bytes_per_sec: null as any,
              write_bytes_per_sec: null as any,
              utilization: null as any,
            };
          }
        }

        buffered.set(device, buffer as StorageHistoryPoint[]);
      }

      setStorageHistories(buffered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorage();
    const interval = setInterval(fetchStorage, 500);
    return () => clearInterval(interval);
  }, [fetchStorage]);

  const retry = useCallback(() => {
    fetchStorage();
  }, [fetchStorage]);

  return { storageDevices, storageHistories, loading, error, retry };
}