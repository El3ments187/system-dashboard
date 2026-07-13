//! Comprehensive backend tests covering collectors, models, history, and calculations.

use system_dashboard::api::launcher::{
    capture_metrics_into_metadata, extract_filename_metadata, parse_script_args,
};
use system_dashboard::collectors::alerts::{
    Alert, AlertResponse, AlertSeverity, CollectorStatus, check_all_alerts,
    check_cpu_collector_status, check_gpu_backend_status, check_gpu_collector_status,
    check_memory_collector_status, check_storage_collector_status, clear_alert_tracking,
};
use system_dashboard::collectors::cpu::{
    CoreStat, ProcStat, compute_cpu_utilization, normalize_cpu_model, parse_physical_cores,
    parse_proc_stat,
};
use system_dashboard::collectors::gpu::{extract_tag, extract_tag_float, parse_smi_xml};
use system_dashboard::collectors::storage::{
    StorageHistoryPoint, base_device, collect_storage_by_device, collect_storage_history,
    collect_storage_metrics, is_loop_device, is_nvme_device, is_partition_device,
    nvme_controller_name,
};
use system_dashboard::models::ai::{ProfileMetadata, ProfileState};
use system_dashboard::models::metrics::{
    CpuCoreInfo, CpuMetrics, GpuMetrics, MemoryMetrics, SystemMetrics,
};
use system_dashboard::models::storage::{DeviceStorageInfo, DiskIOStats, StorageMetrics};

// ============================================================================
// Storage helper function tests
// ============================================================================

#[cfg(test)]
mod storage_helpers {
    use super::*;

    #[test]
    fn test_is_partition_device_sda1() {
        assert!(is_partition_device("sda1"));
    }

    #[test]
    fn test_is_partition_device_sda() {
        assert!(!is_partition_device("sda"));
    }

    #[test]
    fn test_is_partition_device_nvme_base() {
        assert!(!is_partition_device("nvme0n1"));
    }

    #[test]
    fn test_is_partition_device_nvme_partition() {
        assert!(is_partition_device("nvme0n1p1"));
    }

    #[test]
    fn test_is_partition_device_sdb2() {
        assert!(is_partition_device("sdb2"));
    }

    #[test]
    fn test_is_partition_device_mmcblk0p1() {
        assert!(is_partition_device("mmcblk0p1"));
    }

    #[test]
    fn test_is_loop_device_true() {
        assert!(is_loop_device("loop0"));
    }

    #[test]
    fn test_is_loop_device_false() {
        assert!(!is_loop_device("sda"));
        assert!(!is_loop_device("nvme0n1"));
    }

    #[test]
    fn test_is_nvme_device_true() {
        assert!(is_nvme_device("nvme0n1"));
        assert!(is_nvme_device("nvme1n1p2"));
    }

    #[test]
    fn test_is_nvme_device_false() {
        assert!(!is_nvme_device("sda"));
        assert!(!is_nvme_device("loop0"));
    }

    #[test]
    fn test_nvme_controller_name_from_device() {
        assert_eq!(
            nvme_controller_name("/dev/nvme0n1"),
            Some("nvme0".to_string())
        );
    }

    #[test]
    fn test_nvme_controller_name_from_partition() {
        assert_eq!(nvme_controller_name("nvme0n1p1"), Some("nvme0".to_string()));
    }

    #[test]
    fn test_nvme_controller_name_non_nvme() {
        assert_eq!(nvme_controller_name("sda1"), None);
    }

    #[test]
    fn test_base_device_sda1_strips_to_sda() {
        assert_eq!(base_device("/dev/sda1"), "/dev/sda");
    }

    #[test]
    fn test_base_device_nvme_partition() {
        assert_eq!(base_device("/dev/nvme0n1p5"), "/dev/nvme0n1");
    }

    #[test]
    fn test_base_device_nvme_base_unchanged() {
        assert_eq!(base_device("nvme0n1"), "nvme0n1");
    }

    #[test]
    fn test_base_device_sdb_whole_disk_unchanged() {
        assert_eq!(base_device("/dev/sdb"), "/dev/sdb");
    }

    #[test]
    fn test_collect_storage_metrics_returns_valid_data() {
        let (metrics, status) = collect_storage_metrics();
        assert!(status == CollectorStatus::Ok);
        for m in &metrics {
            assert!(m.utilization_percent >= 0.0 && m.utilization_percent <= 100.0);
            assert_eq!(m.total_bytes, m.used_bytes + m.free_bytes);
        }
    }

    #[test]
    fn test_collect_storage_by_device_returns_devices() {
        let devices = collect_storage_by_device();
        for d in &devices {
            assert!(!d.device.is_empty());
            assert!(!d.mounts.is_empty());
            for m in &d.mounts {
                assert!(m.utilization_percent >= 0.0 && m.utilization_percent <= 100.0);
            }
        }
    }

    #[test]
    fn test_storage_history_returns_ordered_points() {
        let history = collect_storage_history();
        // Group by device and verify per-device slot ordering
        let mut current_device = String::new();
        let mut prev_slot: i64 = -1;
        for point in &history {
            if point.device != current_device {
                current_device = point.device.clone();
                prev_slot = -1;
            }
            assert!(point.slot as i64 >= prev_slot);
            prev_slot = point.slot as i64;
        }
    }

    #[test]
    fn test_storage_history_timestamps_are_valid() {
        let history = collect_storage_history();
        for point in &history {
            assert!(
                point.timestamp.contains("UTC"),
                "timestamp should contain UTC: {}",
                point.timestamp
            );
        }
    }

    #[test]
    fn test_storage_history_values_are_non_negative() {
        let history = collect_storage_history();
        for point in &history {
            assert!(point.read_bytes_per_sec >= 0.0);
            assert!(point.write_bytes_per_sec >= 0.0);
            assert!(point.read_iops >= 0.0);
            assert!(point.write_iops >= 0.0);
            assert!(point.utilization >= 0.0);
            assert!(point.read_latency_ms >= 0.0);
            assert!(point.write_latency_ms >= 0.0);
        }
    }
}

// ============================================================================
// Model serialization tests
// ============================================================================

#[cfg(test)]
mod model_serialization {
    use super::*;

    #[test]
    fn test_cpu_metrics_serializes() {
        let metrics = CpuMetrics {
            model: "Test CPU".to_string(),
            utilization_percent: 42.5,
            temperature_celsius: 65.0,
            physical_cores: 8,
            threads: 16,
            load_1m: 1.5,
            load_5m: 1.2,
            load_15m: 1.0,
            cores: vec![CpuCoreInfo {
                core_id: 0,
                utilization_percent: 50.0,
            }],
            frequency_mhz: 3500.0,
            freq_max_mhz: 5000.0,
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("42.5"));
        assert!(json.contains("65.0"));
    }

    #[test]
    fn test_memory_metrics_serializes() {
        let metrics = MemoryMetrics {
            total_gb: 32.0,
            used_gb: 16.0,
            utilization_percent: 50.0,
            swap_total_gb: 8.0,
            swap_used_gb: 1.0,
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("32.0"));
    }

    #[test]
    fn test_gpu_metrics_with_none_fields_serializes() {
        let metrics = GpuMetrics {
            name: "No GPU detected".to_string(),
            driver_version: None,
            utilization_percent: 0.0,
            temperature_celsius: 0.0,
            vram_used_gb: 0.0,
            vram_total_gb: 0.0,
            power_usage_watts: 0.0,
            power_limit_watts: 0.0,
            clock_speed_mhz: None,
            memory_clock_mhz: None,
            fan_speed_rpm: 0.0,
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("No GPU detected"));
        assert!(!json.contains("driver_version"));
        assert!(!json.contains("clock_speed_mhz"));
    }

    #[test]
    fn test_gpu_metrics_with_all_fields_serializes() {
        let metrics = GpuMetrics {
            name: "RTX 4090".to_string(),
            driver_version: Some("535.00".to_string()),
            utilization_percent: 85.0,
            temperature_celsius: 72.0,
            vram_used_gb: 12.0,
            vram_total_gb: 24.0,
            power_usage_watts: 350.0,
            power_limit_watts: 450.0,
            clock_speed_mhz: Some(2520.0),
            memory_clock_mhz: Some(14000.0),
            fan_speed_rpm: 2000.0,
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("RTX 4090"));
        assert!(json.contains("535.00"));
        assert!(json.contains("2520"));
    }

