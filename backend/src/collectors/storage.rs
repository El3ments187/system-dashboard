//! Storage metrics collector using /proc/mounts, statvfs, and /proc/diskstats.

use super::alerts::CollectorStatus;
use crate::models::storage::{DeviceStorageInfo, DiskIOStats, StorageMetrics};
use libc::statvfs as c_statvfs;
use std::collections::BTreeMap;
use std::sync::{LazyLock, Mutex};

// History buffer size for storage metrics
const STORAGE_HISTORY_SIZE: usize = 120;

static NVME_CLI_AVAILABLE: LazyLock<bool> = LazyLock::new(|| {
    std::process::Command::new("nvme")
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
});

static SMARTCTL_AVAILABLE: LazyLock<bool> = LazyLock::new(|| {
    std::process::Command::new("smartctl")
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
});

pub fn is_nvme_device(name: &str) -> bool {
    name.starts_with("nvme")
}

pub fn nvme_controller_name(device: &str) -> Option<String> {
    let name = device.trim_start_matches("/dev/");
    if !name.starts_with("nvme") {
        return None;
    }
    let nvme_prefix = "nvme";
    let after_nvme = &name[nvme_prefix.len()..];
    if let Some(n_pos) = after_nvme.find('n') {
        Some(format!("{}{}", nvme_prefix, &after_nvme[..n_pos]))
    } else {
        Some(name.to_string())
    }
}

fn collect_temperature_nvme_cli(controller: &str) -> Option<f64> {
    if !*NVME_CLI_AVAILABLE {
        return None;
    }
    let output = std::process::Command::new("nvme")
        .args(["smart-log", "-o", "json", &format!("/dev/{}", controller)])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).ok()?;
    let temperature_millicelsius = parsed
        .get(controller)
        .and_then(|c| c.get("temperature"))
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_u64())?;
    Some(temperature_millicelsius as f64 / 1000.0)
}

fn collect_temperature_smartctl(device_path: &str) -> Option<f64> {
    if !*SMARTCTL_AVAILABLE {
        return None;
    }
    let output = std::process::Command::new("smartctl")
        .args(["-A", "-j", device_path])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).ok()?;
    let temp_key = parsed["smart_health"]
        .as_object()?
        .keys()
        .find(|k| k.contains("Temperature_Celsius") || k.contains("temperature"))?;
    parsed["smart_health"][temp_key]["value"].as_f64()
}

fn collect_temperature_sysfs(controller: &str) -> Option<f64> {
    let nvme_dir = format!("/sys/class/nvme/{}", controller);
    let entries = std::fs::read_dir(&nvme_dir).ok()?;
    for entry in entries {
        let entry = entry.ok()?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("hwmon") {
            let temp_input = entry.path().join("temp1_input");
            if let Ok(content) = std::fs::read_to_string(&temp_input)
                && let Ok(millicelsius) = content.trim().parse::<i64>()
            {
                return Some(millicelsius as f64 / 1000.0);
            }
        }
    }
    None
}

/// Device temperatures change on the order of minutes, but the frontend polls
/// /api/metrics/storage/devices every 500ms — and reading a temperature spawns
/// `nvme smart-log` (or falls back to `smartctl`) as a blocking subprocess and
/// issues an admin command to the drive. Uncached, that was 2 subprocess spawns
/// per device per second, forever. A short TTL turns 2 Hz device interrogation
/// into one read per device per TTL window; sysfs fallbacks are cheap but the
/// cache keeps behavior uniform across paths.
const TEMPERATURE_TTL: std::time::Duration = std::time::Duration::from_secs(30);

static TEMPERATURE_CACHE: LazyLock<
    Mutex<std::collections::HashMap<String, (std::time::Instant, Option<f64>)>>,
> = LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

fn collect_device_temperature_cached(device_name: &str) -> Option<f64> {
    let now = std::time::Instant::now();
    if let Ok(cache) = TEMPERATURE_CACHE.lock()
        && let Some((at, value)) = cache.get(device_name)
        && now.duration_since(*at) < TEMPERATURE_TTL
    {
        return *value;
    }
    let value = collect_device_temperature(device_name);
    if let Ok(mut cache) = TEMPERATURE_CACHE.lock() {
        cache.insert(device_name.to_string(), (now, value));
    }
    value
}

