//! CPU metrics collector using sysinfo.

use std::sync::{LazyLock, Mutex};
use crate::models::metrics::CpuMetrics;

static SYSTEM: LazyLock<Mutex<sysinfo::System>> = LazyLock::new(|| Mutex::new(sysinfo::System::new()));

pub fn collect_cpu_metrics() -> CpuMetrics {
    let mut system = SYSTEM.lock().unwrap();
    let len = system.cpus().len();

    let (avg_util, cores) = read_cpu_utilization();

    system.refresh_cpu_frequency();
    let cpus2 = system.cpus();
    let freq = if len > 0 { cpus2.first().map(|c| c.frequency() as f64).unwrap_or(0.0) } else { 0.0 };

    let physical_cores = read_physical_cores();
    let load_avg = sysinfo::System::load_average();
    let (load1, load5, load15) = (load_avg.one, load_avg.five, load_avg.fifteen);

    CpuMetrics {
        utilization_percent: avg_util,
        temperature_celsius: read_cpu_temperature(),
        physical_cores,
        threads: len,
        load_1m: load1,
        load_5m: load5,
        load_15m: load15,
        cores,
        frequency_mhz: freq,
    }
}

fn read_cpu_utilization() -> (f64, Vec<crate::models::metrics::CpuCoreInfo>) {
    let stat1 = read_all_proc_stats();
    if stat1.is_some() {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let stat2 = read_all_proc_stats();
        if let (Some(s1), Some(s2)) = (stat1, stat2) {
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
            let cores: Vec<crate::models::metrics::CpuCoreInfo> = s1.cores.iter().enumerate().zip(s2.cores.iter()).map(|((id, c1), c2)| {
                let d_total = (c2.user + c2.nice + c2.system + c2.idle + c2.iowait).wrapping_sub(c1.user + c1.nice + c1.system + c1.idle + c1.iowait);
                let d_idle = c2.idle.wrapping_sub(c1.idle);
                let d_active = d_total.saturating_sub(d_idle);
                let pct = if d_total > 0 { ((d_active as f64 / d_total as f64) * 100.0).clamp(0.0, 100.0) } else { 0.0 };
                crate::models::metrics::CpuCoreInfo {
                    core_id: id,
                    utilization_percent: pct,
                }
            }).collect();
            return (avg_util.clamp(0.0, 100.0), cores);
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
    (avg_util, cores)
}

struct CoreStat {
    _core_id: u64, user: u64, nice: u64, system: u64, idle: u64, iowait: u64,
}

struct ProcStat {
    user: u64, nice: u64, system: u64, idle: u64, iowait: u64,
    cores: Vec<CoreStat>,
}

fn read_all_proc_stats() -> Option<ProcStat> {
    let content = std::fs::read_to_string("/proc/stat").ok()?;
    let mut cores = Vec::new();
    for line in content.lines() {
        if line.starts_with("cpu") && line.len() > 3 {
            let third_char = line.chars().nth(3);
            if third_char.map(|c| c.is_ascii_digit()).unwrap_or(false) {
                let fields = line.split_whitespace().skip(1).collect::<Vec<_>>();
                if fields.len() >= 5
                    && let (Ok(u), Ok(n), Ok(s), Ok(i), Ok(w)) = (
                        fields[0].parse(), fields[1].parse(), fields[2].parse(), fields[3].parse(), fields[4].parse()
                    ) {
                        let core_id = line.chars().skip(3).take_while(|c| c.is_ascii_digit()).collect::<String>().parse::<u64>().unwrap_or(0);
                        cores.push(CoreStat { _core_id: core_id, user: u, nice: n, system: s, idle: i, iowait: w });
                    }
            }
        }
    }
    let total_line = content.lines().find(|l| l.starts_with("cpu ")).map(|l| l.split_whitespace().skip(1).collect::<Vec<_>>());
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

fn read_physical_cores() -> usize {
    let content = std::fs::read_to_string("/proc/cpuinfo").ok().unwrap_or_default();
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
            let val = trimmed.split(':').nth(1).and_then(|s| s.trim().parse::<u64>().ok());
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
                if name == "k10temp" || name == "coretemp" || name == "zenpower" || name == "amdtemp" {
                    let temp_file = path.map(|p| p.join("temp1_input"));
                    if let Some(content) = temp_file.and_then(|f| std::fs::read_to_string(&f).ok())
                        && let Ok(temp) = content.trim().parse::<f64>() {
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
        && let Ok(temp) = content.trim().parse::<f64>() {
            return temp / 1000.0;
        }
    0.0
}