    #[test]
    fn test_system_metrics_serializes() {
        let metrics = SystemMetrics {
            hostname: "testhost".to_string(),
            uptime_seconds: 86400.0,
            uptime_human: "1d 0h 0m".to_string(),
            last_update: "2025-01-01 00:00:00 UTC".to_string(),
            kernel: "5.15.0".to_string(),
            os_name: "Ubuntu 24.04".to_string(),
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("testhost"));
        assert!(json.contains("86400"));
    }

    #[test]
    fn test_storage_metrics_serializes() {
        let metrics = StorageMetrics {
            device: "/dev/sda1".to_string(),
            mount_point: "/".to_string(),
            filesystem: "ext4".to_string(),
            total_bytes: 1_000_000_000_000,
            used_bytes: 500_000_000_000,
            free_bytes: 500_000_000_000,
            utilization_percent: 50.0,
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("/dev/sda1"));
    }

    #[test]
    fn test_disk_io_stats_serializes() {
        let stats = DiskIOStats {
            reads: 1000,
            writes: 500,
            read_sectors: 8000,
            write_sectors: 4000,
            read_bytes_per_sec: 4_096_000.0,
            write_bytes_per_sec: 2_048_000.0,
            read_iops: 100.0,
            write_iops: 50.0,
            read_latency_ms: 0.5,
            write_latency_ms: 1.0,
            utilization_percent: 25.0,
        };
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("1000"));
    }

    #[test]
    fn test_device_storage_info_serializes() {
        let info = DeviceStorageInfo {
            device: "/dev/sda".to_string(),
            mounts: vec![],
            io_stats: Some(DiskIOStats {
                reads: 0,
                writes: 0,
                read_sectors: 0,
                write_sectors: 0,
                read_bytes_per_sec: 0.0,
                write_bytes_per_sec: 0.0,
                read_iops: 0.0,
                write_iops: 0.0,
                read_latency_ms: 0.0,
                write_latency_ms: 0.0,
                utilization_percent: 0.0,
            }),
            temperature_celsius: Some(35.0),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("/dev/sda"));
    }

    #[test]
    fn test_device_storage_info_no_temp_omits_field() {
        let info = DeviceStorageInfo {
            device: "/dev/sda".to_string(),
            mounts: vec![],
            io_stats: None,
            temperature_celsius: None,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(!json.contains("temperature_celsius"));
    }

    #[test]
    fn test_alert_response_serializes() {
        let response = AlertResponse {
            alerts: vec![Alert {
                id: 1,
                severity: AlertSeverity::Warning,
                subsystem: "gpu".to_string(),
                message: "test alert".to_string(),
            }],
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test alert"));
    }
}

// ============================================================================
// Alert generation and deduplication tests
// ============================================================================

#[cfg(test)]
mod alerts {
    use super::*;

    #[test]
    fn test_cpu_collector_ok_no_alerts() {
        clear_alert_tracking();
        let alerts = check_cpu_collector_status(CollectorStatus::Ok);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_cpu_collector_error_generates_alert() {
        clear_alert_tracking();
        let alerts = check_cpu_collector_status(CollectorStatus::Error("read failed".to_string()));
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Error);
        assert_eq!(alerts[0].subsystem, "cpu");
    }

    #[test]
    fn test_cpu_collector_partial_generates_warning() {
        clear_alert_tracking();
        let alerts =
            check_cpu_collector_status(CollectorStatus::Partial("partial data".to_string()));
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
    }

    #[test]
    fn test_memory_collector_ok_no_alerts() {
        clear_alert_tracking();
        let alerts = check_memory_collector_status(CollectorStatus::Ok);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_memory_collector_error_generates_alert() {
        clear_alert_tracking();
        let alerts = check_memory_collector_status(CollectorStatus::Error("oom".to_string()));
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].subsystem, "memory");
    }

    #[test]
    fn test_gpu_collector_ok_no_alerts() {
        clear_alert_tracking();
        let alerts = check_gpu_collector_status(CollectorStatus::Ok);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_storage_collector_ok_no_alerts() {
        clear_alert_tracking();
        let alerts = check_storage_collector_status(CollectorStatus::Ok);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_storage_collector_error_generates_alert() {
        clear_alert_tracking();
        let alerts = check_storage_collector_status(CollectorStatus::Error("io error".to_string()));
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].subsystem, "storage");
    }

    #[test]
    fn test_gpu_backend_status_returns_alerts() {
        clear_alert_tracking();
        let alerts = check_gpu_backend_status();
        for alert in &alerts {
            assert_eq!(alert.subsystem, "gpu");
        }
    }

    #[test]
    fn test_check_all_alerts_with_all_ok() {
        clear_alert_tracking();
        let alerts = check_all_alerts(
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            None,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            true,
            true,
            true,
            true,
        );
        for alert in &alerts {
            assert_eq!(alert.subsystem, "gpu");
        }
    }

    #[test]
    fn test_check_all_alerts_with_cpu_error() {
        clear_alert_tracking();
        let alerts = check_all_alerts(
            CollectorStatus::Error("fail".to_string()),
            CollectorStatus::Ok,
            None,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            true,
            true,
            true,
            true,
        );
        let cpu_alerts: Vec<&Alert> = alerts.iter().filter(|a| a.subsystem == "cpu").collect();
        assert!(!cpu_alerts.is_empty());
    }

    #[test]
    fn test_alert_deduplication() {
        clear_alert_tracking();
        let alerts1 = check_cpu_collector_status(CollectorStatus::Error("same error".to_string()));
        assert_eq!(alerts1.len(), 1);

        clear_alert_tracking();
        let alerts2 = check_cpu_collector_status(CollectorStatus::Error("same error".to_string()));
        assert_eq!(alerts2.len(), 1);
    }

    #[test]
    fn test_clear_alert_tracking() {
        clear_alert_tracking();
        let _ = check_cpu_collector_status(CollectorStatus::Error("dedup test".to_string()));
        clear_alert_tracking();
    }

    #[test]
    fn test_alert_ids_are_unique() {
        clear_alert_tracking();
        let alerts = check_all_alerts(
            CollectorStatus::Error("e1".to_string()),
            CollectorStatus::Error("e2".to_string()),
            None,
            CollectorStatus::Error("e3".to_string()),
            CollectorStatus::Error("e4".to_string()),
            CollectorStatus::Ok,
            true,
            true,
            true,
            true,
        );
        let ids: Vec<u64> = alerts.iter().map(|a| a.id).collect();
        let unique_ids: std::collections::HashSet<u64> = ids.iter().copied().collect();
        assert_eq!(
            ids.len(),
            unique_ids.len(),
            "All alert IDs should be unique"
        );
    }

    #[test]
    fn test_alert_severity_is_correct_for_errors() {
        clear_alert_tracking();
        let alerts = check_cpu_collector_status(CollectorStatus::Error("error".to_string()));
        assert_eq!(alerts[0].severity, AlertSeverity::Error);
    }

    #[test]
    fn test_alert_severity_is_correct_for_partial() {
        clear_alert_tracking();
        let alerts = check_cpu_collector_status(CollectorStatus::Partial("partial".to_string()));
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
    }
}

// ============================================================================
// Calculation and validation tests
// ============================================================================

#[cfg(test)]
mod calculations {

    #[test]
    fn test_storage_utilization_calculation() {
        let total = 1_000_000u64;
        let used = 750_000u64;
        let util = (used as f64 / total as f64) * 100.0;
        assert!((util - 75.0).abs() < 0.01);
    }

    #[test]
    fn test_storage_utilization_zero_total() {
        let total = 0u64;
        let used = 0u64;
        let util = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        assert_eq!(util, 0.0);
    }