fn collect_device_temperature(device_name: &str) -> Option<f64> {
    let clean_name = device_name.trim_start_matches("/dev/");

    if is_nvme_device(clean_name) {
        if let Some(controller) = nvme_controller_name(clean_name) {
            if let Some(temp) = collect_temperature_nvme_cli(&controller) {
                return Some(temp);
            }
            if let Some(temp) = collect_temperature_smartctl(&format!("/dev/{}", clean_name)) {
                return Some(temp);
            }
            if let Some(temp) = collect_temperature_sysfs(&controller) {
                return Some(temp);
            }
        }
    } else {
        if let Some(temp) = collect_temperature_smartctl(&format!("/dev/{}", clean_name)) {
            return Some(temp);
        }
        let block_dir = format!("/sys/block/{}", clean_name);
        if let Ok(entries) = std::fs::read_dir(&block_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("hwmon") {
                    let temp_input = entry.path().join("temp1_input");
                    if let Ok(content) = std::fs::read_to_string(&temp_input)
                        && let Ok(millicelsius) = content.trim().parse::<i64>()
                    {
                        return Some(millicelsius as f64 / 1000.0);
                    }
                }
            }
        }
    }
    None
}

/// A single history data point for a storage device
#[derive(serde::Serialize, Clone)]
pub struct StorageHistoryPoint {
    pub device: String,
    pub slot: usize,
    pub timestamp: String,
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
    pub read_iops: f64,
    pub write_iops: f64,
    pub utilization: f64,
    pub read_latency_ms: f64,
    pub write_latency_ms: f64,
}

/// Rolling history buffer for a single device
#[derive(Clone)]
struct DeviceHistoryBuffer {
    slots: Vec<Option<StorageHistoryPoint>>,
}

/// Global storage history state
struct StorageHistoryState {
    buffers: BTreeMap<String, DeviceHistoryBuffer>,
    last_io_stats: BTreeMap<String, (u64, u64)>,
    last_timestamp: std::time::Instant,
    prev_ms_io: BTreeMap<String, u64>,
    prev_ms_read: BTreeMap<String, u64>,
    prev_ms_written: BTreeMap<String, u64>,
}

// Pseudo filesystems to skip
const PSEUDO_FS: &[&str] = &[
    "tmpfs",
    "devpts",
    "devtmpfs",
    "proc",
    "sysfs",
    "cgroup",
    "cgroup2",
    "overlay",
    "squashfs",
    "securityfs",
    "pstore",
    "bpf",
    "autofs",
    "mqueue",
    "debugfs",
    "hugetlbfs",
    "tracefs",
    "fusectl",
    "configfs",
    "binfmt_misc",
    "fuse.gvfsd-fuse",
    "efivarfs",
];

fn is_pseudo(fs: &str) -> bool {
    PSEUDO_FS.contains(&fs)
}

/// System/boot partitions that aren't user storage and shouldn't appear in
/// the dashboard's mount lists (user-reported: the ~200MB EFI system
/// partition showing up on the Overview page's Storage card adds noise
/// with zero monitoring value — its usage never meaningfully changes and
/// it isn't somewhere the user stores anything). Matched by exact mount
/// point, not substring, so a user mount that merely CONTAINS "boot"
/// (e.g. /mnt/bootlegs) is never accidentally hidden.
fn is_system_boot_mount(mount_point: &str) -> bool {
    matches!(mount_point, "/boot" | "/boot/efi" | "/efi")
}

pub fn is_loop_device(name: &str) -> bool {
    name.starts_with("loop")
}

