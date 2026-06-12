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
      const response = await fetch('/api/metrics/storage/devices');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data = json.data as DeviceStorageInfo[];
      if (Array.isArray(data)) {
        setStorageDevices(data);
      } else {
        setStorageDevices([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/storage/history');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const data = json.data as StorageHistoryPoint[];

      if (!Array.isArray(data) || data.length === 0) {
        return;
      }

       // Replace stale data with fresh backend buffer — prevents accumulation of old points
      const next = new Map<string, StorageHistoryPoint[]>();
      for (const point of data) {
        const device = point.device;
        if (!next.has(device)) {
          next.set(device, []);
        }
        next.get(device)!.push({ ...point, slot: point.slot });
      }
      setStorageHistories(next);
    } catch (err) {
      // Silently fail history errors - they don't affect main data
    }
  }, []);

  useEffect(() => {
    fetchStorage();
    fetchHistory();
    const interval = setInterval(() => {
      fetchStorage();
      fetchHistory();
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchStorage, fetchHistory]);

  const retry = useCallback(() => {
    fetchStorage();
    fetchHistory();
  }, [fetchStorage, fetchHistory]);

  return { storageDevices, storageHistories, loading, error, retry };
}