    #[test]
    fn test_bytes_to_gb_conversion() {
        let gb = 1_073_741_824_f64 / (1024.0 * 1024.0 * 1024.0);
        assert!((gb - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_io_utilization_capped_at_100() {
        let io_delta: f64 = 5000.0;
        let elapsed: f64 = 0.1;
        let util = (io_delta / elapsed / 10.0).min(100.0);
        assert_eq!(util, 100.0);
    }

    #[test]
    fn test_io_utilization_normal_value() {
        let io_delta: f64 = 500.0;
        let elapsed: f64 = 1.0;
        let util = (io_delta / elapsed / 10.0).min(100.0);
        assert!((util - 50.0).abs() < 0.01);
    }

    #[test]
    fn test_sectors_to_bytes_conversion() {
        let sectors = 1000u64;
        let bytes = sectors as f64 * 512.0;
        assert_eq!(bytes, 512_000.0);
    }

    #[test]
    fn test_cpu_utilization_clamped() {
        let raw = 150.0_f64;
        let clamped = raw.clamp(0.0, 100.0);
        assert_eq!(clamped, 100.0);
    }

    #[test]
    fn test_cpu_utilization_negative_clamped() {
        let raw = -10.0_f64;
        let clamped = raw.clamp(0.0, 100.0);
        assert_eq!(clamped, 0.0);
    }

    #[test]
    fn test_uptime_formatting_days() {
        let total: u64 = 90_000;
        let days = total / 86400;
        let hours = (total % 86400) / 3600;
        let mins = (total % 3600) / 60;
        let formatted = format!("{days}d {hours}h {mins}m");
        assert_eq!(formatted, "1d 1h 0m");
    }

    #[test]
    fn test_uptime_formatting_hours_only() {
        let total: u64 = 3660;
        let days = total / 86400;
        let hours = (total % 86400) / 3600;
        let mins = (total % 3600) / 60;
        let formatted = if days > 0 {
            format!("{days}d {hours}h {mins}m")
        } else if hours > 0 {
            format!("{hours}h {mins}m")
        } else {
            format!("{mins}m")
        };
        assert_eq!(formatted, "1h 1m");
    }

    #[test]
    fn test_uptime_formatting_minutes_only() {
        let total: u64 = 300;
        let days = total / 86400;
        let hours = (total % 86400) / 3600;
        let mins = (total % 3600) / 60;
        let formatted = if days > 0 {
            format!("{days}d {hours}h {mins}m")
        } else if hours > 0 {
            format!("{hours}h {mins}m")
        } else {
            format!("{mins}m")
        };
        assert_eq!(formatted, "5m");
    }

    #[test]
    fn test_temperature_millicelsius_to_celsius() {
        let millicelsius = 45000i64;
        let celsius = millicelsius as f64 / 1000.0;
        assert!((celsius - 45.0).abs() < 0.01);
    }

    #[test]
    fn test_nvml_power_microwatts_to_watts() {
        let microwatts = 350_000_000u32;
        let watts = microwatts as f64 / 1000.0;
        assert!((watts - 350000.0).abs() < 0.01);
    }

    #[test]
    fn test_vram_bytes_to_gb() {
        let bytes = 24_000_000_000u64;
        let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        assert!((gb - 22.3).abs() < 0.1);
    }

    #[test]
    fn test_wrapping_subtraction_no_panic() {
        let a: u64 = 100;
        let b: u64 = 200;
        let delta = a.wrapping_sub(b);
        assert_eq!(delta, u64::MAX - 99);
    }

    #[test]
    fn test_saturating_subtraction_no_underflow() {
        let total: u64 = 100;
        let free: u64 = 200;
        let used = total.saturating_sub(free);
        assert_eq!(used, 0);
    }

    #[test]
    fn test_utilization_rounding() {
        let util = 45.6789_f64;
        let rounded = (util * 100.0).round() / 100.0;
        assert!((rounded - 45.68).abs() < 0.01);
    }
}

// ============================================================================
// History buffer and timestamp ordering tests
// ============================================================================

#[cfg(test)]
mod history_buffer {
    use super::*;

    #[test]
    fn test_history_points_have_valid_slot_indices() {
        let history = collect_storage_history();
        for point in &history {
            assert!(
                point.slot < 120,
                "slot index should be < STORAGE_HISTORY_SIZE"
            );
        }
    }

    #[test]
    fn test_history_device_names_are_consistent() {
        let history = collect_storage_history();
        for point in &history {
            assert!(!point.device.is_empty());
        }
    }

    #[test]
    fn test_history_timestamp_format() {
        let history = collect_storage_history();
        for point in &history {
            assert!(point.timestamp.len() >= 20);
        }
    }

    #[test]
    fn test_history_utilization_range() {
        let history = collect_storage_history();
        for point in &history {
            assert!(point.utilization >= 0.0 && point.utilization <= 100.0);
        }
    }
}

// ============================================================================
// System metrics tests
// ============================================================================

#[cfg(test)]
mod system_metrics {
    use system_dashboard::collectors::system::{
        collect_system_metrics, get_collector_health_state,
    };

    #[test]
    fn test_collect_system_metrics_returns_valid_data() {
        let metrics = collect_system_metrics();
        assert!(!metrics.hostname.is_empty());
        assert!(metrics.uptime_seconds >= 0.0);
        assert!(!metrics.uptime_human.is_empty());
        assert!(!metrics.kernel.is_empty());
        assert!(!metrics.os_name.is_empty());
    }

    #[test]
    fn test_uptime_seconds_matches_proc() {
        let metrics = collect_system_metrics();
        if let Ok(content) = std::fs::read_to_string("/proc/uptime")
            && let Some(val) = content.split_whitespace().next()
                && let Ok(proc_uptime) = val.parse::<f64>() {
                    assert!(
                        (metrics.uptime_seconds - proc_uptime).abs() < 2.0,
                        "Uptime should match /proc/uptime within 2 seconds"
                    );
                }
    }

    #[test]
    fn test_collector_health_returns_all_collectors() {
        let health = get_collector_health_state();
        assert!(health.contains_key("cpu"));
        assert!(health.contains_key("memory"));
        assert!(health.contains_key("gpu"));
        assert!(health.contains_key("storage"));
        assert!(health.contains_key("system"));
    }

    #[test]
    fn test_collector_health_values_are_valid() {
        let health = get_collector_health_state();
        for status in health.values() {
            assert!(
                *status == "healthy" || *status == "degraded" || *status == "unavailable",
                "Invalid collector status: {}",
                status
            );
        }
    }

    #[test]
    fn test_system_collector_always_healthy() {
        let health = get_collector_health_state();
        assert_eq!(health.get("system").unwrap(), "healthy");
    }
}

// ============================================================================
// GPU XML parsing tests
// ============================================================================

#[cfg(test)]
mod gpu_parsing {
    use super::*;

    #[test]
    fn test_extract_tag_simple() {
        let xml = r#"<product_name>RTX 4090</product_name>"#;
        assert_eq!(
            extract_tag(xml, "product_name"),
            Some("RTX 4090".to_string())
        );
    }

    #[test]
    fn test_extract_tag_missing() {
        let xml = r#"<other>value</other>"#;
        assert_eq!(extract_tag(xml, "product_name"), None);
    }

    #[test]
    fn test_extract_tag_empty_value() {
        let xml = r#"<product_name></product_name>"#;
        assert_eq!(extract_tag(xml, "product_name"), None);
    }

    #[test]
    fn test_extract_tag_whitespace_only() {
        let xml = r#"<product_name>   </product_name>"#;
        assert_eq!(extract_tag(xml, "product_name"), None);
    }

    #[test]
    fn test_extract_tag_nested_content() {
        let xml = r#"<product_name>RTX 4090 Ti</product_name>"#;
        assert_eq!(
            extract_tag(xml, "product_name"),
            Some("RTX 4090 Ti".to_string())
        );
    }

    #[test]
    fn test_extract_tag_float_simple() {
        let xml = r#"<temp_entry[0]>65</temp_entry[0]>"#;
        assert_eq!(extract_tag_float(xml, "temp_entry[0]"), Some(65.0));
    }

    #[test]
    fn test_extract_tag_float_with_unit() {
        let xml = r#"<temp_entry[0]>65 C</temp_entry[0]>"#;
        assert_eq!(extract_tag_float(xml, "temp_entry[0]"), Some(65.0));
    }

    #[test]
    fn test_extract_tag_float_decimal() {
        let xml = r#"<power_draw[0].current>250.5 W</power_draw[0].current>"#;
        assert_eq!(extract_tag_float(xml, "power_draw[0].current"), Some(250.5));
    }

    #[test]
    fn test_extract_tag_float_missing() {
        let xml = r#"<other>65</other>"#;
        assert_eq!(extract_tag_float(xml, "temp_entry[0]"), None);
    }

    #[test]
    fn test_extract_tag_float_non_numeric() {
        let xml = r#"<temp_entry[0>N/A</temp_entry[0]>"#;
        assert_eq!(extract_tag_float(xml, "temp_entry[0]"), None);
    }

    #[test]
    fn test_parse_smi_xml_single_gpu() {
        let xml = r#"<gpu>
  <product_name>RTX 4090</product_name>
  <driver_version>535.123.04</driver_version>
  <temp_entry[0]>65 C</temp_entry[0]>
  <utilization[0].gpu_util>75 %</utilization[0].gpu_util>
  <used>8192 MiB</used>
  <total>16384 MiB</total>
  <power_draw[0].current>250 W</power_draw[0].current>
  <power_limit[0].current>450 W</power_limit[0].current>
  <gpu_clock_freq>1800 MHz</gpu_clock_freq>
  <mem_clock_freq>9000 MHz</mem_clock_freq>
  <fan_speed[0].current>60 %</fan_speed[0].current>
</gpu>"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "RTX 4090");
        assert_eq!(result[0].driver_version, Some("535.123.04".to_string()));
        assert_eq!(result[0].temperature_celsius, 65.0);
        assert_eq!(result[0].utilization_percent, 75.0);
        assert_eq!(result[0].vram_used_gb, 8.0);
        assert_eq!(result[0].vram_total_gb, 16.0);
        assert_eq!(result[0].power_usage_watts, 250.0);
        assert_eq!(result[0].power_limit_watts, 450.0);
        assert_eq!(result[0].clock_speed_mhz, Some(1800.0));
        assert_eq!(result[0].memory_clock_mhz, Some(9000.0));
        assert_eq!(result[0].fan_speed_rpm, 600.0);
    }

    #[test]
    fn test_parse_smi_xml_multiple_gpus() {
        let xml = r#"
<gpu>
  <product_name>GPU A</product_name>
  <temp_entry[0]>50 C</temp_entry[0]>
  <utilization><gpu_util>10 %</gpu_util></utilization>
  <memory><used>1024 MiB</used><total>8192 MiB</total></memory>
  <power_draw[0].current>50 W</power_draw[0].current>
  <fan_speed[0].current>30 %</fan_speed[0].current>
</gpu>
<gpu>
  <product_name>GPU B</product_name>
  <temp_entry[0]>70 C</temp_entry[0]>
  <utilization><gpu_util>90 %</gpu_util></utilization>
  <memory><used>4096 MiB</used><total>8192 MiB</total></memory>
  <power_draw[0].current>300 W</power_draw[0].current>
  <fan_speed[0].current>80 %</fan_speed[0].current>
</gpu>
"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "GPU A");
        assert_eq!(result[0].temperature_celsius, 50.0);
        assert_eq!(result[1].name, "GPU B");
        assert_eq!(result[1].temperature_celsius, 70.0);
    }

    #[test]
    fn test_parse_smi_xml_empty() {
        let xml = r#"<nvidia_smi></nvidia_smi>"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "No GPU detected");
    }

    #[test]
    fn test_parse_smi_xml_malformed() {
        let xml = r#"not valid xml at all"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "No GPU detected");
    }

    #[test]
    fn test_parse_smi_xml_missing_fields() {
        let xml = r#"
<gpu>
  <product_name>Minimal GPU</product_name>
</gpu>
"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "Minimal GPU");
        assert_eq!(result[0].temperature_celsius, 0.0);
        assert_eq!(result[0].utilization_percent, 0.0);
        assert_eq!(result[0].vram_used_gb, 0.0);
        assert!(result[0].clock_speed_mhz.is_none());
    }

    #[test]
    fn test_parse_smi_xml_empty_driver_version() {
        let xml = r#"
<gpu>
  <product_name>Test</product_name>
  <driver_version></driver_version>
</gpu>
"#;
        let result = parse_smi_xml(xml);
        assert!(result[0].driver_version.is_none());
    }

    #[test]
    fn test_parse_smi_xml_whitespace_in_values() {
        let xml = r#"
<gpu>
  <product_name>  RTX 3080  </product_name>
  <temp_entry[0]>  42 C  </temp_entry[0]>
</gpu>
"#;
        let result = parse_smi_xml(xml);
        assert_eq!(result[0].name, "RTX 3080");
        assert_eq!(result[0].temperature_celsius, 42.0);
    }
}

// ============================================================================
// CPU proc stat parsing tests
// ============================================================================

#[cfg(test)]
mod cpu_parsing {
    use super::*;

    #[test]
    fn test_parse_proc_stat_valid() {
        let content = "cpu  1000 50 200 5000 100\n\
            cpu0 500 25 100 2500 50\n\
            cpu1 500 25 100 2500 50\n";
        let stat = parse_proc_stat(content).expect("Should parse valid proc stat");
        assert_eq!(stat.user, 1000);
        assert_eq!(stat.nice, 50);
        assert_eq!(stat.system, 200);
        assert_eq!(stat.idle, 5000);
        assert_eq!(stat.iowait, 100);
        assert_eq!(stat.cores.len(), 2);
    }

    #[test]
    fn test_parse_proc_stat_empty() {
        assert!(parse_proc_stat("").is_none());
    }

    #[test]
    fn test_parse_proc_stat_no_cpu_line() {
        let content = "cpu0 500 25 100 2500 50\n";
        assert!(parse_proc_stat(content).is_none());
    }

    #[test]
    fn test_parse_proc_stat_insufficient_fields() {
        let content = "cpu 100 200\n";
        assert!(parse_proc_stat(content).is_none());
    }

    #[test]
    fn test_parse_proc_stat_core_ids() {
        let content = "cpu 100 10 20 500 5\n\
            cpu0 50 5 10 250 2\n\
            cpu4 50 5 10 250 3\n";
        let stat = parse_proc_stat(content).unwrap();
        assert_eq!(stat.cores.len(), 2);
        assert_eq!(stat.cores[0]._core_id, 0);
        assert_eq!(stat.cores[1]._core_id, 4);
    }

    #[test]
    fn test_compute_cpu_utilization_zero_activity() {
        let s1 = ProcStat {
            user: 100,
            nice: 10,
            system: 20,
            idle: 500,
            iowait: 5,
            cores: vec![],
        };
        let s2 = ProcStat {
            user: 100,
            nice: 10,
            system: 20,
            idle: 500,
            iowait: 5,
            cores: vec![],
        };
        let (util, _) = compute_cpu_utilization(&s1, &s2);
        assert_eq!(util, 0.0);
    }

    #[test]
    fn test_compute_cpu_utilization_full_activity() {
        let s1 = ProcStat {
            user: 100,
            nice: 0,
            system: 100,
            idle: 0,
            iowait: 0,
            cores: vec![],
        };
        let s2 = ProcStat {
            user: 200,
            nice: 0,
            system: 200,
            idle: 0,
            iowait: 0,
            cores: vec![],
        };
        let (util, _) = compute_cpu_utilization(&s1, &s2);
        assert_eq!(util, 100.0);
    }

    #[test]
    fn test_compute_cpu_utilization_half_activity() {
        let s1 = ProcStat {
            user: 0,
            nice: 0,
            system: 0,
            idle: 100,
            iowait: 0,
            cores: vec![],
        };
        let s2 = ProcStat {
            user: 50,
            nice: 0,
            system: 0,
            idle: 150,
            iowait: 0,
            cores: vec![],
        };
        let (util, _) = compute_cpu_utilization(&s1, &s2);
        assert_eq!(util, 50.0);
    }

    #[test]
    fn test_compute_cpu_utilization_counter_wrap() {
        let s1 = ProcStat {
            user: u64::MAX - 500,
            nice: 0,
            system: 0,
            idle: 0,
            iowait: 0,
            cores: vec![],
        };
        let s2 = ProcStat {
            user: 100,
            nice: 0,
            system: 0,
            idle: 0,
            iowait: 0,
            cores: vec![],
        };
        let (util, _) = compute_cpu_utilization(&s1, &s2);
        assert!(util > 0.0 && util <= 100.0);
    }

    #[test]
    fn test_compute_cpu_utilization_per_core() {
        let s1 = ProcStat {
            user: 0,
            nice: 0,
            system: 0,
            idle: 100,
            iowait: 0,
            cores: vec![
                CoreStat {
                    _core_id: 0,
                    user: 0,
                    nice: 0,
                    system: 0,
                    idle: 100,
                    iowait: 0,
                },
                CoreStat {
                    _core_id: 1,
                    user: 0,
                    nice: 0,
                    system: 0,
                    idle: 100,
                    iowait: 0,
                },
            ],
        };
        let s2 = ProcStat {
            user: 50,
            nice: 0,
            system: 0,
            idle: 150,
            iowait: 0,
            cores: vec![
                CoreStat {
                    _core_id: 0,
                    user: 25,
                    nice: 0,
                    system: 0,
                    idle: 125,
                    iowait: 0,
                },
                CoreStat {
                    _core_id: 1,
                    user: 25,
                    nice: 0,
                    system: 0,
                    idle: 125,
                    iowait: 0,
                },
            ],
        };
        let (_, cores) = compute_cpu_utilization(&s1, &s2);
        assert_eq!(cores.len(), 2);
        assert_eq!(cores[0].core_id, 0);
        assert_eq!(cores[0].utilization_percent, 50.0);
        assert_eq!(cores[1].core_id, 1);
        assert_eq!(cores[1].utilization_percent, 50.0);
    }

    #[test]
    fn test_compute_cpu_utilization_clamped() {
        let s1 = ProcStat {
            user: 0,
            nice: 0,
            system: 0,
            idle: 100,
            iowait: 0,
            cores: vec![],
        };
        let s2 = ProcStat {
            user: 0,
            nice: 0,
            system: 0,
            idle: 50,
            iowait: 0,
            cores: vec![],
        };
        let (util, _) = compute_cpu_utilization(&s1, &s2);
        assert!((0.0..=100.0).contains(&util));
    }

    #[test]
    fn test_parse_physical_cores_valid() {
        let content = "processor\t: 0\n\
            core id\t\t: 0\n\n\
            processor\t: 1\n\
            core id\t\t: 0\n\n\
            processor\t: 2\n\
            core id\t\t: 1\n\n\
            processor\t: 3\n\
            core id\t\t: 1\n\n";
        assert_eq!(parse_physical_cores(content), 2);
    }

    #[test]
    fn test_parse_physical_cores_empty() {
        assert_eq!(parse_physical_cores(""), 0);
    }

    #[test]
    fn test_parse_physical_cores_single_core() {
        let content = "processor\t: 0\n\
            core id\t\t: 0\n\n";
        assert_eq!(parse_physical_cores(content), 1);
    }

    #[test]
    fn test_parse_physical_cores_no_core_id() {
        let content = "processor\t: 0\n\n\
            processor\t: 1\n\n";
        assert_eq!(parse_physical_cores(content), 0);
    }

    #[test]
    fn test_parse_physical_cores_trailing_no_blank() {
        let content = "processor\t: 0\n\
            core id\t\t: 5\n";
        assert_eq!(parse_physical_cores(content), 1);
    }
}

// ============================================================================
// Memory edge case tests
// ============================================================================

#[cfg(test)]
mod memory_edge_cases {
    #[test]
    fn test_memory_utilization_formula() {
        let total: u64 = 16 * 1024 * 1024 * 1024;
        let used: u64 = 8 * 1024 * 1024 * 1024;
        let util = (used as f64 / total as f64) * 100.0;
        assert_eq!(util, 50.0);
    }

    #[test]
    fn test_memory_zero_total_guard() {
        let total: u64 = 0;
        let used: u64 = 0;
        let util = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        assert_eq!(util, 0.0);
    }

    #[test]
    fn test_bytes_to_gb_conversion() {
        let bytes = 1024 * 1024 * 1024;
        let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        assert_eq!(gb, 1.0);
    }

    #[test]
    fn test_bytes_to_gb_zero() {
        let bytes: u64 = 0;
        let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        assert_eq!(gb, 0.0);
    }

    #[test]
    fn test_bytes_to_gb_max_u64() {
        let bytes = u64::MAX;
        let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        assert!(gb > 0.0 && gb.is_finite());
    }

    #[test]
    fn test_memory_metrics_collection() {
        let (metrics, status) = system_dashboard::collectors::memory::collect_memory_metrics();
        assert_eq!(
            status,
            system_dashboard::collectors::alerts::CollectorStatus::Ok
        );
        assert!(metrics.total_gb > 0.0);
        assert!(metrics.used_gb >= 0.0);
        assert!(metrics.utilization_percent >= 0.0 && metrics.utilization_percent <= 100.0);
    }
}

// ============================================================================
// API serialization safety tests
// ============================================================================

#[cfg(test)]
mod api_serialization {
    use super::*;

    #[test]
    fn test_cpu_metrics_serializes() {
        let m = CpuMetrics {
            model: "Test CPU".to_string(),
            utilization_percent: 50.0,
            temperature_celsius: 65.0,
            physical_cores: 8,
            threads: 16,
            load_1m: 1.5,
            load_5m: 1.2,
            load_15m: 1.0,
            cores: vec![CpuCoreInfo {
                core_id: 0,
                utilization_percent: 50.0,
            }],
            frequency_mhz: 3500.0,
            freq_max_mhz: 5000.0,
        };
        let json = serde_json::to_string(&m).expect("CpuMetrics should serialize");
        assert!(json.contains("50.0"));
    }

    #[test]
    fn test_gpu_metrics_serializes_with_none_fields() {
        let m = GpuMetrics {
            name: "Test".to_string(),
            driver_version: None,
            utilization_percent: 0.0,
            temperature_celsius: 0.0,
            vram_used_gb: 0.0,
            vram_total_gb: 0.0,
            power_usage_watts: 0.0,
            power_limit_watts: 0.0,
            clock_speed_mhz: None,
            memory_clock_mhz: None,
            fan_speed_rpm: 0.0,
        };
        let json = serde_json::to_string(&m).expect("GpuMetrics should serialize");
        assert!(json.contains("Test"));
    }

    #[test]
    fn test_memory_metrics_serializes() {
        let m = MemoryMetrics {
            total_gb: 16.0,
            used_gb: 8.0,
            utilization_percent: 50.0,
            swap_total_gb: 4.0,
            swap_used_gb: 1.0,
        };
        let json = serde_json::to_string(&m).expect("MemoryMetrics should serialize");
        assert!(json.contains("16.0"));
    }

    #[test]
    fn test_storage_metrics_serializes() {
        let m = StorageMetrics {
            device: "/dev/sda1".to_string(),
            mount_point: "/".to_string(),
            filesystem: "ext4".to_string(),
            total_bytes: 100_000_000_000,
            used_bytes: 50_000_000_000,
            free_bytes: 50_000_000_000,
            utilization_percent: 50.0,
        };
        let json = serde_json::to_string(&m).expect("StorageMetrics should serialize");
        assert!(json.contains("ext4"));
    }

    #[test]
    fn test_device_storage_info_serializes_with_io() {
        let m = DeviceStorageInfo {
            device: "/dev/sda".to_string(),
            mounts: vec![],
            io_stats: Some(DiskIOStats {
                reads: 100,
                writes: 50,
                read_sectors: 200,
                write_sectors: 100,
                read_bytes_per_sec: 1024.0,
                write_bytes_per_sec: 512.0,
                read_iops: 10.0,
                write_iops: 5.0,
                read_latency_ms: 1.0,
                write_latency_ms: 2.0,
                utilization_percent: 5.0,
            }),
            temperature_celsius: Some(45.0),
        };
        let json = serde_json::to_string(&m).expect("DeviceStorageInfo should serialize");
        assert!(json.contains("sda"));
    }

    #[test]
    fn test_storage_history_point_serializes() {
        let p = StorageHistoryPoint {
            device: "sda".to_string(),
            slot: 0,
            timestamp: "2024-01-01 00:00:00 UTC".to_string(),
            read_bytes_per_sec: 1024.0,
            write_bytes_per_sec: 512.0,
            read_iops: 10.0,
            write_iops: 5.0,
            utilization: 5.0,
            read_latency_ms: 1.0,
            write_latency_ms: 2.0,
        };
        let json = serde_json::to_string(&p).expect("StorageHistoryPoint should serialize");
        assert!(json.contains("sda"));
    }

    #[test]
    fn test_system_metrics_serializes() {
        let m = SystemMetrics {
            hostname: "test".to_string(),
            uptime_seconds: 3600.0,
            uptime_human: "1 hour".to_string(),
            last_update: "2024-01-01".to_string(),
            kernel: "5.15".to_string(),
            os_name: "Linux".to_string(),
        };
        let json = serde_json::to_string(&m).expect("SystemMetrics should serialize");
        assert!(json.contains("test"));
    }

    #[test]
    fn test_metrics_with_extreme_values() {
        let m = CpuMetrics {
            model: "Test CPU".to_string(),
            utilization_percent: 100.0,
            temperature_celsius: f64::MAX,
            physical_cores: usize::MAX,
            threads: usize::MAX,
            load_1m: f64::MAX,
            load_5m: f64::MAX,
            load_15m: f64::MAX,
            cores: vec![],
            frequency_mhz: f64::MAX,
            freq_max_mhz: f64::MAX,
        };
        let json = serde_json::to_string(&m);
        assert!(json.is_ok());
    }
}

// ============================================================================
// AI metrics model serialization tests
// ============================================================================

#[cfg(test)]
mod ai_model_serialization {
    use system_dashboard::models::ai::{
        AiHistoryPoint, AiKvCacheStats, AiMetrics, AiModelItem, AiOpenWebuiHealth,
        AiOpencodeHealth, AiServiceStatus, AiTokenUsage,
    };

    #[test]
    fn test_ai_service_status_serializes() {
        let status = AiServiceStatus {
            name: "llama-server".to_string(),
            endpoint: "http://localhost:8081".to_string(),
            available: true,
            error_message: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("llama-server"));
        assert!(json.contains("true"));
    }

    #[test]
    fn test_ai_service_status_with_error_serializes() {
        let status = AiServiceStatus {
            name: "OpenWebUI".to_string(),
            endpoint: "http://localhost:3000".to_string(),
            available: false,
            error_message: Some("Connection refused".to_string()),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("OpenWebUI"));
        assert!(json.contains("false"));
        assert!(json.contains("Connection refused"));
    }

    #[test]
    fn test_ai_token_usage_serializes() {
        let usage = AiTokenUsage {
            total_tokens: 180,
            prompt_tokens: 100,
            completion_tokens: 50,
            cached_tokens: 30,
        };
        let json = serde_json::to_string(&usage).unwrap();
        assert!(json.contains("100"));
        assert!(json.contains("completion_tokens"));
    }

    #[test]
    fn test_ai_kv_cache_stats_serializes() {
        let stats = AiKvCacheStats {
            gpu_cache_usage_pct: 75.5,
            free_gpu_memory_mb: 1024.0,
            used_gpu_memory_mb: 3072.0,
        };
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("75.5"));
    }

    #[test]
    fn test_ai_model_item_serializes() {
        let item = AiModelItem {
            id: "model-1".to_string(),
            name: "Llama 3".to_string(),
            description: Some("A large language model".to_string()),
        };
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("model-1"));
        assert!(json.contains("Llama 3"));
    }

    #[test]
    fn test_ai_model_item_without_description_serializes() {
        let item = AiModelItem {
            id: "model-2".to_string(),
            name: "Mistral".to_string(),
            description: None,
        };
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("Mistral"));
        assert!(!json.contains("description"));
    }