pub fn is_partition_device(name: &str) -> bool {
    // NVMe partitions: nvme0n1p1, nvme1n1p2 (base device + 'p' + partition number)
    let chars: Vec<char> = name.chars().collect();
    if chars.len() >= 2
        && chars[chars.len() - 2] == 'p'
        && chars.last().unwrap().is_ascii_digit()
        && chars[chars.len() - 3].is_ascii_digit()
    {
        return true;
    }
    // NVMe base devices: nvme0n1, nvme1n1 (nvme + digit(s) + n + digit(s))
    // These are NOT partitions, even though stripping trailing digits changes the name
    // Pattern: starts with "nvme", has 'n' after controller digits, ends with digit(s), no 'p'
    if name.starts_with("nvme") && !name.contains('p') {
        let nvme_chars: Vec<char> = name.chars().collect();
        if nvme_chars.len() >= 7 {
            // Find the 'n' position after the controller digits
            let n_pos = name[4..].find('n');
            if let Some(offset) = n_pos {
                let n_idx = 4 + offset;
                // Check: controller digits before 'n', namespace digit(s) after 'n'
                if n_idx > 4 && nvme_chars[n_idx + 1].is_ascii_digit() {
                    // Verify all chars after 'n' are digits
                    let after_n: &str = &name[n_idx + 1..];
                    if after_n.chars().all(|c| c.is_ascii_digit()) {
                        return false;
                    }
                }
            }
        }
    }
    // Strip trailing digits to check if it's a partition (e.g., sda1 -> sda)
    let mut trimmed = name.to_string();
    while !trimmed.is_empty() && trimmed.chars().last().unwrap().is_ascii_digit() {
        trimmed.pop();
    }
    if trimmed.len() < name.len() {
        return true;
    }
    false
}

pub fn base_device(device: &str) -> String {
    // Strip partition suffix: /dev/nvme0n1p5 -> /dev/nvme0n1
    // /dev/sda1 -> /dev/sda
    let chars: Vec<char> = device.chars().collect();
    if chars.len() >= 2
        && chars[chars.len() - 2] == 'p'
        && chars.last().unwrap().is_ascii_digit()
        && chars[chars.len() - 3].is_ascii_digit()
    {
        return chars[..chars.len() - 2].iter().collect();
    }
    // NVMe base devices: nvme0n1, nvme1n1 — do NOT strip trailing digit
    if device.starts_with("nvme") && !device.contains('p') {
        let nvme_chars: Vec<char> = device.chars().collect();
        if nvme_chars.len() >= 7 {
            let n_pos = device[4..].find('n');
            if let Some(offset) = n_pos {
                let n_idx = 4 + offset;
                if n_idx > 4 && nvme_chars[n_idx + 1].is_ascii_digit() {
                    let after_n: &str = &device[n_idx + 1..];
                    if after_n.chars().all(|c| c.is_ascii_digit()) {
                        return device.to_string();
                    }
                }
            }
        }
    }
    // Strip trailing digits for whole-disk partitions like sda1
    let mut result = device.to_string();
    while !result.is_empty() && result.chars().last().unwrap().is_ascii_digit() {
        result.pop();
    }
    result
}

struct MountEntry {
    device: String,
    mount_point: String,
    fs_type: String,
}

fn read_proc_mounts() -> Vec<MountEntry> {
    let mut mounts = Vec::new();

    if let Ok(content) = std::fs::read_to_string("/proc/mounts") {
        for line in content.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                mounts.push(MountEntry {
                    device: parts[0].to_string(),
                    mount_point: parts[1].to_string(),
                    fs_type: parts[2].to_string(),
                });
            }
        }
    }

    mounts
}

/// Raw disk stat from /proc/diskstats
struct DiskStat {
    name: String,
    reads_completed: u64,
    _reads_merged: u64,
    sectors_read: u64,
    ms_read: u64,
    writes_completed: u64,
    _writes_merged: u64,
    sectors_written: u64,
    ms_written: u64,
    _io_in_progress: u64,
    ms_io: u64,
    _weighted_ms: u64,
}

fn read_disk_stats() -> std::collections::HashMap<String, DiskStat> {
    let mut stats = std::collections::HashMap::new();

    if let Ok(content) = std::fs::read_to_string("/proc/diskstats") {
        for line in content.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 14 {
                let name = parts[2].to_string();
                stats.insert(
                    name.clone(),
                    DiskStat {
                        name,
                        reads_completed: parts[3].parse().unwrap_or(0),
                        _reads_merged: parts[4].parse().unwrap_or(0),
                        sectors_read: parts[5].parse().unwrap_or(0),
                        ms_read: parts[6].parse().unwrap_or(0),
                        writes_completed: parts[7].parse().unwrap_or(0),
                        _writes_merged: parts[8].parse().unwrap_or(0),
                        sectors_written: parts[9].parse().unwrap_or(0),
                        ms_written: parts[10].parse().unwrap_or(0),
                        _io_in_progress: parts[11].parse().unwrap_or(0),
                        ms_io: parts[12].parse().unwrap_or(0),
                        _weighted_ms: parts[13].parse().unwrap_or(0),
                    },
                );
            }
        }
    }

    stats
}

