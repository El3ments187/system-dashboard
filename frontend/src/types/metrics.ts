// Shared TypeScript interfaces that mirror the Rust backend models.

export interface CpuCoreInfo {
  core_id: number;
  utilization_percent: number;
}

export interface CpuMetrics {
  utilization_percent: number;
  temperature_celsius: number;
  cores: CpuCoreInfo[];
  frequency_mhz: number;
}

export interface MemoryMetrics {
  total_gb: number;
  used_gb: number;
  utilization_percent: number;
  swap_total_gb: number;
  swap_used_gb: number;
}

export interface GpuMetrics {
  name: string;
  driver_version: string;
  utilization_percent: number;
  temperature_celsius: number;
  vram_used_gb: number;
  vram_total_gb: number;
  power_usage_watts: number;
  power_limit_watts: number;
}

export interface StorageMetrics {
  device: string;
  mount_point: string;
  filesystem: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  utilization_percent: number;
}

export interface DiskIOStats {
   reads: number;
   writes: number;
   read_sectors: number;
   write_sectors: number;
   read_bytes_per_sec: number;
   write_bytes_per_sec: number;
   read_iops: number;
   write_iops: number;
   utilization_percent: number;
 }

export interface DeviceStorageInfo {
  device: string;
  io_stats: DiskIOStats | null;
  mounts: StorageMetrics[];
}

export interface SystemMetrics {
  hostname: string;
  uptime_seconds: number;
  uptime_human: string;
  last_update: string;
  kernel: string;
  os_name: string;
}

export interface MetricHistoryPoint {
   slot: number;
   timestamp: Date;
   value: number | null;
 }

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

export interface StorageHistoryPoint {
   device: string;
   slot: number;
   timestamp: string;
   read_bytes_per_sec: number;
   write_bytes_per_sec: number;
   utilization: number;
 }