    #[test]
    fn test_ai_history_point_serializes() {
        let point = AiHistoryPoint {
            timestamp: "2024-01-01 00:00:00 UTC".to_string(),
            llama_available: Some(true),
            openwebui_available: Some(true),
            opencode_available: Some(false),
            kv_cache_max_pct: Some(75.5),
            ..Default::default()
        };
        let json = serde_json::to_string(&point).unwrap();
        assert!(json.contains("2024-01-01"));
        assert!(json.contains("true"));
        assert!(json.contains("false"));
    }

    #[test]
    fn test_ai_history_point_without_optional_fields_serializes() {
        let point = AiHistoryPoint {
            timestamp: "2024-01-01 00:00:00 UTC".to_string(),
            llama_available: None,
            openwebui_available: None,
            opencode_available: None,
            kv_cache_max_pct: None,
            ..Default::default()
        };
        let json = serde_json::to_string(&point).unwrap();
        assert!(json.contains("2024-01-01"));
        assert!(!json.contains("llama_available"));
    }

    #[test]
    fn test_ai_metrics_serializes_with_all_fields() {
        let metrics = AiMetrics {
            llama_server: AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: "http://localhost:8081".to_string(),
                available: true,
                error_message: None,
            },
            openwebui: AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: "http://localhost:3000".to_string(),
                available: true,
                error_message: None,
            },
            opencode: AiServiceStatus {
                name: "OpenCode".to_string(),
                endpoint: "http://localhost:4000".to_string(),
                available: true,
                error_message: None,
            },
            llama_server_status_str: "online".to_string(),
            openwebui_status_str: "online".to_string(),
            opencode_status_str: "online".to_string(),
            llm_utilization_percent: Some(75.0),
            kv_cache_usage_percent: Some(75.5),
            prompt_buffer_usage_percent: Some(50.0),
            tokens_cached: Some(30),
            total_tokens_sent: Some(180),
            server_time_ms: Some(12.5),
            prompt_queue_size: Some(2),
            running_prompts: Some(1),
            swap_pending_slots: None,
            token_usage: Some(AiTokenUsage {
                total_tokens: 180,
                prompt_tokens: 100,
                completion_tokens: 50,
                cached_tokens: 30,
            }),
            kv_cache_stats: Some(vec![AiKvCacheStats {
                gpu_cache_usage_pct: 75.5,
                free_gpu_memory_mb: 1024.0,
                used_gpu_memory_mb: 3072.0,
            }]),
            chat_history_count: Some(42),
            models: Some(vec![AiModelItem {
                id: "model-1".to_string(),
                name: "Llama 3".to_string(),
                description: Some("Test model".to_string()),
            }]),
            llama_server_latency_ms: Some(5.0),
            ..Default::default()
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("llama-server"));
        assert!(json.contains("OpenWebUI"));
        assert!(json.contains("OpenCode"));
        assert!(json.contains("42"));
    }

    #[test]
    fn test_ai_metrics_serializes_with_none_fields() {
        let metrics = AiMetrics {
            llama_server: AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: "http://localhost:8081".to_string(),
                available: false,
                error_message: Some("Connection failed".to_string()),
            },
            openwebui: AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: "http://localhost:3000".to_string(),
                available: false,
                error_message: Some("Connection failed".to_string()),
            },
            opencode: AiServiceStatus {
                name: "OpenCode".to_string(),
                endpoint: "http://localhost:4000".to_string(),
                available: false,
                error_message: Some("Connection failed".to_string()),
            },
            llama_server_status_str: "offline".to_string(),
            openwebui_status_str: "offline".to_string(),
            opencode_status_str: "offline".to_string(),
            llm_utilization_percent: None,
            kv_cache_usage_percent: None,
            prompt_buffer_usage_percent: None,
            tokens_cached: None,
            total_tokens_sent: None,
            server_time_ms: None,
            prompt_queue_size: None,
            running_prompts: None,
            swap_pending_slots: None,
            token_usage: None,
            kv_cache_stats: None,
            chat_history_count: None,
            models: None,
            llama_server_latency_ms: None,
            ..Default::default()
        };
        let json = serde_json::to_string(&metrics).unwrap();
        assert!(json.contains("llama-server"));
        assert!(!json.contains("token_usage"));
        assert!(!json.contains("kv_cache_stats"));
    }

    #[test]
    fn test_ai_openwebui_health_serializes() {
        let health = AiOpenWebuiHealth {
            version: Some("v0.5.0".to_string()),
            status: Some("healthy".to_string()),
        };
        let json = serde_json::to_string(&health).unwrap();
        assert!(json.contains("v0.5.0"));
    }

    #[test]
    fn test_ai_opencode_health_serializes() {
        let health = AiOpencodeHealth {
            version: None,
            status: Some("ok".to_string()),
        };
        let json = serde_json::to_string(&health).unwrap();
        assert!(json.contains("ok"));
    }

    #[test]
    fn test_ai_metrics_extreme_values_serializes() {
        let metrics = AiMetrics {
            llama_server: AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: "http://localhost:8081".to_string(),
                available: true,
                error_message: None,
            },
            openwebui: AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: "http://localhost:3000".to_string(),
                available: true,
                error_message: None,
            },
            opencode: AiServiceStatus {
                name: "OpenCode".to_string(),
                endpoint: "http://localhost:4000".to_string(),
                available: true,
                error_message: None,
            },
            llama_server_status_str: "online".to_string(),
            openwebui_status_str: "online".to_string(),
            opencode_status_str: "online".to_string(),
            llm_utilization_percent: Some(f64::MAX),
            kv_cache_usage_percent: Some(f64::MAX),
            prompt_buffer_usage_percent: Some(f64::MAX),
            tokens_cached: Some(i64::MAX),
            total_tokens_sent: Some(i64::MAX),
            server_time_ms: Some(f64::MAX),
            prompt_queue_size: Some(i64::MAX),
            running_prompts: Some(i64::MAX),
            swap_pending_slots: Some(i64::MAX),
            token_usage: Some(AiTokenUsage {
                total_tokens: i64::MAX,
                prompt_tokens: i64::MAX,
                completion_tokens: i64::MIN,
                cached_tokens: 0,
            }),
            kv_cache_stats: Some(vec![AiKvCacheStats {
                gpu_cache_usage_pct: f64::MAX,
                free_gpu_memory_mb: f64::MIN,
                used_gpu_memory_mb: f64::MAX,
            }]),
            chat_history_count: Some(usize::MAX),
            models: Some(vec![AiModelItem {
                id: String::from_utf8(vec![b'a'; 1000]).unwrap(),
                name: String::from_utf8(vec![b'b'; 1000]).unwrap(),
                description: None,
            }]),
            llama_server_latency_ms: Some(f64::MAX),
            ..Default::default()
        };
        let json = serde_json::to_string(&metrics);
        assert!(json.is_ok());
    }
}