/// Previous disk stats snapshot for delta computation
struct DiskStatsSnapshot {
    reads: std::collections::HashMap<String, u64>,
    writes: std::collections::HashMap<String, u64>,
    read_sectors: std::collections::HashMap<String, u64>,
    write_sectors: std::collections::HashMap<String, u64>,
    prev_ms_io: std::collections::HashMap<String, u64>,
    prev_ms_read: std::collections::HashMap<String, u64>,
    prev_ms_written: std::collections::HashMap<String, u64>,
    timestamp: std::time::Instant,
}

static LAST_SNAPSHOT: std::sync::Mutex<std::collections::BTreeMap<String, DiskStatsSnapshot>> =
    std::sync::Mutex::new(std::collections::BTreeMap::new());

static STORAGE_HISTORY: std::sync::Mutex<Option<StorageHistoryState>> = std::sync::Mutex::new(None);

fn init_storage_history() -> StorageHistoryState {
    StorageHistoryState {
        buffers: BTreeMap::new(),
        last_io_stats: BTreeMap::new(),
        last_timestamp: std::time::Instant::now(),
        prev_ms_io: BTreeMap::new(),
        prev_ms_read: BTreeMap::new(),
        prev_ms_written: BTreeMap::new(),
    }
}
fn compute_io_stats(current: &DiskStat) -> Option<DiskIOStats> {
    let mut guard = LAST_SNAPSHOT.lock().unwrap();
    let disk_name = &current.name;

    let prev = guard.get(disk_name);

    if let Some(prev_snap) = prev {
        let prev_reads = prev_snap.reads.get(disk_name).copied().unwrap_or(0);
        let prev_writes = prev_snap.writes.get(disk_name).copied().unwrap_or(0);
        let prev_read_sectors = prev_snap.read_sectors.get(disk_name).copied().unwrap_or(0);
        let prev_write_sectors = prev_snap.write_sectors.get(disk_name).copied().unwrap_or(0);

        let elapsed = prev_snap.timestamp.elapsed().as_secs_f64();
        let read_delta = current.reads_completed.wrapping_sub(prev_reads) as f64;
        let write_delta = current.writes_completed.wrapping_sub(prev_writes) as f64;
        let sectors_read_delta = current.sectors_read.wrapping_sub(prev_read_sectors) as f64;
        let sectors_written_delta = current.sectors_written.wrapping_sub(prev_write_sectors) as f64;

        if elapsed < 0.01 && read_delta == 0.0 && write_delta == 0.0 {
            return None;
        }

        let effective_elapsed = if elapsed < 0.01 { 0.01 } else { elapsed };

        let read_bytes = sectors_read_delta * 512.0;
        let write_bytes = sectors_written_delta * 512.0;

        // Compute read latency from ms_read delta per read I/O
        let prev_r = prev_snap.prev_ms_read.get(disk_name).copied().unwrap_or(0);
        let read_latency = if elapsed > 0.0 && read_delta > 0.0 {
            (current.ms_read.wrapping_sub(prev_r)) as f64 / read_delta
        } else {
            0.0
        };
        // Compute write latency from ms_written delta per write I/O
        let prev_w = prev_snap
            .prev_ms_written
            .get(disk_name)
            .copied()
            .unwrap_or(0);
        let write_latency = if elapsed > 0.0 && write_delta > 0.0 {
            (current.ms_written.wrapping_sub(prev_w)) as f64 / write_delta
        } else {
            0.0
        };

        // Compute I/O utilization from ms_io delta
        let prev_ms_io = prev_snap.prev_ms_io.get(disk_name).copied().unwrap_or(0);
        let io_delta = (current.ms_io.wrapping_sub(prev_ms_io)) as f64;
        let utilization_percent = if elapsed > 0.01 {
            (io_delta / elapsed / 10.0).min(100.0)
        } else {
            0.0
        };

        let io = DiskIOStats {
            reads: current.reads_completed,
            writes: current.writes_completed,
            read_sectors: current.sectors_read,
            write_sectors: current.sectors_written,
            read_bytes_per_sec: read_bytes / effective_elapsed,
            write_bytes_per_sec: write_bytes / effective_elapsed,
            read_iops: read_delta / effective_elapsed,
            write_iops: write_delta / effective_elapsed,
            read_latency_ms: read_latency,
            write_latency_ms: write_latency,
            utilization_percent,
        };

        // Update snapshot using current parameter (not re-reading /proc/diskstats)
        if let Some(s) = guard.get_mut(disk_name) {
            s.reads.insert(disk_name.clone(), current.reads_completed);
            s.writes.insert(disk_name.clone(), current.writes_completed);
            s.read_sectors
                .insert(disk_name.clone(), current.sectors_read);
            s.write_sectors
                .insert(disk_name.clone(), current.sectors_written);
            s.prev_ms_io.insert(disk_name.clone(), current.ms_io);
            s.prev_ms_read.insert(disk_name.clone(), current.ms_read);
            s.prev_ms_written
                .insert(disk_name.clone(), current.ms_written);
            s.timestamp = std::time::Instant::now();
        }

        Some(io)
    } else {
        guard.insert(
            disk_name.clone(),
            DiskStatsSnapshot {
                timestamp: std::time::Instant::now(),
                reads: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.reads_completed,
                )]),
                writes: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.writes_completed,
                )]),
                read_sectors: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.sectors_read,
                )]),
                write_sectors: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.sectors_written,
                )]),
                prev_ms_io: std::collections::HashMap::from([(disk_name.clone(), current.ms_io)]),
                prev_ms_read: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.ms_read,
                )]),
                prev_ms_written: std::collections::HashMap::from([(
                    disk_name.clone(),
                    current.ms_written,
                )]),
            },
        );
        None
    }
}
fn current_stats() -> std::collections::HashMap<String, DiskStat> {
    read_disk_stats()
}

