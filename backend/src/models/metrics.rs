//! Shared types for all API responses.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CpuCoreInfo {
    pub core_id: usize,
    pub utilization_percent: f64,
}

#[derive(Debug, Serialize)]
pub struct CpuMetrics {
    pub utilization_percent: f64,
    pub temperature_celsius: f64,
    pub physical_cores: usize,
    pub threads: usize,
    pub load_1m: f64,
    pub load_5m: f64,
    pub load_15m: f64,
    pub cores: Vec<CpuCoreInfo>,
    pub frequency_mhz: f64,
}

#[derive(Debug, Serialize)]
pub struct MemoryMetrics {
    pub total_gb: f64,
    pub used_gb: f64,
    pub utilization_percent: f64,
    pub swap_total_gb: f64,
    pub swap_used_gb: f64,
}

#[derive(Debug, Serialize)]
pub struct GpuMetrics {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub driver_version: Option<String>,
    pub utilization_percent: f64,
    pub temperature_celsius: f64,
    pub vram_used_gb: f64,
    pub vram_total_gb: f64,
    pub power_usage_watts: f64,
    pub power_limit_watts: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clock_speed_mhz: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_clock_mhz: Option<f64>,
    pub fan_speed_rpm: f64,
}

#[derive(Debug, Serialize)]
pub struct SystemMetrics {
    pub hostname: String,
    pub uptime_seconds: f64,
    pub uptime_human: String,
    pub last_update: String,
    pub kernel: String,
    pub os_name: String,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct ApiResponse<T> {
    pub data: T,
    pub timestamp: String,
}


