//! Parses GPU layer offload information from llama.cpp startup logs.
//!
//! Detects lines like:
//!   `load_tensors`: offloaded 31/31 layers to GPU
//!
//! Distinguishes the primary model from the draft/MTP model by detecting
//! markers that precede the draft model's `load_tensors` output:
//!   srv `load_model`: loading draft model
//!   `common_speculative_impl_draft_mtp`

use crate::models::ai::GpuOffloadInfo;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

#[derive(Debug, Clone, Default)]
struct GpuOffloadState {
    main_loaded: Option<u32>,
    main_total: Option<u32>,
    draft_loaded: Option<u32>,
    draft_total: Option<u32>,
    is_loading_draft: bool,
}

impl GpuOffloadState {
    fn to_info(&self) -> Option<GpuOffloadInfo> {
        Some(GpuOffloadInfo {
            main_loaded: self.main_loaded?,
            main_total: self.main_total?,
            draft_loaded: self.draft_loaded,
            draft_total: self.draft_total,
        })
    }
}

static GPU_OFFLOAD: LazyLock<Mutex<HashMap<String, GpuOffloadState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Clear GPU offload state for a script. Call when a model starts or stops.
pub fn clear(script_path: &str) {
    let mut map = GPU_OFFLOAD.lock().unwrap();
    map.remove(script_path);
}

/// Process a single log line, updating GPU offload state for the given script.
pub fn process_line(script_path: &str, line: &str) {
    let is_draft = line_is_draft_marker(line);
    let offload = parse_offload_line(line);

    if !is_draft && offload.is_none() {
        return;
    }

    let mut map = GPU_OFFLOAD.lock().unwrap();
    let state = map.entry(script_path.to_string()).or_default();

    if is_draft {
        state.is_loading_draft = true;
    }

    if let Some((loaded, total)) = offload {
        if state.is_loading_draft {
            state.draft_loaded = Some(loaded);
            state.draft_total = Some(total);
        } else {
            state.main_loaded = Some(loaded);
            state.main_total = Some(total);
        }
    }
}

/// Return GPU offload info for the given script, if any offload data has been parsed.
pub fn get_info(script_path: &str) -> Option<GpuOffloadInfo> {
    let map = GPU_OFFLOAD.lock().unwrap();
    map.get(script_path).and_then(GpuOffloadState::to_info)
}

/// Returns true if the line signals that the draft/MTP model is about to load.
fn line_is_draft_marker(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("loading draft model")
        || lower.contains("common_speculative_impl_draft_mtp")
        || lower.contains("load_model: loading draft")
}

