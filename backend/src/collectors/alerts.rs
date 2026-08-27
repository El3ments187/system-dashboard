//! Alert generation for backend and data collection failures only.
//!
//! Alerts are NOT generated for:
//! - Threshold-based monitoring (high CPU, memory, disk, GPU usage)
//! - Normal operation (successful NVML, healthy collectors)
//!
//! Alerts are generated ONLY for:
//! - Backend failures (requests failing, server errors)
//! - Data collection failures (collectors returning errors)
//! - Missing metrics (required data unavailable)
//! - Fallback backends (NVML unavailable, using nvidia-smi)

use serde::Serialize;

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Warning,
    Error,
}

#[derive(Debug, Serialize, Clone)]
pub struct Alert {
    pub id: u64,
    pub severity: AlertSeverity,
    pub subsystem: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AlertResponse {
    pub alerts: Vec<Alert>,
}

use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};

static ALERT_COUNTER: Mutex<u64> = Mutex::new(0);
static SENT_ALERTS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn next_alert_id() -> u64 {
    let mut counter = ALERT_COUNTER.lock().unwrap();
    *counter += 1;
    *counter
}

fn alert_signature(subsystem: &str, message: &str) -> String {
    format!("{subsystem}:{message}")
}

fn is_already_sent(subsystem: &str, message: &str) -> bool {
    let sent = SENT_ALERTS.lock().unwrap();
    sent.contains(&alert_signature(subsystem, message))
}

fn mark_as_sent(subsystem: &str, message: &str) {
    let mut sent = SENT_ALERTS.lock().unwrap();
    sent.insert(alert_signature(subsystem, message));
}

fn clear_sent_alerts() {
    let mut sent = SENT_ALERTS.lock().unwrap();
    sent.clear();
}

/// Track collector failures for alert generation.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum CollectorStatus {
    Ok,
    Error(String),
    Partial(String),
}

/// Check GPU backend status and generate alerts for failures only.
/// NVML working is normal operation — no alert.
#[must_use]
pub fn check_gpu_backend_status() -> Vec<Alert> {
    let mut alerts = Vec::new();
    let (backend_type, _nvml_available) = crate::collectors::gpu::get_gpu_backend_info();

    if backend_type == "nvidia-smi" {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "gpu".to_string(),
            message: "NVML unavailable — using nvidia-smi fallback".to_string(),
        });
    } else if backend_type != "nvml" {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Error,
            subsystem: "gpu".to_string(),
            message: "GPU metrics unavailable".to_string(),
        });
    }

    alerts
}

/// Check GPU metrics for missing data (when metrics cannot be obtained).
#[must_use]
pub fn check_gpu_missing_metrics(gpu: &crate::models::metrics::GpuMetrics) -> Vec<Alert> {
    let mut alerts = Vec::new();

    // Check if this is the default GPU (no GPU detected)
    if gpu.name == "No GPU detected" {
        return alerts;
    }

    // Missing power metric
    if gpu.power_usage_watts == 0.0 && gpu.power_limit_watts == 0.0 {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "gpu".to_string(),
            message: "GPU power metric unavailable".to_string(),
        });
    }

    // Missing clock metrics
    if gpu.clock_speed_mhz.is_none() {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "gpu".to_string(),
            message: "GPU clock unavailable".to_string(),
        });
    }

    alerts
}

/// Check CPU metrics for data collection failures.
#[must_use]
pub fn check_cpu_collector_status(status: &CollectorStatus) -> Vec<Alert> {
    let mut alerts = Vec::new();

    match status {
        CollectorStatus::Error(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Error,
                subsystem: "cpu".to_string(),
                message: format!("CPU collector failed: {msg}"),
            });
        }
        CollectorStatus::Partial(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Warning,
                subsystem: "cpu".to_string(),
                message: format!("CPU collector returned partial data: {msg}"),
            });
        }
        CollectorStatus::Ok => {}
    }

    alerts
}

/// Check memory metrics for data collection failures.
#[must_use]
pub fn check_memory_collector_status(status: &CollectorStatus) -> Vec<Alert> {
    let mut alerts = Vec::new();

    match status {
        CollectorStatus::Error(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Error,
                subsystem: "memory".to_string(),
                message: format!("Memory collector failed: {msg}"),
            });
        }
        CollectorStatus::Partial(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Warning,
                subsystem: "memory".to_string(),
                message: format!("Memory collector returned partial data: {msg}"),
            });
        }
        CollectorStatus::Ok => {}
    }

    alerts
}

