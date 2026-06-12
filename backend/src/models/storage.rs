//! Shared types for storage metrics.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct StorageMetrics {
    pub device: String,
    pub mount_point: String,
    pub filesystem: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub utilization_percent: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DiskIOStats {
    pub reads: u64,
    pub writes: u64,
    pub read_sectors: u64,
    pub write_sectors: u64,
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
    pub read_iops: f64,
    pub write_iops: f64,
    pub read_latency_ms: f64,
    pub write_latency_ms: f64,
    pub utilization_percent: f64,
}

#[derive(Debug, Serialize)]
pub struct DeviceStorageInfo {
    pub device: String,
    pub mounts: Vec<StorageMetrics>,
    pub io_stats: Option<DiskIOStats>,
}