pub fn collect_storage_metrics() -> (Vec<StorageMetrics>, CollectorStatus) {
    let mounts = read_proc_mounts();
    let mut result = Vec::new();

    for mount in mounts {
        if is_pseudo(&mount.fs_type) || is_system_boot_mount(&mount.mount_point) {
            continue;
        }

        let mount_path = mount.mount_point.clone();
        let path = std::ffi::CString::new(mount_path.as_str()).unwrap();
        let mut sv = unsafe { std::mem::zeroed() };
        if unsafe { c_statvfs(path.as_ptr(), &mut sv) } < 0 {
            continue;
        }

        let Some((total, used, avail, util)) =
            usage_from_statvfs(sv.f_blocks, sv.f_bfree, sv.f_bavail, sv.f_bsize)
        else {
            continue;
        };

        result.push(StorageMetrics {
            device: mount.device,
            mount_point: mount.mount_point,
            filesystem: mount.fs_type,
            total_bytes: total,
            used_bytes: used,
            free_bytes: avail,
            utilization_percent: (util * 100.0).round() / 100.0,
        });
    }

    (result, CollectorStatus::Ok)
}

pub fn collect_storage_by_device() -> Vec<DeviceStorageInfo> {
    let mounts = read_proc_mounts();
    let disk_stats = read_disk_stats();
    let mut device_map: std::collections::BTreeMap<String, Vec<StorageMetrics>> =
        std::collections::BTreeMap::new();
    let mut io_map: std::collections::BTreeMap<String, DiskIOStats> =
        std::collections::BTreeMap::new();

    // Initialize LAST_SNAPSHOT before compute_io_stats calls so the first valid computation has a proper baseline
    let mut snap_guard = LAST_SNAPSHOT.lock().unwrap();
    if snap_guard.is_empty() {
        let cs = current_stats();
        let ts = std::time::Instant::now() - std::time::Duration::from_secs(1);
        for (name, stat) in cs {
            if is_partition_device(&name) {
                continue;
            }
            snap_guard.insert(
                name.clone(),
                DiskStatsSnapshot {
                    timestamp: ts,
                    reads: std::collections::HashMap::new(),
                    writes: std::collections::HashMap::new(),
                    read_sectors: std::collections::HashMap::new(),
                    write_sectors: std::collections::HashMap::new(),
                    prev_ms_io: std::collections::HashMap::new(),
                    prev_ms_read: std::collections::HashMap::new(),
                    prev_ms_written: std::collections::HashMap::new(),
                },
            );
            if let Some(s) = snap_guard.get_mut(&name) {
                s.reads.insert(name.clone(), stat.reads_completed);
                s.writes.insert(name.clone(), stat.writes_completed);
                s.read_sectors.insert(name.clone(), stat.sectors_read);
                s.write_sectors.insert(name.clone(), stat.sectors_written);
                s.prev_ms_io.insert(name.clone(), stat.ms_io);
                s.prev_ms_read.insert(name.clone(), stat.ms_read);
                s.prev_ms_written.insert(name.clone(), stat.ms_written);
            }
        }
    }
    drop(snap_guard);

    // Compute IO stats for base devices only (kernel already includes partition I/O in parent counters)
    let mut aggregated_io: std::collections::BTreeMap<String, DiskIOStats> =
        std::collections::BTreeMap::new();
    for (name, raw) in &disk_stats {
        if is_loop_device(name) {
            continue;
        }
        if is_partition_device(name) {
            continue;
        }
        if let Some(io) = compute_io_stats(raw) {
            aggregated_io.insert(name.clone(), io);
        }
    }

    for mount in mounts {
        if is_pseudo(&mount.fs_type) || is_system_boot_mount(&mount.mount_point) {
            continue;
        }

        let mount_path = mount.mount_point.clone();
        let path = std::ffi::CString::new(mount_path.as_str()).unwrap();
        let mut sv = unsafe { std::mem::zeroed() };
        if unsafe { c_statvfs(path.as_ptr(), &mut sv) } < 0 {
            continue;
        }

        let Some((total, used, avail, util)) =
            usage_from_statvfs(sv.f_blocks, sv.f_bfree, sv.f_bavail, sv.f_bsize)
        else {
            continue;
        };

        let dev = base_device(&mount.device);
        let metrics = StorageMetrics {
            device: mount.device,
            mount_point: mount.mount_point,
            filesystem: mount.fs_type,
            total_bytes: total,
            used_bytes: used,
            free_bytes: avail,
            utilization_percent: (util * 100.0).round() / 100.0,
        };

        device_map.entry(dev.clone()).or_default().push(metrics);

        // Use aggregated IO stats for this base device
        let disk_name = dev.trim_start_matches("/dev/").to_string();
        if let Some(io) = aggregated_io.get(&disk_name) {
            io_map.insert(dev, io.clone());
        }
    }

    device_map
        .into_iter()
        .map(|(device, mounts)| {
            let io = io_map.get(&device).cloned();
            let dev_name = device.trim_start_matches("/dev/");
            let temperature = collect_device_temperature_cached(dev_name);
            DeviceStorageInfo {
                device,
                mounts,
                io_stats: io,
                temperature_celsius: temperature,
            }
        })
        .collect()
}