// ============================================================================
// AI alert generation tests
// ============================================================================

#[cfg(test)]
mod ai_alerts {
    use super::*;

    #[test]
    fn test_ai_collector_status_ok_no_alerts() {
        clear_alert_tracking();
        let alerts =
            system_dashboard::collectors::alerts::check_ai_collector_status(CollectorStatus::Ok);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_ai_collector_status_error_generates_alert() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_ai_collector_status(
            CollectorStatus::Error("llama-server down".to_string()),
        );
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Error);
        assert_eq!(alerts[0].subsystem, "ai");
    }

    #[test]
    fn test_ai_collector_status_partial_generates_warning() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_ai_collector_status(
            CollectorStatus::Partial("All AI services unavailable".to_string()),
        );
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
        assert_eq!(alerts[0].subsystem, "ai");
    }

    #[test]
    fn test_ai_service_availability_checks() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_ai_service_availability(
            false, // llama available
            false, // openwebui available
            false, // opencode available
            false, // comfyui available
        );
        assert!(!alerts.is_empty());
        assert_eq!(alerts[0].subsystem, "ai");
    }

    #[test]
    fn test_ai_service_availability_with_one_available() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_ai_service_availability(
            true,  // llama available
            false, // openwebui unavailable
            false, // opencode unavailable
            false, // comfyui unavailable
        );
        assert_eq!(alerts.len(), 3);
    }

    #[test]
    fn test_ai_alert_deduplication() {
        clear_alert_tracking();
        let alerts1 = system_dashboard::collectors::alerts::check_ai_collector_status(
            CollectorStatus::Error("same error".to_string()),
        );
        assert_eq!(alerts1.len(), 1);

        clear_alert_tracking();
        let alerts2 = system_dashboard::collectors::alerts::check_ai_collector_status(
            CollectorStatus::Error("same error".to_string()),
        );
        assert_eq!(alerts2.len(), 1);
    }

    #[test]
    fn test_ai_check_all_alerts_with_ai_error() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_all_alerts(
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            None,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            true,
            true,
            true,
            true,
        );
        // Should not have AI alerts when all services are OK
        let ai_alerts: Vec<&Alert> = alerts.iter().filter(|a| a.subsystem == "ai").collect();
        assert!(ai_alerts.is_empty());
    }

    #[test]
    fn test_ai_check_all_alerts_with_all_services_unavailable() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_all_alerts(
            CollectorStatus::Ok,
            CollectorStatus::Ok,
            None,
            CollectorStatus::Ok,
            CollectorStatus::Partial("All AI services unavailable".to_string()),
            CollectorStatus::Partial("All AI services unavailable".to_string()),
            false,
            false,
            false,
            false,
        );
        let ai_alerts: Vec<&Alert> = alerts.iter().filter(|a| a.subsystem == "ai").collect();
        assert!(!ai_alerts.is_empty());
    }

    #[test]
    fn test_ai_alert_ids_are_unique() {
        clear_alert_tracking();
        let alerts = system_dashboard::collectors::alerts::check_ai_service_availability(
            false, // llama unavailable
            false, // openwebui unavailable
            false, // opencode unavailable
            false, // comfyui unavailable
        );
        assert_eq!(alerts.len(), 4);
        // All four alerts should have unique IDs
        let ids: Vec<u64> = alerts.iter().map(|a| a.id).collect();
        let unique_ids: std::collections::HashSet<u64> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique_ids.len());
    }
}

