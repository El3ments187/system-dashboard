//! Per-profile llama.cpp process log capture, storage, and real-time streaming.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, OnceLock, RwLock};
use tokio::sync::broadcast;

pub const MAX_LOG_LINES: usize = 5000;
const BROADCAST_CAPACITY: usize = 512;

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
}

impl ProfileLogBuffer {
    fn new() -> Self {
        let (sender, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            history: VecDeque::new(),
            sender,
            process_exited: false,
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
        }
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

/// Classify the severity of a raw log line from llama.cpp stdout/stderr.
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
            mgr.add_line("/test.sh", make_line(&format!("line {}", i)));
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
            _ => panic!("expected Log event"),
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
            _ => panic!("expected Log event"),
        }
    }
}