/// Collect storage history data points for all devices
pub fn collect_storage_history() -> Vec<StorageHistoryPoint> {
    let now = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S UTC")
        .to_string();
    let mut result = Vec::new();

    // Get current IO stats — use base devices only (kernel includes partition I/O in parent)
    let _mounts = read_proc_mounts();
    let disk_stats = read_disk_stats();

    let current_io: BTreeMap<String, (u64, u64, u64, u64)> = disk_stats
        .iter()
        .filter(|(_, stat)| !is_loop_device(&stat.name) && !is_partition_device(&stat.name))
        .map(|(_, stat)| {
            (
                stat.name.clone(),
                (
                    stat.reads_completed,
                    stat.writes_completed,
                    stat.sectors_read,
                    stat.sectors_written,
                ),
            )
        })
        .collect();

    let mut history_guard = STORAGE_HISTORY.lock().unwrap();

    // Initialize if needed
    let state = history_guard.get_or_insert_with(init_storage_history);
    let elapsed = state.last_timestamp.elapsed().as_secs_f64();
    state.last_timestamp = std::time::Instant::now();

    // Track which devices are currently active
    let active_devices: std::collections::HashSet<String> = current_io.keys().cloned().collect();

    // Remove stale devices no longer in current_io
    state
        .buffers
        .retain(|device, _| active_devices.contains(device));

    for (device, (reads, writes, _, _)) in &current_io {
        if is_loop_device(device) {
            continue;
        }
        let prev = state
            .last_io_stats
            .get(device)
            .copied()
            .unwrap_or((*reads, *writes));

        let read_delta = ((*reads) as i64 - prev.0 as i64).max(0) as f64;
        let write_delta = ((*writes) as i64 - prev.1 as i64).max(0) as f64;

        let read_bytes_per_sec = if elapsed > 0.01 {
            read_delta * 512.0 / elapsed
        } else {
            0.0
        };
        let write_bytes_per_sec = if elapsed > 0.01 {
            write_delta * 512.0 / elapsed
        } else {
            0.0
        };
        let read_iops = if elapsed > 0.01 {
            read_delta / elapsed
        } else {
            0.0
        };
        let write_iops = if elapsed > 0.01 {
            write_delta / elapsed
        } else {
            0.0
        };

        // Compute I/O latency from per-direction ms_read and ms_written deltas
        let prev_read = state.prev_ms_read.get(device).copied().unwrap_or(0);
        let prev_written = state.prev_ms_written.get(device).copied().unwrap_or(0);
        let cur_read = disk_stats.get(device).map(|d| d.ms_read).unwrap_or(0);
        let cur_written = disk_stats.get(device).map(|d| d.ms_written).unwrap_or(0);
        let read_ms_delta = (cur_read.wrapping_sub(prev_read)) as f64;
        let write_ms_delta = (cur_written.wrapping_sub(prev_written)) as f64;

        let read_latency_ms: f64 = if read_iops > 0.01 && read_ms_delta > 0.0 {
            read_ms_delta / read_iops
        } else {
            0.0
        };
        let write_latency_ms: f64 = if write_iops > 0.01 && write_ms_delta > 0.0 {
            write_ms_delta / write_iops
        } else {
            0.0
        };

        // I/O utilization from ms_io (total time spent doing I/O)
        let utilization: f64 = {
            let prev_w = state.prev_ms_io.get(device).copied().unwrap_or(0);
            let cur_w = disk_stats.get(device).map(|d| d.ms_io).unwrap_or(0);
            let io_delta = (cur_w.wrapping_sub(prev_w)) as f64;
            if elapsed > 0.01 {
                (io_delta / elapsed / 10.0).min(100.0)
            } else {
                0.0
            }
        };
        state.prev_ms_io.insert(
            device.clone(),
            disk_stats.get(device).map(|d| d.ms_io).unwrap_or(0),
        );
        state.prev_ms_read.insert(device.clone(), cur_read);
        state.prev_ms_written.insert(device.clone(), cur_written);

        // Update buffer
        let buffer =
            state
                .buffers
                .entry(device.to_string())
                .or_insert_with(|| DeviceHistoryBuffer {
                    slots: vec![None; STORAGE_HISTORY_SIZE],
                });

        // Circular buffer: shift all existing data one slot forward
        for i in (1..STORAGE_HISTORY_SIZE).rev() {
            buffer.slots[i] = buffer.slots[i - 1].clone();
        }
        buffer.slots[0] = Some(StorageHistoryPoint {
            device: device.clone(),
            slot: 0,
            timestamp: now.clone(),
            read_bytes_per_sec,
            write_bytes_per_sec,
            read_iops,
            write_iops,
            utilization,
            read_latency_ms,
            write_latency_ms,
        });

        state
            .last_io_stats
            .insert(device.to_string(), (*reads, *writes));
    }

    // Collect all non-None slots from each device's buffer
    // Buffer stores newest at slots[0], oldest at highest index.
    // Reverse iteration so slot=0 = oldest (left edge), highest slot = newest (right edge).
    for (device, buffer) in &state.buffers {
        let mut slot_idx: usize = 0;
        for i in (0..STORAGE_HISTORY_SIZE).rev() {
            if let Some(data) = &buffer.slots[i]
                && data.device == *device
            {
                let mut cloned = data.clone();
                cloned.slot = slot_idx;
                slot_idx += 1;
                result.push(cloned);
            }
        }
    }

    result
}

