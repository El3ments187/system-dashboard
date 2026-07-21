//! GPU metrics collector for NVIDIA GPUs using nvml-wrapper.

use super::alerts::CollectorStatus;
use crate::models::metrics::GpuMetrics;
use std::sync::{LazyLock, Mutex};

static NVML: LazyLock<Mutex<Option<nvml_wrapper::Nvml>>> = LazyLock::new(|| Mutex::new(None));

/// When NVML init fails (e.g. a broken driver), don't retry a full library
/// init on every 500ms poll — Nvml::init() loads the library and touches the
/// driver, which is exactly what's unhealthy in that state. Retry with a
/// backoff instead.
const NVML_INIT_RETRY: std::time::Duration = std::time::Duration::from_secs(30);
static NVML_LAST_INIT_ATTEMPT: LazyLock<Mutex<Option<std::time::Instant>>> =
    LazyLock::new(|| Mutex::new(None));

/// The nvidia-smi fallback spawns a subprocess (`nvidia-smi -q -x`, 30-200ms,
/// wakes the GPU). At the frontend's 2 Hz poll that meant 2 spawns/sec forever
/// while NVML is down. Serve cached results inside this TTL instead.
const SMI_TTL: std::time::Duration = std::time::Duration::from_millis(1500);
static SMI_CACHE: LazyLock<Mutex<Option<(std::time::Instant, Vec<GpuMetrics>)>>> =
    LazyLock::new(|| Mutex::new(None));

/// Driver version and per-device name / enforced power limit are constants for
/// the life of the process; querying the driver for them twice a second is
/// pure waste. Cached on first successful read.
static DRIVER_VERSION: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
static GPU_STATIC_INFO: LazyLock<Mutex<std::collections::HashMap<u32, (String, Option<f64>)>>> =
    LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

/// Rate-limit hot-path logging: at 2 Hz an eprintln per poll floods stderr and
/// journald (real disk writes). Log each condition once, re-arm on recovery.
static LOGGED_NVML_UNAVAILABLE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
static LOGGED_DEVICE_ERROR: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

