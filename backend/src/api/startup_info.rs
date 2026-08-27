//! Tracks model load time and KV buffer memory from llama.cpp startup logs.
//!
//! Load time: measured from `on_load_start()` to `on_load_ready()` (first health success).
//! KV buffer: accumulated from lines like "CUDA0 KV buffer size = 720.00 MiB".

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;

struct StartupState {
    load_start: Option<Instant>,
    load_time_ms: Option<f64>,
    kv_reserved_mib: f64,
}

impl Default for StartupState {
    fn default() -> Self {
        Self {
            load_start: None,
            load_time_ms: None,
            kv_reserved_mib: 0.0,
        }
    }
}

static STARTUP_INFO: LazyLock<Mutex<HashMap<String, StartupState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Record the model load start time. Resets KV buffer accumulator and previous load time.
pub fn on_load_start(script_path: &str) {
    let mut map = STARTUP_INFO.lock().unwrap();
    let state = map.entry(script_path.to_string()).or_default();
    state.load_start = Some(Instant::now());
    state.load_time_ms = None;
    state.kv_reserved_mib = 0.0;
}

/// Record that the model is ready. Computes elapsed ms since `on_load_start()`.
pub fn on_load_ready(script_path: &str) {
    let mut map = STARTUP_INFO.lock().unwrap();
    if let Some(state) = map.get_mut(script_path)
        && let Some(start) = state.load_start
    {
        state.load_time_ms = Some(start.elapsed().as_secs_f64() * 1000.0);
    }
}

/// Process a single log line, accumulating KV buffer size if the line matches.
pub fn process_line(script_path: &str, line: &str) {
    let Some(mib) = parse_kv_buffer_line(line) else {
        return;
    };
    let mut map = STARTUP_INFO.lock().unwrap();
    let state = map.entry(script_path.to_string()).or_default();
    state.kv_reserved_mib += mib;
}

/// Clear all startup state for a script. Call when a model stops or a new one starts.
pub fn clear(script_path: &str) {
    let mut map = STARTUP_INFO.lock().unwrap();
    map.remove(script_path);
}

/// Return the load time in ms for the given script, if the model has finished loading.
pub fn get_load_time_ms(script_path: &str) -> Option<f64> {
    let map = STARTUP_INFO.lock().unwrap();
    map.get(script_path).and_then(|s| s.load_time_ms)
}

/// Return the total KV buffer reserved MiB, or None if nothing was accumulated.
pub fn get_kv_reserved_mib(script_path: &str) -> Option<f64> {
    let map = STARTUP_INFO.lock().unwrap();
    map.get(script_path).and_then(|s| {
        if s.kv_reserved_mib > 0.0 {
            Some(s.kv_reserved_mib)
        } else {
            None
        }
    })
}