/// Compute (total, used, avail, util_pct) from raw statvfs fields, matching `df`.
///
/// df defines:
///   used  = f_blocks − f_bfree  (reserve counts as used, not free)
///   avail = f_bavail            (user-visible free, excluding reserve)
///   Use%  = used / (used + avail)  — denominator excludes reserve so columns
///                                    don't sum to 100; this matches `df -B1`.
///
/// Returns None when total == 0 (caller should skip the mount).
///
/// Cross-check on the real machine: `df -B1 /` "Avail" must equal the
/// reported free_bytes within rounding, and "Use%" must match util_pct
/// within 1 point. A mismatch here (>1 point) means f_bfree was used
/// somewhere instead of f_bavail.
fn usage_from_statvfs(
    f_blocks: u64,
    f_bfree: u64,
    f_bavail: u64,
    f_bsize: u64,
) -> Option<(u64, u64, u64, f64)> {
    let total = f_blocks * f_bsize;
    if total == 0 {
        return None;
    }
    let avail = f_bavail * f_bsize;
    let used = total.saturating_sub(f_bfree * f_bsize);
    let util = {
        let denom = used + avail;
        if denom > 0 {
            (used as f64 / denom as f64) * 100.0
        } else {
            0.0
        }
    };
    Some((total, used, avail, util))
}