static NVIDIA_SMI_AVAILABLE: LazyLock<bool> = LazyLock::new(|| {
    std::process::Command::new("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
});

pub fn get_gpu_backend_info() -> (String, bool) {
    let guard = NVML.lock().unwrap();
    match guard.as_ref() {
        Some(_) => ("nvml".to_string(), true),
        None => {
            if *NVIDIA_SMI_AVAILABLE {
                ("nvidia-smi".to_string(), false)
            } else {
                ("none".to_string(), false)
            }
        }
    }
}

pub fn collect_gpu_metrics() -> (Vec<GpuMetrics>, CollectorStatus) {
    let mut guard = NVML.lock().unwrap();
    if guard.is_none() {
        // Only re-attempt a full NVML init after the backoff window.
        let mut last = NVML_LAST_INIT_ATTEMPT.lock().unwrap();
        let due = last
            .map(|at| at.elapsed() >= NVML_INIT_RETRY)
            .unwrap_or(true);
        if due {
            *last = Some(std::time::Instant::now());
            *guard = nvml_wrapper::Nvml::init().ok();
        }
    }
    match guard.as_ref() {
        Some(nvml) => {
            LOGGED_NVML_UNAVAILABLE.store(false, std::sync::atomic::Ordering::Relaxed);
            let metrics = gpu_from_nvml(nvml);
            (metrics, CollectorStatus::Ok)
        }
        None => {
            drop(guard);
            if !LOGGED_NVML_UNAVAILABLE.swap(true, std::sync::atomic::Ordering::Relaxed) {
                eprintln!(
                    "[GPU] NVML unavailable. Falling back to nvidia-smi (logged once; retrying init every {}s).",
                    NVML_INIT_RETRY.as_secs()
                );
            }
            let metrics = smi_from_all_cached();
            (
                metrics,
                CollectorStatus::Partial("NVML unavailable, using fallback".to_string()),
            )
        }
    }
}

/// TTL wrapper: at most one nvidia-smi subprocess per SMI_TTL window.
fn smi_from_all_cached() -> Vec<GpuMetrics> {
    let now = std::time::Instant::now();
    if let Ok(cache) = SMI_CACHE.lock()
        && let Some((at, metrics)) = cache.as_ref()
        && now.duration_since(*at) < SMI_TTL
    {
        return metrics.clone();
    }
    let metrics = smi_from_all();
    if let Ok(mut cache) = SMI_CACHE.lock() {
        *cache = Some((now, metrics.clone()));
    }
    metrics
}

fn gpu_from_nvml(nvml: &nvml_wrapper::Nvml) -> Vec<GpuMetrics> {
    let driver_version = DRIVER_VERSION
        .get_or_init(|| nvml.sys_driver_version().ok())
        .clone();

    match nvml.device_count() {
        Ok(count) if count > 0 => {
            let mut metrics = Vec::new();
            for i in 0..count {
                match nvml.device_by_index(i) {
                    Ok(device) => {
                        LOGGED_DEVICE_ERROR.store(false, std::sync::atomic::Ordering::Relaxed);
                        metrics.push(one_gpu(i, &device, driver_version.as_deref()));
                    }
                    Err(e) => {
                        if !LOGGED_DEVICE_ERROR.swap(true, std::sync::atomic::Ordering::Relaxed) {
                            eprintln!("[GPU] device_by_index({i}): {e} (logged once)");
                        }
                    }
                }
            }
            if metrics.is_empty() {
                default_gpu()
            } else {
                metrics
            }
        }
        Ok(_) => default_gpu(),
        Err(e) => {
            eprintln!("[GPU] device_count: {e}");
            default_gpu()
        }
    }
}

fn one_gpu(index: u32, device: &nvml_wrapper::Device, driver_version: Option<&str>) -> GpuMetrics {
    // name and enforced power limit are constant per device; read them from the
    // driver once instead of twice a second.
    let (name, cached_limit) = {
        let mut cache = GPU_STATIC_INFO.lock().unwrap();
        match cache.get(&index) {
            Some(v) => v.clone(),
            None => {
                let name = device.name().ok().unwrap_or_else(|| "Unknown".to_string());
                let limit = device
                    .enforced_power_limit()
                    .ok()
                    .map(|pl| pl as f64 / 1000.0);
                cache.insert(index, (name.clone(), limit));
                (name, limit)
            }
        }
    };

    let temp = device
        .temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
        .map(|t| t as f64)
        .unwrap_or(0.0);

    let util = device
        .utilization_rates()
        .map(|u| u.gpu as f64)
        .unwrap_or(0.0);

    let mem = device
        .memory_info()
        .map(|m| {
            let used = m.used as f64 / (1024.0 * 1024.0 * 1024.0);
            let total = m.total as f64 / (1024.0 * 1024.0 * 1024.0);
            (used, total)
        })
        .unwrap_or((0.0, 0.0));

    let power = device
        .power_usage()
        .ok()
        .map(|p| (p as f64 / 1000.0, cached_limit.unwrap_or(0.0)))
        .unwrap_or((0.0, 0.0));

    let fan = device
        .fan_speed_rpm(0)
        .ok()
        .map(|f| f as f64)
        .unwrap_or(0.0);

    let clock = device
        .clock_info(nvml_wrapper::enum_wrappers::device::Clock::Graphics)
        .ok()
        .filter(|c| *c > 0)
        .map(|c| c as f64);

    let mem_clock = device
        .clock_info(nvml_wrapper::enum_wrappers::device::Clock::Memory)
        .ok()
        .filter(|c| *c > 0)
        .map(|c| c as f64);

    GpuMetrics {
        name,
        driver_version: driver_version.map(|s| s.to_string()),
        utilization_percent: util,
        temperature_celsius: temp,
        vram_used_gb: mem.0,
        vram_total_gb: mem.1,
        power_usage_watts: power.0,
        power_limit_watts: power.1,
        clock_speed_mhz: clock,
        memory_clock_mhz: mem_clock,
        fan_speed_rpm: fan,
    }
}

fn default_gpu() -> Vec<GpuMetrics> {
    vec![default_gpu_metrics()]
}

fn default_gpu_metrics() -> GpuMetrics {
    GpuMetrics {
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
    }
}

fn smi_from_all() -> Vec<GpuMetrics> {
    let output = std::process::Command::new("nvidia-smi")
        .args(["-q", "-x"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let xml = String::from_utf8(out.stdout).unwrap_or_default();
            parse_smi_xml(&xml)
        }
        _ => default_gpu(),
    }
}

pub fn parse_smi_xml(xml: &str) -> Vec<GpuMetrics> {
    let gpu_blocks: Vec<&str> = xml
        .split("<gpu>")
        .skip(1)
        .map(|s| {
            if let Some(end) = s.find("</gpu>") {
                &s[..end]
            } else {
                s
            }
        })
        .collect();

    if gpu_blocks.is_empty() {
        return default_gpu();
    }

    gpu_blocks
        .iter()
        .map(|gpu| {
            let name = extract_tag(gpu, "product_name").unwrap_or("Unknown".to_string());
            let driver = extract_tag(gpu, "driver_version");
            let temp = extract_tag_float(gpu, "temp_entry[0]").unwrap_or(0.0);
            let util = extract_tag_float(gpu, "utilization[0].gpu_util").unwrap_or(0.0);
            let vram_used = extract_tag_float(gpu, "used")
                .map(|v| v / 1024.0)
                .unwrap_or(0.0);
            let vram_total = extract_tag_float(gpu, "total")
                .map(|v| v / 1024.0)
                .unwrap_or(0.0);
            let power = extract_tag_float(gpu, "power_draw[0].current").unwrap_or(0.0);
            let power_limit = extract_tag_float(gpu, "power_limit[0].current").unwrap_or(0.0);
            let clock = extract_tag_float(gpu, "gpu_clock_freq");
            let mem_clock = extract_tag_float(gpu, "mem_clock_freq");
            let fan = extract_tag_float(gpu, "fan_speed[0].current")
                .map(|f| f * 10.0)
                .unwrap_or(0.0);

            GpuMetrics {
                name,
                driver_version: driver.filter(|d| !d.is_empty()),
                utilization_percent: util,
                temperature_celsius: temp,
                vram_used_gb: vram_used,
                vram_total_gb: vram_total,
                power_usage_watts: power,
                power_limit_watts: power_limit,
                clock_speed_mhz: clock,
                memory_clock_mhz: mem_clock,
                fan_speed_rpm: fan,
            }
        })
        .collect()
}

pub fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    if let Some(start) = xml.find(&open) {
        let after_open = start + open.len();
        if let Some(end) = xml[after_open..].find(&close) {
            let end_abs = after_open + end;
            let val = xml[after_open..end_abs].trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

pub fn extract_tag_float(xml: &str, tag: &str) -> Option<f64> {
    extract_tag(xml, tag).and_then(|s| {
        let parts: Vec<&str> = s.split_whitespace().collect();
        parts.first().and_then(|p| p.parse().ok())
    })
}