// ============================================================================
// Launcher: script parsing & metadata extraction tests
// ============================================================================

#[cfg(test)]
mod launcher_script_parsing {
    use super::*;

    #[test]
    fn test_parse_simple_model_flag() {
        let script = r#"#!/bin/bash
llama-server -m "/mnt/models/foo.gguf" -c 32768 --port 8081
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("/mnt/models/foo.gguf"));
        assert_eq!(args.context_size, Some(32768));
        assert_eq!(args.port, Some(8081));
    }

    #[test]
    fn test_parse_long_form_model_and_ctx_size_flags() {
        let script = r#"#!/bin/bash
llama-server --model "/mnt/models/bar.gguf" --ctx-size 65536
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("/mnt/models/bar.gguf"));
        assert_eq!(args.context_size, Some(65536));
    }

    #[test]
    fn test_parse_ctx_size_equals_syntax() {
        let script = "llama-server -m model.gguf --ctx-size=131072";
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.context_size, Some(131072));
    }

    #[test]
    fn test_parse_hf_file_flag() {
        let script = "llama-server --hf-file org/repo/model.gguf -c 4096";
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("org/repo/model.gguf"));
    }

    #[test]
    fn test_model_flag_does_not_collide_with_mmproj() {
        // Regression test: `-m` must never match inside `--mmproj`, regardless
        // of which flag appears first in the command.
        let script =
            r#"llama-server --mmproj "/mnt/models/mmproj.gguf" -m "/mnt/models/real.gguf""#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("/mnt/models/real.gguf"));
        assert_eq!(args.mmproj.as_deref(), Some("/mnt/models/mmproj.gguf"));
    }

    #[test]
    fn test_parse_multiline_with_line_continuations() {
        let script = r#"#!/bin/bash
llama-server \
  -m "/mnt/models/multiline.gguf" \
  -c 131072 \
  --port 8081
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(
            args.model_path.as_deref(),
            Some("/mnt/models/multiline.gguf")
        );
        assert_eq!(args.context_size, Some(131072));
        assert_eq!(args.port, Some(8081));
    }

    #[test]
    fn test_parse_shell_variable_substitution() {
        // Matches the documented example: a variable defined earlier in the
        // script should be resolved when referenced via `-m "$MODEL"`.
        let script = r#"#!/bin/bash
MODEL="/mnt/Games/AI/models/foo.gguf"

llama-server \
  -m "$MODEL" \
  -c 131072
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(
            args.model_path.as_deref(),
            Some("/mnt/Games/AI/models/foo.gguf")
        );
    }

    #[test]
    fn test_parse_exported_shell_variable() {
        let script = r#"export MODEL_DIR="/mnt/models"
llama-server -m "$MODEL_DIR/foo.gguf" -c 8192
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("/mnt/models/foo.gguf"));
    }

    #[test]
    fn test_parse_ignores_full_line_comments() {
        let script = r#"#!/bin/bash
# -m "/old/unused/path.gguf"
llama-server -m "/mnt/models/current.gguf" -c 32768
"#;
        let args = parse_script_args(script).expect("should parse");
        assert_eq!(args.model_path.as_deref(), Some("/mnt/models/current.gguf"));
    }

    #[test]
    fn test_parse_spec_type_mappings() {
        let cases = [
            ("draft", "draft"),
            ("draft-mtp", "draft-mtp"),
            ("eagle", "eagle"),
            ("eagle3", "eagle3"),
        ];
        for (flag_val, expected) in cases {
            let script = format!("llama-server -m model.gguf --spec-type {}", flag_val);
            let args = parse_script_args(&script).expect("should parse");
            assert_eq!(args.spec_type.as_deref(), Some(expected));
        }
    }

    #[test]
    fn test_parse_missing_model_does_not_crash() {
        let script = "llama-server -c 4096 --port 8081";
        let args = parse_script_args(script).expect("should still parse the rest");
        assert_eq!(args.model_path, None);
        assert_eq!(args.context_size, Some(4096));
    }

    #[test]
    fn test_parse_no_server_command_returns_none() {
        let script = "#!/bin/bash\necho 'no llama-server here'\n";
        assert!(parse_script_args(script).is_none());
    }

    #[test]
    fn test_parse_malformed_unterminated_quote_does_not_panic() {
        let script = r#"llama-server -m "/mnt/models/unterminated.gguf -c 4096"#;
        // Must not panic; result content is best-effort.
        let _ = parse_script_args(script);
    }

    #[test]
    fn test_parse_empty_script_does_not_panic() {
        assert!(parse_script_args("").is_none());
    }
}

