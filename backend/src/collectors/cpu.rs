//! CPU metrics collector using sysinfo.

use crate::collectors::alerts::CollectorStatus;
use crate::models::metrics::CpuMetrics;
use std::sync::{LazyLock, Mutex};

pub static SYSTEM: LazyLock<Mutex<sysinfo::System>> = LazyLock::new(|| {
    Mutex::new({
        let mut s = sysinfo::System::new();
        s.refresh_cpu_all();
        s.refresh_memory();
        s
    })
});

static PHYSICAL_CORES: LazyLock<usize> = LazyLock::new(read_physical_cores);
static CPU_MAX_FREQ_MHZ: LazyLock<f64> = LazyLock::new(read_cpu_max_freq);
/// Strip redundant suffix words like "Processor" that add no information.
pub fn normalize_cpu_model(raw: &str) -> String {
    let s = raw.trim();
    // Remove trailing " Processor" (case-insensitive) if present.
    let s = if s.to_lowercase().ends_with(" processor") {
        s[..s.len() - " processor".len()].trim_end()
    } else {
        s
    };
    s.to_string()
}

static CPU_MODEL: LazyLock<String> = LazyLock::new(|| {
    // Read brand from sysinfo once; static on any given host.
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu_all();
    if let Some(cpu) = sys.cpus().first() {
        let brand = normalize_cpu_model(cpu.brand());
        if !brand.is_empty() {
            return brand;
        }
    }
    // Fallback: /proc/cpuinfo "model name"
    eprintln!("sysinfo cpu.brand() returned empty; falling back to /proc/cpuinfo");
    if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("model name") {
                let val = normalize_cpu_model(rest.trim_start_matches(':'));
                if !val.is_empty() {
                    return val;
                }
            }
        }
    }
    eprintln!("CPU model unavailable from sysinfo and /proc/cpuinfo");
    "Unknown CPU".to_string()
});

pub async fn collect_cpu_metrics() -> (CpuMetrics, CollectorStatus) {
    let status = read_cpu_utilization().await;

    let temp = read_cpu_temperature();

    let mut system = SYSTEM.lock().unwrap();
    let len = system.cpus().len();

    system.refresh_cpu_frequency();
    let cpus2 = system.cpus();
    let freq = if len > 0 {
        cpus2.first().map(|c| c.frequency() as f64).unwrap_or(0.0)
    } else {
        0.0
    };

    let load_avg = sysinfo::System::load_average();
    let (load1, load5, load15) = (load_avg.one, load_avg.five, load_avg.fifteen);

    let metrics = CpuMetrics {
        model: CPU_MODEL.clone(),
        utilization_percent: status.avg_util,
        temperature_celsius: temp,
        physical_cores: *PHYSICAL_CORES,
        threads: len,
        load_1m: load1,
        load_5m: load5,
        load_15m: load15,
        cores: status.cores,
        frequency_mhz: freq,
        freq_max_mhz: *CPU_MAX_FREQ_MHZ,
    };

    (metrics, status.status)
}

struct UtilStatus {
    avg_util: f64,
    cores: Vec<crate::models::metrics::CpuCoreInfo>,
    status: CollectorStatus,
}

