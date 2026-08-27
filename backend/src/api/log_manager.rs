//! Per-profile llama.cpp process log capture, storage, and real-time streaming.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

pub const MAX_LOG_LINES: usize = 5000;
const BROADCAST_CAPACITY: usize = 512;
/// `get_live_tg` returns `None` if no `print_timing` line arrived within this window.
const LIVE_TG_STALE_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
    Stats,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    pub timestamp: String,
    pub stream: LogStream,
    pub level: LogLevel,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogEvent {
    Log { line: LogLine },
    Exited,
}

struct ProfileLogBuffer {
    history: VecDeque<LogLine>,
    sender: broadcast::Sender<LogEvent>,
    process_exited: bool,
    /// Running-average t/s parsed from the most recent `print_timing` log line.
    live_tg: Option<f64>,
    live_tg_at: Option<Instant>,
}

impl ProfileLogBuffer {
    fn new() -> Self {
        let (sender, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            history: VecDeque::new(),
            sender,
            process_exited: false,
            live_tg: None,
            live_tg_at: None,
        }
    }
}

pub struct LogManager {
    inner: RwLock<HashMap<String, ProfileLogBuffer>>,
}

impl LogManager {
    fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }

    pub fn add_line(&self, script_path: &str, line: LogLine) {
        let mut inner = self.inner.write().unwrap();
        let buf = inner
            .entry(script_path.to_string())
            .or_insert_with(ProfileLogBuffer::new);
        if buf.history.len() >= MAX_LOG_LINES {
            buf.history.pop_front();
        }
        // Parse tg while we hold only the log-buffer lock — no other lock is
        // taken here, so there is no ordering hazard with LAUNCHER_STATE.
        if let Some(tg) = parse_tg_from_timing_line(&line.text) {
            buf.live_tg = Some(tg);
            buf.live_tg_at = Some(Instant::now());
        }
        buf.history.push_back(line.clone());
        let _ = buf.sender.send(LogEvent::Log { line });
    }

    pub fn get_history(&self, script_path: &str) -> (Vec<LogLine>, bool) {
        let inner = self.inner.read().unwrap();
        match inner.get(script_path) {
            Some(buf) => (buf.history.iter().cloned().collect(), buf.process_exited),
            None => (Vec::new(), false),
        }
    }

    pub fn clear(&self, script_path: &str) {
        let mut inner = self.inner.write().unwrap();
        if let Some(buf) = inner.get_mut(script_path) {
            buf.history.clear();
            buf.process_exited = false;
            buf.live_tg = None;
            buf.live_tg_at = None;
        }
    }

    /// Returns the `tg` t/s value from the most recent `print_timing` log line,
    /// or `None` if no such line arrived within `LIVE_TG_STALE_SECS` seconds.
    ///
    /// Only the log-buffer read lock is held — `LAUNCHER_STATE` is never touched,
    /// so there is no cross-lock ordering hazard.
    pub fn get_live_tg(&self, script_path: &str) -> Option<f64> {
        let inner = self.inner.read().unwrap();
        let buf = inner.get(script_path)?;
        let at = buf.live_tg_at?;
        if at.elapsed() > Duration::from_secs(LIVE_TG_STALE_SECS) {
            return None;
        }
        buf.live_tg
    }

    pub fn subscribe(
        &self,
        script_path: &str,
    ) -> (broadcast::Receiver<LogEvent>, Vec<LogLine>, bool) {
        let mut inner = self.inner.write().unwrap();
        let buf = inner
            .entry(script_path.to_string())
            .or_insert_with(ProfileLogBuffer::new);
        let rx = buf.sender.subscribe();
        let history: Vec<LogLine> = buf.history.iter().cloned().collect();
        let exited = buf.process_exited;
        (rx, history, exited)
    }

    pub fn set_process_exited(&self, script_path: &str) {
        let mut inner = self.inner.write().unwrap();
        let buf = inner
            .entry(script_path.to_string())
            .or_insert_with(ProfileLogBuffer::new);
        if !buf.process_exited {
            buf.process_exited = true;
            let _ = buf.sender.send(LogEvent::Exited);
        }
    }
}

static LOG_MANAGER: OnceLock<Arc<LogManager>> = OnceLock::new();

pub fn get_log_manager() -> Arc<LogManager> {
    LOG_MANAGER
        .get_or_init(|| Arc::new(LogManager::new()))
        .clone()
}

