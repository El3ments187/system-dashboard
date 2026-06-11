import { CpuMetrics, MemoryMetrics, GpuMetrics, StorageMetrics, DeviceStorageInfo, SystemMetrics } from '../types/metrics';

const BASE_URL = '/api';

async function fetchMetrics<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as T;
}

export async function getCpuMetrics(): Promise<CpuMetrics> {
  return fetchMetrics<CpuMetrics>('/metrics/cpu');
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  return fetchMetrics<MemoryMetrics>('/metrics/memory');
}

export async function getGpuMetrics(): Promise<GpuMetrics> {
  return fetchMetrics<GpuMetrics>('/metrics/gpu');
}

export async function getStorageMetrics(): Promise<StorageMetrics[]> {
  return fetchMetrics<StorageMetrics[]>('/metrics/storage');
}

export async function getStorageDevices(): Promise<DeviceStorageInfo[]> {
  return fetchMetrics<DeviceStorageInfo[]>('/metrics/storage/devices');
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return fetchMetrics<SystemMetrics>('/metrics/system');
}

export async function checkHealth(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}
