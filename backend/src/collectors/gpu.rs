//! GPU metrics collector for NVIDIA GPUs using nvml-wrapper.

use crate::models::metrics::GpuMetrics;

pub fn collect_gpu_metrics() -> Vec<GpuMetrics> {
    match init_nvml() {
        Ok(nvml) => gpu_from_nvml(&nvml),
        Err(reason) => {
            eprintln!("[GPU] NVML unavailable: {reason}. Falling back to nvidia-smi.");
            smi_from_all()
        }
    }
}

fn init_nvml() -> Result<nvml_wrapper::Nvml, String> {
    match nvml_wrapper::Nvml::init() {
        Ok(nvml) => Ok(nvml),
        Err(e) => Err(e.to_string()),
    }
}

fn gpu_from_nvml(nvml: &nvml_wrapper::Nvml) -> Vec<GpuMetrics> {
    match nvml.device_count() {
        Ok(count) if count > 0 => {
            let mut metrics = Vec::new();
            for i in 0..count {
                match nvml.device_by_index(i) {
                    Ok(device) => metrics.push(one_gpu(&device)),
                    Err(e) => {
                        eprintln!("[GPU] device_by_index({i}): {e}");
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

fn one_gpu(device: &nvml_wrapper::Device) -> GpuMetrics {
    let name = device.name().ok().unwrap_or_else(|| "Unknown".to_string());

    let temp = device
        .temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
        .map(|t| t as f64)
        .unwrap_or(0.0);

    let util = device
        .utilization_rates()
        .map(|u| u.gpu as f64)
        .unwrap_or(0.0);

    let mem = device.memory_info().map(|m| {
        let used = m.used as f64 / (1024.0 * 1024.0 * 1024.0);
        let total = m.total as f64 / (1024.0 * 1024.0 * 1024.0);
        (used, total)
    }).unwrap_or((0.0, 0.0));

      let power = device.power_usage().ok().map(|p| {
        (p as f64 / 1000.0, device.enforced_power_limit().ok().map(|pl| pl as f64 / 1000.0).unwrap_or(0.0))
    }).unwrap_or((0.0, 0.0));

    GpuMetrics {
        name,
        driver_version: "N/A".to_string(),
        utilization_percent: util,
        temperature_celsius: temp,
        vram_used_gb: mem.0,
        vram_total_gb: mem.1,
        power_usage_watts: power.0,
        power_limit_watts: power.1,
    }
}

fn default_gpu() -> Vec<GpuMetrics> {
    vec![default_gpu_metrics()]
}

fn default_gpu_metrics() -> GpuMetrics {
    GpuMetrics {
        name: "No GPU detected".to_string(),
        driver_version: "N/A".to_string(),
        utilization_percent: 0.0,
        temperature_celsius: 0.0,
        vram_used_gb: 0.0,
        vram_total_gb: 0.0,
        power_usage_watts: 0.0,
        power_limit_watts: 0.0,
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

fn parse_smi_xml(xml: &str) -> Vec<GpuMetrics> {
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
            let driver = extract_tag(gpu, "driver_version").unwrap_or("N/A".to_string());
            let temp = extract_tag_float(gpu, "temp_entry[0]").unwrap_or(0.0);
            let util = extract_tag_float(gpu, "utilization[0].gpu_util").unwrap_or(0.0);
            let vram_used = extract_tag_float(gpu, "used")
                .map(|v| v / 1024.0)
                .unwrap_or(0.0);
            let vram_total = extract_tag_float(gpu, "total")
                .map(|v| v / 1024.0)
                .unwrap_or(0.0);
            let power = extract_tag_float(gpu, "power_draw[0].current")
                .unwrap_or(0.0);
            let power_limit = extract_tag_float(gpu, "power_limit[0].current")
                .unwrap_or(0.0);

            GpuMetrics {
                name,
                driver_version: driver,
                utilization_percent: util,
                temperature_celsius: temp,
                vram_used_gb: vram_used,
                vram_total_gb: vram_total,
                power_usage_watts: power,
                power_limit_watts: power_limit,
            }
        })
        .collect()
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
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

fn extract_tag_float(xml: &str, tag: &str) -> Option<f64> {
    extract_tag(xml, tag)
        .and_then(|s| {
            let parts: Vec<&str> = s.split_whitespace().collect();
            parts.first().and_then(|p| p.parse().ok())
        })
}