/// Parse "offloaded X/Y layers to GPU" from a log line.
/// Returns (loaded, total) on success, None otherwise.
#[must_use]
pub fn parse_offload_line(line: &str) -> Option<(u32, u32)> {
    let lower = line.to_lowercase();

    if !lower.contains("offloaded") || !lower.contains("layers") || !lower.contains("gpu") {
        return None;
    }

    let start = lower.find("offloaded")?;
    let rest = line[start + "offloaded".len()..].trim_start();

    let slash = rest.find('/')?;
    let loaded: u32 = rest[..slash].trim().parse().ok()?;

    let after_slash = &rest[slash + 1..];
    let end = after_slash
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after_slash.len());
    let total: u32 = after_slash[..end].parse().ok()?;

    Some((loaded, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse_offload_line ─────────────────────────────────────────────

    #[test]
    fn parse_main_model_offload() {
        assert_eq!(
            parse_offload_line("load_tensors: offloaded 31/31 layers to GPU"),
            Some((31, 31))
        );
    }

    #[test]
    fn parse_draft_model_offload() {
        assert_eq!(
            parse_offload_line("load_tensors: offloaded 5/5 layers to GPU"),
            Some((5, 5))
        );
    }

    #[test]
    fn parse_partial_offload() {
        assert_eq!(
            parse_offload_line("load_tensors: offloaded 23/31 layers to GPU"),
            Some((23, 31))
        );
    }

    #[test]
    fn parse_zero_offload() {
        assert_eq!(
            parse_offload_line("load_tensors: offloaded 0/31 layers to GPU"),
            Some((0, 31))
        );
    }

    #[test]
    fn parse_no_match_unrelated_line() {
        assert_eq!(
            parse_offload_line("server listening at http://0.0.0.0:8081"),
            None
        );
    }

    #[test]
    fn parse_no_match_missing_gpu() {
        assert_eq!(
            parse_offload_line("load_tensors: offloaded 31/31 layers to CPU"),
            None
        );
    }

    #[test]
    fn parse_no_match_no_fraction() {
        assert_eq!(parse_offload_line("offloaded layers to GPU"), None);
    }

    // ─── GpuOffloadState::to_info ───────────────────────────────────────

    #[test]
    fn to_info_no_draft() {
        let state = GpuOffloadState {
            main_loaded: Some(31),
            main_total: Some(31),
            draft_loaded: None,
            draft_total: None,
            is_loading_draft: false,
        };
        let info = state.to_info().unwrap();
        assert_eq!(info.main_loaded, 31);
        assert_eq!(info.main_total, 31);
        assert!(info.draft_loaded.is_none());
        assert!(info.draft_total.is_none());
    }

    #[test]
    fn to_info_with_draft() {
        let state = GpuOffloadState {
            main_loaded: Some(31),
            main_total: Some(31),
            draft_loaded: Some(5),
            draft_total: Some(5),
            is_loading_draft: true,
        };
        let info = state.to_info().unwrap();
        assert_eq!(info.main_loaded, 31);
        assert_eq!(info.main_total, 31);
        assert_eq!(info.draft_loaded, Some(5));
        assert_eq!(info.draft_total, Some(5));
    }

    #[test]
    fn to_info_returns_none_when_main_missing() {
        let state = GpuOffloadState::default();
        assert!(state.to_info().is_none());
    }

    // ─── total layer calculations ───────────────────────────────────────

    #[test]
    fn total_layers_no_draft() {
        let info = GpuOffloadInfo {
            main_loaded: 31,
            main_total: 31,
            draft_loaded: None,
            draft_total: None,
        };
        let total_loaded = info.main_loaded + info.draft_loaded.unwrap_or(0);
        let total_layers = info.main_total + info.draft_total.unwrap_or(0);
        assert_eq!(total_loaded, 31);
        assert_eq!(total_layers, 31);
    }

    #[test]
    fn total_layers_with_draft() {
        let info = GpuOffloadInfo {
            main_loaded: 31,
            main_total: 31,
            draft_loaded: Some(5),
            draft_total: Some(5),
        };
        let total_loaded = info.main_loaded + info.draft_loaded.unwrap_or(0);
        let total_layers = info.main_total + info.draft_total.unwrap_or(0);
        assert_eq!(total_loaded, 36);
        assert_eq!(total_layers, 36);
    }

    #[test]
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn percentage_full_offload() {
        let loaded = 36u32;
        let total = 36u32;
        let pct = (f64::from(loaded) / f64::from(total) * 100.0).round() as u32;
        assert_eq!(pct, 100);
    }

    #[test]
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn percentage_partial_offload() {
        let info = GpuOffloadInfo {
            main_loaded: 23,
            main_total: 31,
            draft_loaded: Some(5),
            draft_total: Some(5),
        };
        let total_loaded = info.main_loaded + info.draft_loaded.unwrap_or(0);
        let total_layers = info.main_total + info.draft_total.unwrap_or(0);
        let pct = (f64::from(total_loaded) / f64::from(total_layers) * 100.0).round() as u32;
        assert_eq!(total_loaded, 28);
        assert_eq!(total_layers, 36);
        assert_eq!(pct, 78);
    }

    #[test]
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn percentage_no_draft_partial() {
        let info = GpuOffloadInfo {
            main_loaded: 23,
            main_total: 31,
            draft_loaded: None,
            draft_total: None,
        };
        let total_loaded = info.main_loaded + info.draft_loaded.unwrap_or(0);
        let total_layers = info.main_total + info.draft_total.unwrap_or(0);
        let pct = (f64::from(total_loaded) / f64::from(total_layers) * 100.0).round() as u32;
        assert_eq!(pct, 74);
    }

    // ─── process_line / state transitions ──────────────────────────────

    #[test]
    fn state_reset_when_model_stops() {
        let script = "/test/stop_reset.sh";
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        assert!(get_info(script).is_some());
        clear(script);
        assert!(get_info(script).is_none());
    }

    #[test]
    fn state_reset_when_another_model_loads() {
        let script = "/test/reload_reset.sh";
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        assert_eq!(get_info(script).unwrap().main_loaded, 31);
        // Simulate new model starting: clear then parse new offload
        clear(script);
        process_line(script, "load_tensors: offloaded 46/46 layers to GPU");
        assert_eq!(get_info(script).unwrap().main_loaded, 46);
        clear(script);
    }

    #[test]
    fn draft_marker_routes_subsequent_offload_to_draft() {
        let script = "/test/draft_routing.sh";
        clear(script);
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        process_line(script, "srv load_model: loading draft model 'draft.gguf'");
        process_line(script, "load_tensors: offloaded 5/5 layers to GPU");
        let info = get_info(script).unwrap();
        assert_eq!(info.main_loaded, 31);
        assert_eq!(info.main_total, 31);
        assert_eq!(info.draft_loaded, Some(5));
        assert_eq!(info.draft_total, Some(5));
        clear(script);
    }

    #[test]
    fn no_draft_scenario_only_shows_main() {
        let script = "/test/no_draft.sh";
        clear(script);
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        let info = get_info(script).unwrap();
        assert_eq!(info.main_loaded, 31);
        assert_eq!(info.main_total, 31);
        assert!(info.draft_loaded.is_none());
        assert!(info.draft_total.is_none());
        clear(script);
    }

    #[test]
    fn common_speculative_marker_routes_to_draft() {
        let script = "/test/spec_marker.sh";
        clear(script);
        process_line(script, "load_tensors: offloaded 31/31 layers to GPU");
        process_line(script, "common_speculative_impl_draft_mtp: initializing");
        process_line(script, "load_tensors: offloaded 5/5 layers to GPU");
        let info = get_info(script).unwrap();
        assert_eq!(info.draft_loaded, Some(5));
        clear(script);
    }

    #[test]
    fn unrelated_lines_do_not_change_state() {
        let script = "/test/unrelated.sh";
        clear(script);
        process_line(script, "server listening at http://0.0.0.0:8081");
        process_line(script, "model loaded successfully");
        process_line(script, "update_slots: all slots are idle");
        assert!(get_info(script).is_none());
        clear(script);
    }

    #[test]
    fn get_info_unknown_script_returns_none() {
        assert!(get_info("/nonexistent/path.sh").is_none());
    }

    // T248: MTP/EAGLE are in-model prediction heads — llama.cpp never logs
    // "loading draft model" for them, so draft_loaded must stay None. The
    // frontend uses spec_type (not this field) to display n/a — MTP/EAGLE.
    #[test]
    fn no_draft_marker_leaves_draft_loaded_none() {
        let script = "/test/mtp_no_draft_marker.sh";
        clear(script);
        // Typical MTP run: only the main model offload line appears.
        process_line(script, "load_tensors: offloaded 46/46 layers to GPU");
        let info = get_info(script).unwrap();
        assert_eq!(info.main_loaded, 46);
        assert!(
            info.draft_loaded.is_none(),
            "draft_loaded must be None when no loading-draft marker was seen"
        );
        clear(script);
    }
}