#[cfg(test)]
mod tests {
    use super::{TEMPERATURE_TTL, is_system_boot_mount, usage_from_statvfs};

    #[test]
    fn boot_mounts_are_filtered_exactly() {
        // The three system/boot partitions this filter exists for.
        assert!(is_system_boot_mount("/boot"));
        assert!(is_system_boot_mount("/boot/efi"));
        assert!(is_system_boot_mount("/efi"));
    }

    #[test]
    fn user_mounts_containing_boot_are_never_filtered() {
        // EXACT-match semantics are the load-bearing property here: a
        // substring match would silently hide real user storage whose
        // path merely contains "boot" or "efi". These must all survive.
        assert!(!is_system_boot_mount("/mnt/bootlegs"));
        assert!(!is_system_boot_mount("/home/gamer/boot"));
        assert!(!is_system_boot_mount("/mnt/Games"));
        assert!(!is_system_boot_mount("/media/gamer/efi-backups"));
        assert!(!is_system_boot_mount("/"));
    }

    #[test]
    fn test_usage_typical_with_reserve() {
        // f_blocks=100, f_bfree=10, f_bavail=5, f_bsize=1
        // avail=5, used=90, util=90/(90+5)≈94.7%
        let (total, used, avail, util) = usage_from_statvfs(100, 10, 5, 1).unwrap();
        assert_eq!(total, 100);
        assert_eq!(used, 90);
        assert_eq!(avail, 5);
        let expected_util = 90.0_f64 / 95.0_f64 * 100.0;
        assert!(
            (util - expected_util).abs() < 0.01,
            "util={util} expected≈{expected_util}"
        );
    }

    #[test]
    fn test_reserve_not_counted_as_free() {
        // f_bfree=10, f_bavail=5 — reported avail must be 5, never 10
        let (_total, _used, avail, _util) = usage_from_statvfs(100, 10, 5, 1).unwrap();
        assert_eq!(avail, 5, "avail must use f_bavail, not f_bfree");
    }

    #[test]
    fn test_full_for_users() {
        // f_bfree=5 (reserved blocks remain), f_bavail=0 → avail=0, util=100%
        let (_total, used, avail, util) = usage_from_statvfs(100, 5, 0, 1).unwrap();
        assert_eq!(avail, 0);
        assert_eq!(used, 95);
        assert!(
            (util - 100.0).abs() < 0.01,
            "util must be 100% when avail=0"
        );
    }

    #[test]
    fn test_bsize_scaling() {
        // f_bsize=4096: all byte counts must scale
        let (total, used, avail, _util) = usage_from_statvfs(100, 10, 5, 4096).unwrap();
        assert_eq!(total, 100 * 4096);
        assert_eq!(used, 90 * 4096);
        assert_eq!(avail, 5 * 4096);
    }

    #[test]
    fn test_zero_blocks_returns_none() {
        assert!(usage_from_statvfs(0, 0, 0, 4096).is_none());
    }

    #[test]
    fn temperature_ttl_is_30s_per_user_decision() {
        assert_eq!(
            TEMPERATURE_TTL,
            std::time::Duration::from_secs(30),
            "TEMPERATURE_TTL must be 30 s (user decision 2026-07-21): \
             reduces subprocess spawns from 2/s to once per 30 s per device"
        );
    }
}
