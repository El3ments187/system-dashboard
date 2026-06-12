import { useState, useEffect, useCallback } from 'react';
import { DeviceStorageInfo, StorageHistoryPoint } from '../types/metrics';

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

      setStorageHistories(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorage();
    const interval = setInterval(fetchStorage, 1000);
    return () => clearInterval(interval);
  }, [fetchStorage]);

  const retry = useCallback(() => {
    fetchStorage();
  }, [fetchStorage]);

  return { storageDevices, storageHistories, loading, error, retry };
}