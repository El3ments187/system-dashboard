//! Storage metrics collector using /proc/mounts, statvfs, and /proc/diskstats.

use crate::models::storage::{DeviceStorageInfo, DiskIOStats, StorageMetrics};
use libc::statvfs as c_statvfs;
use std::collections::BTreeMap;

// History buffer size for storage metrics
const STORAGE_HISTORY_SIZE: usize = 60;

/// A single history data point for a storage device
#[derive(serde::Serialize, Clone)]
pub(crate) struct StorageHistoryPoint {
    device: String,
    slot: usize,
    timestamp: String,
    read_bytes_per_sec: f64,
    write_bytes_per_sec: f64,
    read_iops: f64,
    write_iops: f64,
    utilization: f64,
    read_latency_ms: f64,
    write_latency_ms: f64,
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
    prev_weighted_ms: BTreeMap<String, u64>,
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

fn is_loop_device(name: &str) -> bool {
    name.starts_with("loop")
}

fn is_partition_device(name: &str) -> bool {
    // NVMe partitions: nvme0n1p1, nvme1n1p2 (base device + 'p' + partition number)
    let chars: Vec<char> = name.chars().collect();
    if chars.len() >= 2 && chars[chars.len() - 2] == 'p'
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

fn base_device(device: &str) -> String {
    // Strip partition suffix: /dev/nvme0n1p5 -> /dev/nvme0n1
    // /dev/sda1 -> /dev/sda
    let chars: Vec<char> = device.chars().collect();
    if chars.len() >= 2 && chars[chars.len() - 2] == 'p'
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
    _ms_in_progress: u64,
    _weighted_ms: u64,
}

fn read_disk_stats() -> std::collections::HashMap<String, DiskStat> {
    let mut stats = std::collections::HashMap::new();

    if let Ok(content) = std::fs::read_to_string("/proc/diskstats") {
        for line in content.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 14 {
                let name = parts[2].to_string();
                stats.insert(name.clone(), DiskStat {
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
                    _ms_in_progress: parts[12].parse().unwrap_or(0),
                    _weighted_ms: parts[13].parse().unwrap_or(0),
                });
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
    prev_weighted_ms: std::collections::HashMap<String, u64>,
    prev_ms_read: std::collections::HashMap<String, u64>,
    prev_ms_written: std::collections::HashMap<String, u64>,
    timestamp: std::time::Instant,
}

static LAST_SNAPSHOT: std::sync::Mutex<std::collections::BTreeMap<String, DiskStatsSnapshot>> = std::sync::Mutex::new(std::collections::BTreeMap::new());

static STORAGE_HISTORY: std::sync::Mutex<Option<StorageHistoryState>> = std::sync::Mutex::new(None);

fn init_storage_history() -> StorageHistoryState {
    StorageHistoryState {
        buffers: BTreeMap::new(),
        last_io_stats: BTreeMap::new(),
        last_timestamp: std::time::Instant::now(),
        prev_weighted_ms: BTreeMap::new(),
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
        let prev_w = prev_snap.prev_ms_written.get(disk_name).copied().unwrap_or(0);
        let write_latency = if elapsed > 0.0 && write_delta > 0.0 {
            (current.ms_written.wrapping_sub(prev_w)) as f64 / write_delta
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
        };

        // Update snapshot using current parameter (not re-reading /proc/diskstats)
        if let Some(s) = guard.get_mut(disk_name) {
            s.reads.insert(disk_name.clone(), current.reads_completed);
            s.writes.insert(disk_name.clone(), current.writes_completed);
            s.read_sectors.insert(disk_name.clone(), current.sectors_read);
            s.write_sectors.insert(disk_name.clone(), current.sectors_written);
            s.prev_weighted_ms.insert(disk_name.clone(), current._weighted_ms);
            s.prev_ms_read.insert(disk_name.clone(), current.ms_read);
            s.prev_ms_written.insert(disk_name.clone(), current.ms_written);
            s.timestamp = std::time::Instant::now();
        }

        Some(io)
    } else {
        guard.insert(disk_name.clone(), DiskStatsSnapshot {
            timestamp: std::time::Instant::now(),
            reads: std::collections::HashMap::from([(disk_name.clone(), current.reads_completed)]),
            writes: std::collections::HashMap::from([(disk_name.clone(), current.writes_completed)]),
            read_sectors: std::collections::HashMap::from([(disk_name.clone(), current.sectors_read)]),
            write_sectors: std::collections::HashMap::from([(disk_name.clone(), current.sectors_written)]),
            prev_weighted_ms: std::collections::HashMap::from([(disk_name.clone(), current._weighted_ms)]),
            prev_ms_read: std::collections::HashMap::from([(disk_name.clone(), current.ms_read)]),
            prev_ms_written: std::collections::HashMap::from([(disk_name.clone(), current.ms_written)]),
        });
        None
    }
}
fn current_stats() -> std::collections::HashMap<String, DiskStat> {
    read_disk_stats()
}

pub fn collect_storage_metrics() -> Vec<StorageMetrics> {
    let mounts = read_proc_mounts();
    let mut result = Vec::new();

    for mount in mounts {
        if is_pseudo(&mount.fs_type) {
            continue;
        }

        let mount_path = mount.mount_point.clone();
        let path = std::ffi::CString::new(mount_path.as_str()).unwrap();
        let mut sv = unsafe { std::mem::zeroed() };
        if unsafe { c_statvfs(path.as_ptr(), &mut sv) } < 0 {
            continue;
        }

        let total = sv.f_blocks * sv.f_bsize;
        if total == 0 {
            continue;
        }
        let free = sv.f_bfree * sv.f_bsize;
        let used = total.saturating_sub(free);
        let util = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        result.push(StorageMetrics {
            device: mount.device,
            mount_point: mount.mount_point,
            filesystem: mount.fs_type,
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            utilization_percent: (util * 100.0).round() / 100.0,
        });
    }

    result
}

pub fn collect_storage_by_device() -> Vec<DeviceStorageInfo> {
    let mounts = read_proc_mounts();
    let disk_stats = read_disk_stats();
    let mut device_map: std::collections::BTreeMap<String, Vec<StorageMetrics>> = std::collections::BTreeMap::new();
    let mut io_map: std::collections::BTreeMap<String, DiskIOStats> = std::collections::BTreeMap::new();

    // Initialize LAST_SNAPSHOT before compute_io_stats calls so the first valid computation has a proper baseline
    let mut snap_guard = LAST_SNAPSHOT.lock().unwrap();
    if snap_guard.is_empty() {
        let cs = current_stats();
        let ts = std::time::Instant::now() - std::time::Duration::from_secs(1);
        for (name, stat) in cs {
            if is_partition_device(&name) {
                continue;
            }
            snap_guard.insert(name.clone(), DiskStatsSnapshot {
                timestamp: ts,
                reads: std::collections::HashMap::new(),
                writes: std::collections::HashMap::new(),
                read_sectors: std::collections::HashMap::new(),
                write_sectors: std::collections::HashMap::new(),
                prev_weighted_ms: std::collections::HashMap::new(),
                prev_ms_read: std::collections::HashMap::new(),
                prev_ms_written: std::collections::HashMap::new(),
            });
            if let Some(s) = snap_guard.get_mut(&name) {
                s.reads.insert(name.clone(), stat.reads_completed);
                s.writes.insert(name.clone(), stat.writes_completed);
                s.read_sectors.insert(name.clone(), stat.sectors_read);
                s.write_sectors.insert(name.clone(), stat.sectors_written);
                s.prev_weighted_ms.insert(name.clone(), stat._weighted_ms);
                s.prev_ms_read.insert(name.clone(), stat.ms_read);
                s.prev_ms_written.insert(name.clone(), stat.ms_written);
            }
        }
    }
    drop(snap_guard);

    // Compute IO stats for base devices only (kernel already includes partition I/O in parent counters)
    let mut aggregated_io: std::collections::BTreeMap<String, DiskIOStats> = std::collections::BTreeMap::new();
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
        if is_pseudo(&mount.fs_type) {
            continue;
        }

        let mount_path = mount.mount_point.clone();
        let path = std::ffi::CString::new(mount_path.as_str()).unwrap();
        let mut sv = unsafe { std::mem::zeroed() };
        if unsafe { c_statvfs(path.as_ptr(), &mut sv) } < 0 {
            continue;
        }

        let total = sv.f_blocks * sv.f_bsize;
        if total == 0 {
            continue;
        }
        let free = sv.f_bfree * sv.f_bsize;
        let used = total.saturating_sub(free);
        let util = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

       let dev = base_device(&mount.device);
        let metrics = StorageMetrics {
            device: mount.device,
            mount_point: mount.mount_point,
            filesystem: mount.fs_type,
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            utilization_percent: (util * 100.0).round() / 100.0,
        };

        device_map.entry(dev.clone()).or_default().push(metrics);

        // Use aggregated IO stats for this base device
        let disk_name = dev.trim_start_matches("/dev/").to_string();
        if let Some(io) = aggregated_io.get(&disk_name) {
            io_map.insert(dev, io.clone());
        }
    }

    device_map.into_iter()
        .map(|(device, mounts)| {
            let io = io_map.get(&device).cloned();
            DeviceStorageInfo {
                device,
                mounts,
                io_stats: io,
            }
        })
        .collect()
}

/// Collect storage history data points for all devices
pub fn collect_storage_history() -> Vec<StorageHistoryPoint> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    let mut result = Vec::new();

    // Get current IO stats — use base devices only (kernel includes partition I/O in parent)
    let _mounts = read_proc_mounts();
    let disk_stats = read_disk_stats();

    let current_io: BTreeMap<String, (u64, u64, u64, u64)> = disk_stats
        .iter()
        .filter(|(_, stat)| !is_loop_device(&stat.name) && !is_partition_device(&stat.name))
        .map(|(_, stat)| (stat.name.clone(), (stat.reads_completed, stat.writes_completed, stat.sectors_read, stat.sectors_written)))
        .collect();

      let mut history_guard = STORAGE_HISTORY.lock().unwrap();

    // Initialize if needed
    let state = history_guard.get_or_insert_with(init_storage_history);
    let elapsed = state.last_timestamp.elapsed().as_secs_f64();
    state.last_timestamp = std::time::Instant::now();

    // Track which devices are currently active
    let active_devices: std::collections::HashSet<String> =
        current_io.keys().cloned().collect();

    // Remove stale devices no longer in current_io
    state.buffers.retain(|device, _| active_devices.contains(device));

    for (device, (reads, writes, _, _)) in &current_io {
        if is_loop_device(device) {
            continue;
        }
        let prev = state.last_io_stats.get(device).copied().unwrap_or((*reads, *writes));

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

        // I/O utilization from weighted milliseconds (combined read+write)
        let utilization: f64 = {
            let prev_w = state.prev_weighted_ms.get(device).copied().unwrap_or(0);
            let cur_w = cur_read + cur_written;
            let weighted_delta = (cur_w.wrapping_sub(prev_w)) as f64;
            if elapsed > 0.01 {
                (weighted_delta / elapsed / 10.0).min(100.0)
            } else {
                0.0
            }
        };
        state.prev_weighted_ms.insert(device.clone(), cur_read + cur_written);
        state.prev_ms_read.insert(device.clone(), cur_read);
        state.prev_ms_written.insert(device.clone(), cur_written);

        // Update buffer
        let buffer = state.buffers
            .entry(device.to_string())
            .or_insert_with(|| DeviceHistoryBuffer {
                slots: vec!(None; STORAGE_HISTORY_SIZE),
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

        state.last_io_stats.insert(device.to_string(), (*reads, *writes));
    }

    // Collect all non-None slots from each device's buffer
    for (device, buffer) in &state.buffers {
        for (i, slot_data) in buffer.slots.iter().enumerate() {
            if let Some(data) = slot_data
                && data.device == *device {
                    let mut cloned = data.clone();
                    cloned.slot = i;
                    result.push(cloned);
                }
        }
    }

    result
}