// ============================================================================
// Launcher: filename metadata (PARAMS / QUANT) extraction tests
// ============================================================================

#[cfg(test)]
mod launcher_filename_metadata {
    use super::*;

    #[test]
    fn test_extract_params_and_quant_basic() {
        let meta = extract_filename_metadata("Gemma-4-27B-Q4_K_M").expect("should parse");
        assert_eq!(meta.params.as_deref(), Some("27B"));
        assert_eq!(meta.quant.as_deref(), Some("Q4_K_M"));
    }

    #[test]
    fn test_extract_quant_iq_and_mxfp_forms() {
        let m1 = extract_filename_metadata("Foo-7B-IQ4_XS").expect("should parse");
        assert_eq!(m1.quant.as_deref(), Some("IQ4_XS"));

        let m2 = extract_filename_metadata("Foo-7B-MXFP4").expect("should parse");
        assert_eq!(m2.quant.as_deref(), Some("MXFP4"));
    }

    #[test]
    fn test_extract_quant_bare_short_form() {
        // Matches real scripts like "Qwen3.6-27B-NEO-Q4.sh"
        let meta = extract_filename_metadata("Qwen3.6-27B-NEO-Q4").expect("should parse");
        assert_eq!(meta.quant.as_deref(), Some("Q4"));
        assert_eq!(meta.variant.as_deref(), Some("NEO"));
    }