/// Parse the running-average generation speed (`tg`) from a llama-server
/// `print_timing` log line.
///
/// Example line (verbatim from llama-server with `-lv 4`):
/// ```text
/// 383.58.946.679 I slot print_timing: id  0 | task 172319 | n_gen = 19485, tg = 12.35 t/s, tg_3s = 11.32 t/s
/// ```
///
/// Returns `None` if the line does not contain `"print_timing"` (fast-path —
/// no further parsing) or if `tg` is zero/negative.
pub(crate) fn parse_tg_from_timing_line(text: &str) -> Option<f64> {
    if !text.contains("print_timing") {
        return None;
    }
    let tokens: Vec<&str> = text.split_whitespace().collect();
    let n = tokens.len();
    for i in 0..n.saturating_sub(2) {
        // Match "tg" exactly — "tg_3s" is a different token and is skipped.
        if tokens[i] == "tg" && tokens[i + 1] == "=" {
            let val: f64 = tokens[i + 2].parse().ok()?;
            if val > 0.0 {
                return Some(val);
            }
            return None;
        }
    }
    None
}

/// Classify the severity of a raw log line from llama.cpp stdout/stderr.
#[must_use]
pub fn classify_log_level(text: &str) -> LogLevel {
    // Newer llama.cpp versions emit JSON-structured logs; extract the "level" field.
    let trimmed = text.trim_start();
    if trimmed.starts_with('{')
        && let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed)
        && let Some(level_str) = v.get("level").and_then(|l| l.as_str())
    {
        return match level_str.to_uppercase().as_str() {
            "ERROR" | "ERR" => LogLevel::Error,
            "WARN" | "WARNING" => LogLevel::Warn,
            "DEBUG" | "DBG" => LogLevel::Debug,
            _ => LogLevel::Info,
        };
    }

    let lower = text.to_lowercase();

    // Stats: check first to avoid false positives (e.g. a stats line that
    // mentions "error rate" would wrongly classify as Error otherwise).
    if lower.contains("tok/s")
        || lower.contains("tokens/s")
        || lower.contains("prompt eval")
        || lower.contains("tokens generated")
        || lower.contains("generation stats")
        || lower.contains("prompt processing")
        || lower.contains("llama_print_timings")
    {
        return LogLevel::Stats;
    }

    // Errors
    if lower.contains("ggml_assert")
        || lower.contains("segmentation fault")
        || lower.contains("segfault")
        || lower.contains("address already in use")
        || lower.contains("failed to load")
        || lower.contains("failed to open")
        || lower.contains("failed to bind")
        || lower.contains("fatal:")
        || lower.contains("error:")
        || lower.contains(": error")
        || lower.starts_with("error")
        || lower.contains("[error]")
    {
        return LogLevel::Error;
    }

    // Warnings
    if lower.contains("warning")
        || lower.contains("[warn]")
        || lower.contains("context shift")
        || lower.contains("dropping tokens")
        || lower.contains("deprecated")
    {
        return LogLevel::Warn;
    }

    // Debug
    if lower.contains("[debug]") || lower.contains("(debug)") || lower.contains("dbg:") {
        return LogLevel::Debug;
    }

    LogLevel::Info
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_line(text: &str) -> LogLine {
        LogLine {
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            stream: LogStream::Stdout,
            level: LogLevel::Info,
            text: text.to_string(),
        }
    }

    // ─── classify_log_level ─────────────────────────────────────────────

    #[test]
    fn classify_info_lines() {
        assert_eq!(
            classify_log_level("loading model from /path/to/model.gguf"),
            LogLevel::Info
        );
        assert_eq!(
            classify_log_level("server listening at http://0.0.0.0:8080"),
            LogLevel::Info
        );
        assert_eq!(classify_log_level("health endpoint ready"), LogLevel::Info);
        assert_eq!(
            classify_log_level("loaded tensors from model file"),
            LogLevel::Info
        );
    }

    #[test]
    fn classify_error_lines() {
        assert_eq!(classify_log_level("error: file not found"), LogLevel::Error);
        assert_eq!(
            classify_log_level("GGML_ASSERT: condition failed"),
            LogLevel::Error
        );
        assert_eq!(classify_log_level("Segmentation fault"), LogLevel::Error);
        assert_eq!(
            classify_log_level("Address already in use (port 8080)"),
            LogLevel::Error
        );
        assert_eq!(
            classify_log_level("failed to load model weights"),
            LogLevel::Error
        );
        assert_eq!(
            classify_log_level("fatal: unexpected exit"),
            LogLevel::Error
        );
    }

    #[test]
    fn classify_warn_lines() {
        assert_eq!(
            classify_log_level("warning: context size too large"),
            LogLevel::Warn
        );
        assert_eq!(
            classify_log_level("context shift triggered at token 4096"),
            LogLevel::Warn
        );
        assert_eq!(
            classify_log_level("dropping tokens due to overflow"),
            LogLevel::Warn
        );
    }

    #[test]
    fn classify_stats_lines() {
        assert_eq!(
            classify_log_level("llama_print_timings: prompt eval time = 100ms / 512 tokens"),
            LogLevel::Stats
        );
        assert_eq!(
            classify_log_level("generation speed: 12.5 tok/s"),
            LogLevel::Stats
        );
        assert_eq!(
            classify_log_level("512 tokens generated in 5.2s"),
            LogLevel::Stats
        );
        assert_eq!(
            classify_log_level("prompt processing: 8192 tokens in 1.2s"),
            LogLevel::Stats
        );
    }

    #[test]
    fn classify_json_structured_log() {
        let info = r#"{"tid":"123","level":"INFO","msg":"server ready"}"#;
        assert_eq!(classify_log_level(info), LogLevel::Info);

        let warn = r#"{"tid":"123","level":"WARN","msg":"context shift"}"#;
        assert_eq!(classify_log_level(warn), LogLevel::Warn);

        let err = r#"{"tid":"123","level":"ERROR","msg":"failed to load"}"#;
        assert_eq!(classify_log_level(err), LogLevel::Error);

        let dbg = r#"{"tid":"123","level":"DEBUG","msg":"kv cache hit"}"#;
        assert_eq!(classify_log_level(dbg), LogLevel::Debug);
    }

    // ─── LogManager ─────────────────────────────────────────────────────

    #[test]
    fn add_and_get_history() {
        let mgr = LogManager::new();
        mgr.add_line("/test.sh", make_line("hello"));
        let (history, exited) = mgr.get_history("/test.sh");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].text, "hello");
        assert!(!exited);
    }

    #[test]
    fn respects_max_line_limit() {
        let mgr = LogManager::new();
        for i in 0..MAX_LOG_LINES + 10 {
            mgr.add_line("/test.sh", make_line(&format!("line {i}")));
        }
        let (history, _) = mgr.get_history("/test.sh");
        assert_eq!(history.len(), MAX_LOG_LINES);
        assert_eq!(history[0].text, "line 10");
    }

    #[test]
    fn clear_removes_history_and_resets_exited() {
        let mgr = LogManager::new();
        mgr.add_line("/test.sh", make_line("line"));
        mgr.set_process_exited("/test.sh");
        mgr.clear("/test.sh");
        let (history, exited) = mgr.get_history("/test.sh");
        assert!(history.is_empty());
        assert!(!exited);
    }

    #[test]
    fn set_process_exited_flags_correctly() {
        let mgr = LogManager::new();
        assert!(!mgr.get_history("/test.sh").1);
        mgr.set_process_exited("/test.sh");
        assert!(mgr.get_history("/test.sh").1);
    }

    #[test]
    fn subscribe_returns_existing_history() {
        let mgr = LogManager::new();
        mgr.add_line("/test.sh", make_line("before subscribe"));
        let (_rx, history, exited) = mgr.subscribe("/test.sh");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].text, "before subscribe");
        assert!(!exited);
    }

    #[test]
    fn get_history_returns_empty_for_unknown_profile() {
        let mgr = LogManager::new();
        let (history, exited) = mgr.get_history("/nonexistent.sh");
        assert!(history.is_empty());
        assert!(!exited);
    }

    #[tokio::test]
    async fn broadcast_delivers_new_lines() {
        let mgr = Arc::new(LogManager::new());
        let (mut rx, _, _) = mgr.subscribe("/test.sh");
        mgr.add_line("/test.sh", make_line("streamed line"));
        let event = rx.try_recv().expect("event not delivered");
        match event {
            LogEvent::Log { line } => assert_eq!(line.text, "streamed line"),
            LogEvent::Exited => panic!("expected Log event"),
        }
    }

    #[tokio::test]
    async fn broadcast_delivers_exited_event() {
        let mgr = Arc::new(LogManager::new());
        let (mut rx, _, _) = mgr.subscribe("/test.sh");
        mgr.set_process_exited("/test.sh");
        let event = rx.try_recv().expect("event not delivered");
        assert!(matches!(event, LogEvent::Exited));
    }

    #[tokio::test]
    async fn set_process_exited_broadcasts_only_once() {
        let mgr = Arc::new(LogManager::new());
        let (mut rx, _, _) = mgr.subscribe("/test.sh");
        mgr.set_process_exited("/test.sh");
        mgr.set_process_exited("/test.sh"); // second call is a no-op
        let first = rx.try_recv().expect("first event");
        assert!(matches!(first, LogEvent::Exited));
        assert!(rx.try_recv().is_err()); // no second event
    }

    #[tokio::test]
    async fn stderr_lines_are_captured_separately() {
        let mgr = Arc::new(LogManager::new());
        let (mut rx, _, _) = mgr.subscribe("/test.sh");
        mgr.add_line(
            "/test.sh",
            LogLine {
                timestamp: "2024-01-01T00:00:00Z".to_string(),
                stream: LogStream::Stderr,
                level: LogLevel::Error,
                text: "stderr error line".to_string(),
            },
        );
        let event = rx.try_recv().expect("event not delivered");
        match event {
            LogEvent::Log { line } => {
                assert_eq!(line.stream, LogStream::Stderr);
                assert_eq!(line.text, "stderr error line");
            }
            LogEvent::Exited => panic!("expected Log event"),
        }
    }

    // ─── parse_tg_from_timing_line (T254) ───────────────────────────────

    #[test]
    fn parse_tg_verbatim_line_from_prompt() {
        // Exact line quoted in the T254 prompt — must parse 12.35.
        let line = "383.58.946.679 I slot print_timing: id  0 | task 172319 | n_gen = 19485, tg = 12.35 t/s, tg_3s = 11.32 t/s";
        assert_eq!(parse_tg_from_timing_line(line), Some(12.35));
    }

    #[test]
    fn parse_tg_non_timing_line_returns_none_without_parsing() {
        // Fast-path: a line without "print_timing" must return None immediately.
        assert_eq!(
            parse_tg_from_timing_line("some other log line with tg = 99.0 in it"),
            None
        );
    }

    #[test]
    fn parse_tg_zero_yields_none() {
        let line = "383.58.946.679 I slot print_timing: id  0 | task 1 | n_gen = 100, tg = 0.00 t/s, tg_3s = 0.00 t/s";
        assert_eq!(parse_tg_from_timing_line(line), None);
    }

    #[test]
    fn parse_tg_malformed_line_does_not_panic() {
        // No "=" after "tg", or no numeric token — must return None, not panic.
        assert_eq!(
            parse_tg_from_timing_line("slot print_timing: id 0 tg"),
            None
        );
        assert_eq!(
            parse_tg_from_timing_line("slot print_timing: id 0 tg ="),
            None
        );
        assert_eq!(
            parse_tg_from_timing_line("slot print_timing: id 0 tg = notanumber t/s"),
            None
        );
    }

    // ─── live_tg integration (T254) ─────────────────────────────────────

    #[test]
    fn live_tg_is_none_before_any_print_timing_line() {
        let mgr = LogManager::new();
        assert_eq!(mgr.get_live_tg("/test.sh"), None);
        // A non-timing line must not set live_tg.
        mgr.add_line("/test.sh", make_line("startup complete"));
        assert_eq!(mgr.get_live_tg("/test.sh"), None);
    }

    #[test]
    fn live_tg_is_set_after_print_timing_line() {
        let mgr = LogManager::new();
        let timing = "383.58.946.679 I slot print_timing: id  0 | task 1 | n_gen = 100, tg = 12.35 t/s, tg_3s = 11.00 t/s";
        mgr.add_line("/test.sh", make_line(timing));
        assert_eq!(mgr.get_live_tg("/test.sh"), Some(12.35));
    }

    #[test]
    fn non_timing_line_does_not_overwrite_stored_live_tg() {
        let mgr = LogManager::new();
        let timing = "383.58.946.679 I slot print_timing: id  0 | task 1 | n_gen = 100, tg = 12.35 t/s, tg_3s = 11.00 t/s";
        mgr.add_line("/test.sh", make_line(timing));
        mgr.add_line("/test.sh", make_line("some unrelated log line"));
        assert_eq!(mgr.get_live_tg("/test.sh"), Some(12.35));
    }

    #[test]
    fn clear_resets_live_tg() {
        let mgr = LogManager::new();
        let timing = "383.58.946.679 I slot print_timing: id  0 | task 1 | n_gen = 100, tg = 12.35 t/s, tg_3s = 11.00 t/s";
        mgr.add_line("/test.sh", make_line(timing));
        assert_eq!(mgr.get_live_tg("/test.sh"), Some(12.35));
        mgr.clear("/test.sh");
        assert_eq!(mgr.get_live_tg("/test.sh"), None);
    }
}