pub fn compute_cpu_utilization(
    s1: &ProcStat,
    s2: &ProcStat,
) -> (f64, Vec<crate::models::metrics::CpuCoreInfo>) {
    let total1 = s1.user + s1.nice + s1.system + s1.idle + s1.iowait;
    let total2 = s2.user + s2.nice + s2.system + s2.idle + s2.iowait;
    let delta_total = total2.wrapping_sub(total1);
    let delta_idle = s2.idle.wrapping_sub(s1.idle);
    let delta_active = delta_total.saturating_sub(delta_idle);
    let avg_util = if delta_total > 0 {
        (delta_active as f64 / delta_total as f64) * 100.0
    } else {
        0.0
    };
    let cores: Vec<crate::models::metrics::CpuCoreInfo> = s1
        .cores
        .iter()
        .enumerate()
        .zip(s2.cores.iter())
        .map(|((id, c1), c2)| {
            let d_total = (c2.user + c2.nice + c2.system + c2.idle + c2.iowait)
                .wrapping_sub(c1.user + c1.nice + c1.system + c1.idle + c1.iowait);
            let d_idle = c2.idle.wrapping_sub(c1.idle);
            let d_active = d_total.saturating_sub(d_idle);
            let pct = if d_total > 0 {
                ((d_active as f64 / d_total as f64) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            crate::models::metrics::CpuCoreInfo {
                core_id: id,
                utilization_percent: pct,
            }
        })
        .collect();
    (avg_util.clamp(0.0, 100.0), cores)
}

/// Previous /proc/stat snapshot: utilization is the delta between the last
/// request's snapshot and now, so the poll cadence itself provides the
/// measurement window. The old implementation slept 500ms INSIDE every
/// request to take two snapshots, which (a) added 500ms latency to every
/// /cpu response and (b) with the frontend polling at 500ms meant a request
/// was permanently in flight. Only the very first request (no previous
/// snapshot) or a too-small window (<50ms, delta would be noise) briefly
/// sleeps to bootstrap a window.
static PREV_PROC_STAT: LazyLock<Mutex<Option<(ProcStat, std::time::Instant)>>> =
    LazyLock::new(|| Mutex::new(None));

async fn read_cpu_utilization() -> UtilStatus {
    let now = std::time::Instant::now();
    let prev = PREV_PROC_STAT
        .lock()
        .unwrap()
        .take_if(|(_, at)| now.duration_since(*at).as_millis() >= 50);

    let stat1 = match prev {
        Some((s, _)) => Some(s),
        None => {
            let s = read_all_proc_stats();
            if s.is_some() {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            s
        }
    };

    if stat1.is_some() {
        let stat2 = read_all_proc_stats();
        if let (Some(s1), Some(s2)) = (stat1, stat2) {
            let (avg_util, cores) = compute_cpu_utilization(&s1, &s2);
            *PREV_PROC_STAT.lock().unwrap() = Some((s2, std::time::Instant::now()));
            return UtilStatus {
                avg_util,
                cores,
                status: CollectorStatus::Ok,
            };
        }
    }

    let system = SYSTEM.lock().unwrap();
    let cpus = system.cpus();
    let len = cpus.len();
    let mut total: f64 = 0.0;
    let cores: Vec<crate::models::metrics::CpuCoreInfo> = cpus
        .iter()
        .enumerate()
        .map(|(id, c)| {
            let usage = c.cpu_usage();
            total += usage as f64;
            crate::models::metrics::CpuCoreInfo {
                core_id: id,
                utilization_percent: usage as f64,
            }
        })
        .collect();
    let avg_util = if len > 0 { total / len as f64 } else { 0.0 };

    UtilStatus {
        avg_util,
        cores,
        status: CollectorStatus::Ok,
    }
}

pub struct CoreStat {
    pub _core_id: u64,
    pub user: u64,
    pub nice: u64,
    pub system: u64,
    pub idle: u64,
    pub iowait: u64,
}

pub struct ProcStat {
    pub user: u64,
    pub nice: u64,
    pub system: u64,
    pub idle: u64,
    pub iowait: u64,
    pub cores: Vec<CoreStat>,
}

pub fn parse_proc_stat(content: &str) -> Option<ProcStat> {
    let mut cores = Vec::new();
    for line in content.lines() {
        if line.starts_with("cpu") && line.len() > 3 {
            let third_char = line.chars().nth(3);
            if third_char.map(|c| c.is_ascii_digit()).unwrap_or(false) {
                let fields = line.split_whitespace().skip(1).collect::<Vec<_>>();
                if fields.len() >= 5
                    && let (Ok(u), Ok(n), Ok(s), Ok(i), Ok(w)) = (
                        fields[0].parse(),
                        fields[1].parse(),
                        fields[2].parse(),
                        fields[3].parse(),
                        fields[4].parse(),
                    )
                {
                    let core_id = line
                        .chars()
                        .skip(3)
                        .take_while(|c| c.is_ascii_digit())
                        .collect::<String>()
                        .parse::<u64>()
                        .unwrap_or(0);
                    cores.push(CoreStat {
                        _core_id: core_id,
                        user: u,
                        nice: n,
                        system: s,
                        idle: i,
                        iowait: w,
                    });
                }
            }
        }
    }
    let total_line = content
        .lines()
        .find(|l| l.starts_with("cpu "))
        .map(|l| l.split_whitespace().skip(1).collect::<Vec<_>>());
    total_line.as_ref().and_then(|fields| {
        if fields.len() >= 5 {
            Some(ProcStat {
                user: fields[0].parse().unwrap_or(0),
                nice: fields[1].parse().unwrap_or(0),
                system: fields[2].parse().unwrap_or(0),
                idle: fields[3].parse().unwrap_or(0),
                iowait: fields[4].parse().unwrap_or(0),
                cores,
            })
        } else {
            None
        }
    })
}

fn read_all_proc_stats() -> Option<ProcStat> {
    let content = std::fs::read_to_string("/proc/stat").ok()?;
    parse_proc_stat(&content)
}

pub fn parse_physical_cores(content: &str) -> usize {
    let mut core_ids = std::collections::BTreeSet::new();
    let mut in_block = false;
    let mut current_core_id: Option<u64> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("processor") {
            if let Some(cid) = current_core_id {
                core_ids.insert(cid);
            }
            current_core_id = None;
            in_block = true;
        } else if trimmed.starts_with("core id") && in_block {
            let val = trimmed
                .split(':')
                .nth(1)
                .and_then(|s| s.trim().parse::<u64>().ok());
            current_core_id = val;
        } else if trimmed.is_empty() && in_block {
            if let Some(cid) = current_core_id {
                core_ids.insert(cid);
            }
            current_core_id = None;
            in_block = false;
        }
    }
    if let Some(cid) = current_core_id {
        core_ids.insert(cid);
    }
    core_ids.len()
}

fn read_cpu_max_freq() -> f64 {
    if let Ok(content) =
        std::fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq")
        && let Ok(khz) = content.trim().parse::<u64>()
    {
        return khz as f64 / 1000.0;
    }
    0.0
}

fn read_physical_cores() -> usize {
    let content = std::fs::read_to_string("/proc/cpuinfo")
        .ok()
        .unwrap_or_default();
    parse_physical_cores(&content)
}

fn read_cpu_temperature() -> f64 {
    let hwmon_dir = "/sys/class/hwmon";
    if let Ok(entries) = std::fs::read_dir(hwmon_dir) {
        let mut best_temp: Option<f64> = None;
        for entry in entries {
            let entry = entry.ok();
            let path = entry.as_ref().map(|e| e.path());
            let name_file = path.as_ref().map(|p| p.join("name"));
            if let Some(name) = name_file.and_then(|f| std::fs::read_to_string(&f).ok()) {
                let name = name.trim();
                if name == "k10temp"
                    || name == "coretemp"
                    || name == "zenpower"
                    || name == "amdtemp"
                {
                    let temp_file = path.map(|p| p.join("temp1_input"));
                    if let Some(content) = temp_file.and_then(|f| std::fs::read_to_string(&f).ok())
                        && let Ok(temp) = content.trim().parse::<f64>()
                    {
                        let temp_c = temp / 1000.0;
                        if let Some(current) = best_temp {
                            if temp_c > current {
                                best_temp = Some(temp_c);
                            }
                        } else {
                            best_temp = Some(temp_c);
                        }
                    }
                }
            }
        }
        if let Some(temp) = best_temp {
            return temp;
        }
    }
    if let Ok(content) = std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp")
        && let Ok(temp) = content.trim().parse::<f64>()
    {
        return temp / 1000.0;
    }
    0.0
}

#[cfg(test)]
mod tests {
    use super::normalize_cpu_model;

    #[test]
    fn strips_trailing_processor() {
        assert_eq!(
            normalize_cpu_model("AMD Ryzen 9 9950X3D 16-Core Processor"),
            "AMD Ryzen 9 9950X3D 16-Core"
        );
    }

    #[test]
    fn strips_trailing_processor_case_insensitive() {
        assert_eq!(
            normalize_cpu_model("Intel Core i9-13900K PROCESSOR"),
            "Intel Core i9-13900K"
        );
    }

    #[test]
    fn leaves_model_without_processor_suffix_unchanged() {
        assert_eq!(normalize_cpu_model("Apple M2 Pro"), "Apple M2 Pro");
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(
            normalize_cpu_model("  AMD Ryzen 5 5600X  "),
            "AMD Ryzen 5 5600X"
        );
    }

    #[test]
    fn empty_string_returns_empty() {
        assert_eq!(normalize_cpu_model(""), "");
    }
}