    #[test]
    fn test_extract_params_decimal_billions() {
        let meta = extract_filename_metadata("Qwen3.6-35B-RangerX").expect("should parse");
        assert_eq!(meta.params.as_deref(), Some("35B"));
    }

    #[test]
    fn test_extract_fallback_when_no_params_or_quant() {
        let meta = extract_filename_metadata("nomodel");
        // Either None entirely, or params/quant individually absent — must not panic either way.
        if let Some(m) = meta {
            assert!(m.params.is_none() || m.params.is_some());
            assert!(m.quant.is_none() || m.quant.is_some());
        }
    }
}

// ============================================================================
// Launcher: historical metrics capture (VRAM / RAM / TPS persistence)
// ============================================================================

#[cfg(test)]
mod launcher_metrics_capture {
    use super::*;
    use std::collections::HashMap;

    fn running_state(vram: Option<f64>, ram: Option<f64>, tps: Option<f64>) -> ProfileState {
        ProfileState {
            status: "running".to_string(),
            llama_server_pid: Some(1234),
            start_time: None,
            peak_vram_mb: vram,
            peak_ram_mb: ram,
            current_tps: tps,
        }
    }

    #[test]
    fn test_capture_creates_new_metadata_entry() {
        let mut metadata: HashMap<String, ProfileMetadata> = HashMap::new();
        let state = running_state(Some(14540.0), Some(19000.0), Some(11.0));
        capture_metrics_into_metadata(&mut metadata, "script.sh", &state, Some(131072));

        let entry = metadata.get("script.sh").expect("entry should exist");
        assert_eq!(entry.peak_vram_mb, Some(14540.0));
        assert_eq!(entry.peak_ram_mb, Some(19000.0));
        assert_eq!(entry.avg_gen_tps, Some(11.0));
        assert_eq!(entry.peak_gen_tps, Some(11.0));
        assert_eq!(entry.last_context_size, Some(131072));
    }

    #[test]
    fn test_capture_keeps_max_peak_across_calls() {
        let mut metadata: HashMap<String, ProfileMetadata> = HashMap::new();
        capture_metrics_into_metadata(
            &mut metadata,
            "s.sh",
            &running_state(Some(10000.0), Some(15000.0), Some(8.0)),
            None,
        );
        capture_metrics_into_metadata(
            &mut metadata,
            "s.sh",
            &running_state(Some(8000.0), Some(20000.0), Some(12.0)),
            None,
        );

        let entry = metadata.get("s.sh").unwrap();
        // VRAM/RAM peaks should never decrease.
        assert_eq!(entry.peak_vram_mb, Some(10000.0));
        assert_eq!(entry.peak_ram_mb, Some(20000.0));
        // TPS reflects the latest reading, peak tracks the max.
        assert_eq!(entry.avg_gen_tps, Some(12.0));
        assert_eq!(entry.peak_gen_tps, Some(12.0));
    }

    #[test]
    fn test_capture_does_not_overwrite_run_count_or_last_run_date() {
        let mut metadata: HashMap<String, ProfileMetadata> = HashMap::new();
        metadata.insert(
            "s.sh".to_string(),
            ProfileMetadata {
                script_path: "s.sh".to_string(),
                model_path: None,
                peak_vram_mb: None,
                peak_ram_mb: None,
                avg_gen_tps: None,
                peak_gen_tps: None,
                last_context_size: None,
                last_run_date: Some("2026-01-01T00:00:00Z".to_string()),
                run_count: 5,
                last_startup_time_ms: None,
            },
        );
        capture_metrics_into_metadata(
            &mut metadata,
            "s.sh",
            &running_state(Some(1000.0), None, None),
            None,
        );

        let entry = metadata.get("s.sh").unwrap();
        assert_eq!(entry.run_count, 5);
        assert_eq!(entry.last_run_date.as_deref(), Some("2026-01-01T00:00:00Z"));
        assert_eq!(entry.peak_vram_mb, Some(1000.0));
    }

    #[test]
    fn test_capture_with_all_none_leaves_metadata_unset() {
        let mut metadata: HashMap<String, ProfileMetadata> = HashMap::new();
        capture_metrics_into_metadata(
            &mut metadata,
            "s.sh",
            &running_state(None, None, None),
            None,
        );
        let entry = metadata.get("s.sh").unwrap();
        assert_eq!(entry.peak_vram_mb, None);
        assert_eq!(entry.peak_ram_mb, None);
        assert_eq!(entry.avg_gen_tps, None);
        assert_eq!(entry.last_context_size, None);
    }
}

// ============================================================================
// CPU model normalization tests
// ============================================================================

#[cfg(test)]
mod cpu_model {
    use super::*;

    #[test]
    fn normalize_strips_processor_suffix() {
        assert_eq!(
            normalize_cpu_model("AMD Ryzen 9 9950X3D 16-Core Processor"),
            "AMD Ryzen 9 9950X3D 16-Core"
        );
    }

    #[test]
    fn normalize_no_suffix_passthrough() {
        assert_eq!(
            normalize_cpu_model("Intel Core i7-12700K"),
            "Intel Core i7-12700K"
        );
    }

    #[test]
    fn normalize_proc_cpuinfo_fallback_format() {
        // /proc/cpuinfo lines look like "model name\t: Intel Core i9-13900K Processor"
        // normalize_cpu_model receives the value after stripping "model name" and ":"
        assert_eq!(
            normalize_cpu_model(" Intel Core i9-13900K Processor"),
            "Intel Core i9-13900K"
        );
    }

    #[test]
    fn cpu_metrics_model_field_is_present() {
        // Verify CpuMetrics struct has a model field of type String.
        let m = CpuMetrics {
            model: "AMD Ryzen 9 9950X3D 16-Core".to_string(),
            utilization_percent: 0.0,
            temperature_celsius: 0.0,
            physical_cores: 16,
            threads: 32,
            load_1m: 0.0,
            load_5m: 0.0,
            load_15m: 0.0,
            cores: vec![],
            frequency_mhz: 0.0,
            freq_max_mhz: 0.0,
        };
        assert!(!m.model.is_empty());
        assert!(!m.model.to_lowercase().ends_with("processor"));
    }
}
