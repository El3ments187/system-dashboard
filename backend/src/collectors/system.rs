//! System information collector.

use crate::models::metrics::SystemMetrics;

pub fn collect_system_metrics() -> SystemMetrics {
    let hostname = get_hostname();
    let uptime = get_uptime();
    let uptime_human = format_uptime(uptime);
    let kernel = get_kernel();
    let os_name = get_os_name();
    let now = chrono::Utc::now();

    SystemMetrics {
        hostname,
        uptime_seconds: uptime,
        uptime_human,
        last_update: now.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        kernel,
        os_name,
    }
}

fn get_hostname() -> String {
    std::env::var("HOSTNAME").unwrap_or_else(|_| {
        std::fs::read_to_string("/etc/hostname").unwrap_or_else(|_| "unknown".to_string())
    }).trim().to_string()
}

fn get_uptime() -> f64 {
    if let Ok(content) = std::fs::read_to_string("/proc/uptime")
        && let Ok(uptime) = content.split_whitespace().next().unwrap_or("0").parse::<f64>() {
            return uptime;
        }
    0.0
}

fn format_uptime(seconds: f64) -> String {
    let total = seconds as u64;
    let days = total / 86400;
    let hours = (total % 86400) / 3600;
    let mins = (total % 3600) / 60;

    if days > 0 {
        format!("{days}d {hours}h {mins}m")
    } else if hours > 0 {
        format!("{hours}h {mins}m")
    } else {
        format!("{mins}m")
    }
}

fn get_kernel() -> String {
    std::fs::read_to_string("/proc/version").ok().map(|v| {
        let parts: Vec<&str> = v.split_whitespace().collect();
        if parts.len() > 2 { parts[2].to_string() } else { "unknown".to_string() }
    }).unwrap_or_else(|| "unknown".to_string())
}

fn get_os_name() -> String {
    if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
        for line in content.lines() {
            if let Some(name) = line.strip_prefix("PRETTY_NAME=") {
                return name.trim_matches('"').to_string();
            }
        }
    }
    "Linux".to_string()
}