/// Check GPU collector status for data collection failures.
#[must_use]
pub fn check_gpu_collector_status(status: &CollectorStatus) -> Vec<Alert> {
    let mut alerts = Vec::new();

    match status {
        CollectorStatus::Error(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Error,
                subsystem: "gpu".to_string(),
                message: format!("GPU collector failed: {msg}"),
            });
        }
        CollectorStatus::Partial(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Warning,
                subsystem: "gpu".to_string(),
                message: format!("GPU collector returned partial data: {msg}"),
            });
        }
        CollectorStatus::Ok => {}
    }

    alerts
}

/// Check storage metrics for data collection failures.
#[must_use]
pub fn check_storage_collector_status(status: &CollectorStatus) -> Vec<Alert> {
    let mut alerts = Vec::new();

    match status {
        CollectorStatus::Error(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Error,
                subsystem: "storage".to_string(),
                message: format!("Storage collector failed: {msg}"),
            });
        }
        CollectorStatus::Partial(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Warning,
                subsystem: "storage".to_string(),
                message: format!("Storage collector returned partial data: {msg}"),
            });
        }
        CollectorStatus::Ok => {}
    }

    alerts
}

/// Check AI metrics for service availability failures.
#[must_use]
pub fn check_ai_collector_status(status: &CollectorStatus) -> Vec<Alert> {
    let mut alerts = Vec::new();

    match status {
        CollectorStatus::Error(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Error,
                subsystem: "ai".to_string(),
                message: format!("AI collector failed: {msg}"),
            });
        }
        CollectorStatus::Partial(msg) => {
            alerts.push(Alert {
                id: next_alert_id(),
                severity: AlertSeverity::Warning,
                subsystem: "ai".to_string(),
                message: format!("AI collector returned partial data: {msg}"),
            });
        }
        CollectorStatus::Ok => {}
    }

    alerts
}

/// Check AI service availability and generate alerts for unavailable services.
#[must_use]
pub fn check_ai_service_availability(
    llama_available: bool,
    openwebui_available: bool,
    opencode_available: bool,
    comfyui_available: bool,
) -> Vec<Alert> {
    let mut alerts = Vec::new();

    if !llama_available {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "ai".to_string(),
            message: "llama-server is unavailable".to_string(),
        });
    }

    if !openwebui_available {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "ai".to_string(),
            message: "OpenWebUI is unavailable".to_string(),
        });
    }

    if !opencode_available {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "ai".to_string(),
            message: "OpenCode is unavailable".to_string(),
        });
    }

    if !comfyui_available {
        alerts.push(Alert {
            id: next_alert_id(),
            severity: AlertSeverity::Warning,
            subsystem: "ai".to_string(),
            message: "ComfyUI is unavailable".to_string(),
        });
    }

    alerts
}

/// Check all metrics and return combined alerts for failures only.
#[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
#[must_use]
pub fn check_all_alerts(
    cpu_status: CollectorStatus,
    mem_status: CollectorStatus,
    gpu: Option<&crate::models::metrics::GpuMetrics>,
    gpu_status: CollectorStatus,
    storages_status: CollectorStatus,
    ai_collector_status: CollectorStatus,
    llama_available: bool,
    openwebui_available: bool,
    opencode_available: bool,
    comfyui_available: bool,
) -> Vec<Alert> {
    let mut alerts = Vec::new();

    // GPU backend status alerts (deduplicated)
    for alert in check_gpu_backend_status() {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // GPU missing metrics alerts (deduplicated)
    if let Some(gpu) = gpu {
        for alert in check_gpu_missing_metrics(gpu) {
            if !is_already_sent(&alert.subsystem, &alert.message) {
                mark_as_sent(&alert.subsystem, &alert.message);
                alerts.push(alert);
            }
        }
    }

    // GPU collector status alerts (deduplicated)
    for alert in check_gpu_collector_status(&gpu_status) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // CPU collector status alerts (deduplicated)
    for alert in check_cpu_collector_status(&cpu_status) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // Memory collector status alerts (deduplicated)
    for alert in check_memory_collector_status(&mem_status) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // Storage collector status alerts (deduplicated)
    for alert in check_storage_collector_status(&storages_status) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // AI collector status alerts (deduplicated)
    for alert in check_ai_collector_status(&ai_collector_status) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    // AI service availability alerts (deduplicated)
    for alert in check_ai_service_availability(
        llama_available,
        openwebui_available,
        opencode_available,
        comfyui_available,
    ) {
        if !is_already_sent(&alert.subsystem, &alert.message) {
            mark_as_sent(&alert.subsystem, &alert.message);
            alerts.push(alert);
        }
    }

    alerts
}

/// Clear all sent alert tracking (call when alerts are acknowledged/cleared).
pub fn clear_alert_tracking() {
    clear_sent_alerts();
}