/// Parse a KV buffer size line from llama.cpp startup output.
///
/// Matches lines containing "kv buffer size" and "=", e.g.:
///   "CUDA0 KV buffer size = 720.00 MiB"
///   "CPU KV buffer size = 32.00 MiB"
///
/// Returns the MiB value or None if the line does not match.
#[must_use]
pub fn parse_kv_buffer_line(line: &str) -> Option<f64> {
    let lower = line.to_lowercase();
    if !lower.contains("kv buffer size") {
        return None;
    }
    let eq = lower.find('=')?;
    let rest = line[eq + 1..].trim_start();
    let end = rest.find([' ', '\t', '\n']).unwrap_or(rest.len());
    rest[..end].parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse_kv_buffer_line ────────────────────────────────────────────

    #[test]
    fn parse_cuda0_kv_buffer_line() {
        assert_eq!(
            parse_kv_buffer_line("CUDA0 KV buffer size = 720.00 MiB"),
            Some(720.0)
        );
    }

    #[test]
    fn parse_cuda1_kv_buffer_line() {
        assert_eq!(
            parse_kv_buffer_line("CUDA1 KV buffer size = 480.00 MiB"),
            Some(480.0)
        );
    }

    #[test]
    fn parse_cpu_kv_buffer_line() {
        assert_eq!(
            parse_kv_buffer_line("CPU KV buffer size = 32.50 MiB"),
            Some(32.5)
        );
    }

    #[test]
    fn parse_kv_buffer_integer_value() {
        assert_eq!(
            parse_kv_buffer_line("CUDA0 KV buffer size = 512 MiB"),
            Some(512.0)
        );
    }

    #[test]
    fn parse_kv_buffer_no_match_unrelated_line() {
        assert_eq!(
            parse_kv_buffer_line("server listening at http://0.0.0.0:8081"),
            None
        );
    }

    #[test]
    fn parse_kv_buffer_offload_line_returns_none() {
        assert_eq!(
            parse_kv_buffer_line("load_tensors: offloaded 31/31 layers to GPU"),
            None
        );
    }

    #[test]
    fn parse_kv_buffer_missing_eq_returns_none() {
        assert_eq!(
            parse_kv_buffer_line("CUDA0 KV buffer size 720.00 MiB"),
            None
        );
    }

    #[test]
    fn parse_kv_buffer_unrelated_eq_returns_none() {
        assert_eq!(
            parse_kv_buffer_line("some = other value without kv buffer"),
            None
        );
    }

    #[test]
    fn parse_kv_buffer_case_insensitive() {
        assert_eq!(
            parse_kv_buffer_line("cuda0 kv buffer size = 720.00 MiB"),
            Some(720.0)
        );
    }

    #[test]
    fn parse_kv_buffer_mixed_case() {
        assert_eq!(
            parse_kv_buffer_line("CUDA0 KV Buffer Size = 360.00 MiB"),
            Some(360.0)
        );
    }

    // ─── Accumulation across multiple GPUs ──────────────────────────────

    #[test]
    fn accumulates_multiple_gpu_kv_buffers() {
        let script = "/test/startup_accumulate.sh";
        clear(script);
        on_load_start(script);
        process_line(script, "CUDA0 KV buffer size = 720.00 MiB");
        process_line(script, "CUDA1 KV buffer size = 480.00 MiB");
        assert_eq!(get_kv_reserved_mib(script), Some(1200.0));
        clear(script);
    }

    #[test]
    fn kv_reserved_returns_none_when_zero() {
        let script = "/test/startup_zero_kv.sh";
        clear(script);
        on_load_start(script);
        assert!(get_kv_reserved_mib(script).is_none());
        clear(script);
    }

    #[test]
    fn unrelated_lines_do_not_accumulate() {
        let script = "/test/startup_unrelated.sh";
        clear(script);
        on_load_start(script);
        process_line(script, "server listening on port 8081");
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        assert!(get_kv_reserved_mib(script).is_none());
        clear(script);
    }

    // ─── Load time tracking ──────────────────────────────────────────────

    #[test]
    fn load_time_none_before_ready() {
        let script = "/test/startup_lt_none.sh";
        clear(script);
        on_load_start(script);
        assert!(get_load_time_ms(script).is_none());
        clear(script);
    }

    #[test]
    fn load_time_some_after_ready() {
        let script = "/test/startup_lt_some.sh";
        clear(script);
        on_load_start(script);
        std::thread::sleep(std::time::Duration::from_millis(5));
        on_load_ready(script);
        let t = get_load_time_ms(script);
        assert!(t.is_some());
        assert!(t.unwrap() >= 0.0);
        clear(script);
    }

    #[test]
    fn load_time_reasonable_magnitude() {
        let script = "/test/startup_lt_mag.sh";
        clear(script);
        on_load_start(script);
        std::thread::sleep(std::time::Duration::from_millis(10));
        on_load_ready(script);
        let t = get_load_time_ms(script).unwrap();
        assert!((5.0..2000.0).contains(&t), "Expected 5..2000ms, got {t}");
        clear(script);
    }

    #[test]
    fn load_time_none_when_no_start() {
        let script = "/test/startup_no_start.sh";
        clear(script);
        on_load_ready(script);
        assert!(get_load_time_ms(script).is_none());
        clear(script);
    }

    // ─── State reset on new model load ───────────────────────────────────

    #[test]
    fn clear_resets_all_state() {
        let script = "/test/startup_clear_reset.sh";
        clear(script);
        on_load_start(script);
        process_line(script, "CUDA0 KV buffer size = 720.00 MiB");
        on_load_ready(script);
        assert!(get_load_time_ms(script).is_some());
        assert!(get_kv_reserved_mib(script).is_some());
        clear(script);
        assert!(get_load_time_ms(script).is_none());
        assert!(get_kv_reserved_mib(script).is_none());
    }

    #[test]
    fn on_load_start_resets_kv_and_load_time() {
        let script = "/test/startup_start_resets.sh";
        clear(script);
        on_load_start(script);
        process_line(script, "CUDA0 KV buffer size = 720.00 MiB");
        on_load_ready(script);
        // Second model starts — should reset
        on_load_start(script);
        assert!(get_load_time_ms(script).is_none());
        assert!(get_kv_reserved_mib(script).is_none());
        clear(script);
    }

    #[test]
    fn unknown_script_returns_none() {
        assert!(get_load_time_ms("/nonexistent/startup_test.sh").is_none());
        assert!(get_kv_reserved_mib("/nonexistent/startup_test.sh").is_none());
    }

    // ─── Multiple scripts isolated ────────────────────────────────────────

    #[test]
    fn multiple_scripts_isolated() {
        let s1 = "/test/startup_isolated_a.sh";
        let s2 = "/test/startup_isolated_b.sh";
        clear(s1);
        clear(s2);
        on_load_start(s1);
        process_line(s1, "CUDA0 KV buffer size = 720.00 MiB");
        on_load_ready(s1);
        on_load_start(s2);
        process_line(s2, "CUDA0 KV buffer size = 360.00 MiB");
        assert!(get_load_time_ms(s1).is_some());
        assert!(get_load_time_ms(s2).is_none());
        assert_eq!(get_kv_reserved_mib(s1), Some(720.0));
        assert_eq!(get_kv_reserved_mib(s2), Some(360.0));
        clear(s1);
        clear(s2);
    }
}
