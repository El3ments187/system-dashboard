//! Memory metrics collector using sysinfo.

use crate::collectors::cpu::SYSTEM;
use crate::models::metrics::MemoryMetrics;

pub fn collect_memory_metrics() -> MemoryMetrics {
    let mut system = SYSTEM.lock().unwrap();
    system.refresh_memory();
    let total = system.total_memory();
    let available = system.available_memory();
    let used = total - available;
    let utilization = if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 };

    let swap_total = system.total_swap();
    let swap_used = system.used_swap();

    MemoryMetrics {
        total_gb: bytes_to_gb(total),
        used_gb: bytes_to_gb(used),
        utilization_percent: utilization,
        swap_total_gb: bytes_to_gb(swap_total),
        swap_used_gb: bytes_to_gb(swap_used),
    }
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0 * 1024.0)
}
