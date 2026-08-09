//! localbench wrapper endpoints.
//!
//! localbench is a CLI that writes files, so this module spawns `bench.py`
//! and reads `<bench_dir>/runs/*/results.json`. Nothing here parses the
//! human-readable report: `results.json` is the single source of truth for
//! scores, exactly as the data contract requires.
//!
//! Path model, verified in bench.py: `ROOT = Path(__file__).resolve().parent`
//! and `RUNS_DIR = ROOT / "runs"`, so runs are SCRIPT-adjacent and readable
//! regardless of spawn cwd. The one cwd-sensitive path is the `--resume`
//! argument (`Path(args.resume).expanduser()`, no ROOT anchoring), which is
//! why `resume_run_path` always yields an absolute path.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{OnceLock, RwLock};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};

/// Ring-buffer capacity for bench stdout/stderr. Bench runs are long and
/// chatty; the console only ever shows a tail.
const LOG_CAPACITY: usize = 5000;

// ── Configuration ─────────────────────────────────────────────────────────────

/// Resolve the localbench checkout. Settings win, then env, then a
/// conventional default — the launcher's scan-dir precedence, mirrored.
pub fn bench_dir() -> PathBuf {
    let from_settings = crate::api::settings::get_ai_settings()
        .bench_dir
        .filter(|s| !s.is_empty());
    if let Some(d) = from_settings {
        return PathBuf::from(d);
    }
    if let Ok(d) = std::env::var("MODEL_DECK_BENCH_DIR")
        && !d.is_empty()
    {
        return PathBuf::from(d);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    PathBuf::from(home).join("Documents/AI/localbench")
}

fn runs_dir() -> PathBuf {
    bench_dir().join("runs")
}

/// `--resume` is resolved against the process cwd by bench.py, so this must
/// always be absolute. Pinned by test: the cwd-resolution bug class.
pub(crate) fn resume_run_path(bench_dir: &Path, folder: &str) -> PathBuf {
    bench_dir.join("runs").join(folder)
}

// ── Pure parsing (unit-tested against real mockserver output) ─────────────────

/// The cheap history row: everything a run list needs, and deliberately NOT
/// `records` — a fifty-run list must not parse megabytes of failure detail.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub(crate) struct RunSummary {
    pub run_id: String,
    pub suite_hash: String,
    pub created: String,
    pub folder: String,
    pub models: Vec<String>,
    pub summary: Value,
    pub config: Value,
    /// `live == {}` means FINISHED. Never inferred from file existence.
    pub finished: bool,
}

/// Parse one results.json into a history row.
///
/// The `live == {}` → finished rule is the contract's, not an inference from
/// the file being present on disk.
pub(crate) fn parse_run_summary(text: &str, folder: &str) -> Result<RunSummary, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| format!("bad results.json: {e}"))?;
    let live_empty = match v.get("live") {
        Some(Value::Object(m)) => m.is_empty(),
        // A missing `live` key is not a running run.
        None | Some(Value::Null) => true,
        _ => false,
    };
    Ok(RunSummary {
        run_id: v
            .get("run_id")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        suite_hash: v
            .get("suite_hash")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        created: v
            .get("created")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        folder: folder.to_string(),
        models: v
            .get("models")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|m| m.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        summary: v.get("summary").cloned().unwrap_or(Value::Null),
        config: v.get("config").cloned().unwrap_or(Value::Null),
        finished: live_empty,
    })
}

/// Assemble the run list, newest first. Folder name is carried for `--resume`
/// but identity is `run_id` — folders can be renamed.
pub(crate) fn assemble_run_list(files: &[(String, String)]) -> Vec<RunSummary> {
    let mut out: Vec<RunSummary> = files
        .iter()
        .filter_map(|(folder, text)| parse_run_summary(text, folder).ok())
        .collect();
    out.sort_by(|a, b| b.created.cmp(&a.created));
    out
}

/// Readiness for the model-swap chain: the expected id must actually appear
/// in `/v1/models`. The launcher's 60s timeout is not trusted — a cold 27B
/// load can exceed it.
pub(crate) fn queue_advance_ready(models_body: &str, expected_id: &str) -> bool {
    if expected_id.is_empty() {
        return false;
    }
    let Ok(v) = serde_json::from_str::<Value>(models_body) else {
        return false;
    };
    v.get("data")
        .and_then(|d| d.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|m| m.get("id").and_then(|i| i.as_str()))
                .any(|id| id == expected_id)
        })
        .unwrap_or(false)
}

/// A live run refuses a second start; a finished one does not.
pub(crate) fn should_refuse_start(a_run_is_live: bool) -> bool {
    a_run_is_live
}

// ── Log ring buffer ───────────────────────────────────────────────────────────

/// Bench-local ring buffer with offset reads.
///
/// Deliberately not `log_manager`: that one is keyed per script path and
/// broadcasts, with no offset API. Adding offsets there would change a shared
/// component used by the llama console, which this must not disturb.
#[derive(Default)]
pub(crate) struct BenchLog {
    lines: Vec<String>,
    /// How many lines have been dropped off the front, so offsets stay stable
    /// across eviction.
    dropped: usize,
}

impl BenchLog {
    pub(crate) fn append(&mut self, line: String) {
        self.lines.push(line);
        if self.lines.len() > LOG_CAPACITY {
            let excess = self.lines.len() - LOG_CAPACITY;
            self.lines.drain(0..excess);
            self.dropped += excess;
        }
    }

    /// Return only text the caller has not seen, plus the next offset.
    /// The console's de-duplication depends on this being exact.
    pub(crate) fn read_from(&self, offset: usize) -> (Vec<String>, usize) {
        let total = self.dropped + self.lines.len();
        let start = offset.max(self.dropped).min(total);
        let idx = start - self.dropped;
        (self.lines[idx..].to_vec(), total)
    }

    pub(crate) fn clear(&mut self) {
        self.lines.clear();
        self.dropped = 0;
    }
}

// ── Live run state ────────────────────────────────────────────────────────────

/// What the backend knows at spawn time, before any results.json exists.
///
/// bench.py serializes `live` only when it SAVES results.json, and it saves
/// at sample completion — so for the whole first sample (minutes on a real
/// model) there is no file to poll. The hero's identity row comes from here
/// instead, which is true the moment the child is spawned.
#[derive(Default, Clone, Serialize)]
pub(crate) struct CurrentRun {
    pub pid: u32,
    pub folder: Option<String>,
    pub model: Option<String>,
    pub label: Option<String>,
    pub langs: Option<String>,
    pub attempts: Option<u32>,
    pub n: Option<u32>,
    pub temperature: Option<f64>,
    /// ISO-8601, recorded when the child was spawned.
    pub started: String,
}

#[derive(Default)]
struct BenchState {
    pid: Option<u32>,
    run_folder: Option<String>,
    current: Option<CurrentRun>,
    log: BenchLog,
    exited: bool,
}

fn state() -> &'static RwLock<BenchState> {
    static S: OnceLock<RwLock<BenchState>> = OnceLock::new();
    S.get_or_init(|| RwLock::new(BenchState::default()))
}

/// A pid that is still alive. `kill(pid, 0)` is the launcher's own liveness
/// probe.
fn pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

fn a_run_is_live() -> bool {
    let guard = state().read().unwrap();
    match guard.pid {
        Some(pid) => !guard.exited && pid_alive(pid),
        None => false,
    }
}

/// SIGTERM only — **never SIGKILL**.
///
/// This deliberately does NOT reuse `launcher::graceful_shutdown`: that one
/// escalates SIGINT → SIGTERM → SIGKILL, and a SIGKILL would destroy exactly
/// the graceful `results.json` save that makes a bench run resumable.
/// bench.py installs a SIGTERM handler that raises KeyboardInterrupt and
/// unwinds like Ctrl-C, so one SIGTERM is all that is correct here.
fn sigterm_only(pid: u32) {
    let ipid = pid as i32;
    let pgid = unsafe { libc::getpgid(ipid) };
    let group_target = if pgid > 0 { -pgid } else { -ipid };
    unsafe {
        libc::kill(group_target, libc::SIGTERM);
        libc::kill(ipid, libc::SIGTERM);
    }
}

// ── Spawning ──────────────────────────────────────────────────────────────────

/// Run `bench.py` to completion and return stdout. Used by the two read-only
/// JSON queries, which finish quickly.
async fn bench_json(args: &[&str]) -> Result<Value, String> {
    let dir = bench_dir();
    let out = tokio::process::Command::new("python3")
        .current_dir(&dir)
        .arg("bench.py")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("failed to spawn bench.py: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "bench.py exited {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("bench.py did not emit JSON: {e}"))
}

fn push_log(line: String) {
    let mut g = state().write().unwrap();
    g.log.append(line);
}

/// Spawn a long-running bench.py, detach it, and pump both pipes into the
/// ring buffer. Mirrors `launcher::execute_script`'s shape, including
/// `process_group(0)` so the stop signal can reach the whole group.
async fn spawn_bench(args: Vec<String>) -> Result<u32, String> {
    let dir = bench_dir();
    let mut child = tokio::process::Command::new("python3")
        .current_dir(&dir)
        .arg("bench.py")
        .args(&args)
        .process_group(0)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn bench.py: {e}"))?;

    let pid = child
        .id()
        .ok_or_else(|| "no pid for bench.py".to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    drop(child);

    if let Some(h) = stdout {
        tokio::spawn(async move {
            let mut lines = TokioBufReader::new(h).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                push_log(line);
            }
            state().write().unwrap().exited = true;
        });
    }
    if let Some(h) = stderr {
        tokio::spawn(async move {
            let mut lines = TokioBufReader::new(h).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                push_log(line);
            }
        });
    }
    Ok(pid)
}

/// Newest run folder, used to attach a freshly started run to its output
/// directory (bench.py names the folder itself, from label + timestamp).
fn newest_run_folder() -> Option<String> {
    let mut entries: Vec<(std::time::SystemTime, String)> = std::fs::read_dir(runs_dir())
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let m = e.metadata().ok()?.modified().ok()?;
            Some((m, e.file_name().to_string_lossy().to_string()))
        })
        .collect();
    entries.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    entries.into_iter().next().map(|(_, name)| name)
}

fn read_run_files() -> Vec<(String, String)> {
    let Ok(rd) = std::fs::read_dir(runs_dir()) else {
        return Vec::new();
    };
    rd.filter_map(|e| e.ok())
        .filter_map(|e| {
            let folder = e.file_name().to_string_lossy().to_string();
            let text = std::fs::read_to_string(e.path().join("results.json")).ok()?;
            Some((folder, text))
        })
        .collect()
}

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
pub struct StartRequest {
    pub model: Option<String>,
    pub langs: Option<String>,
    pub attempts: Option<u32>,
    pub n: Option<u32>,
    pub temperature: Option<f64>,
    pub url: Option<String>,
    pub label: Option<String>,
    pub nudge_at: Option<u32>,
    pub max_tokens: Option<u32>,
}

impl StartRequest {
    /// Flags in bench.py's own spelling.
    pub(crate) fn to_args(&self) -> Vec<String> {
        let mut a: Vec<String> = Vec::new();
        if let Some(v) = &self.url {
            a.push("-u".into());
            a.push(v.clone());
        }
        if let Some(v) = &self.model {
            a.push("-m".into());
            a.push(v.clone());
        }
        if let Some(v) = &self.langs {
            a.push("--langs".into());
            a.push(v.clone());
        }
        if let Some(v) = self.attempts {
            a.push("--attempts".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.n {
            a.push("--n".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.temperature {
            a.push("--temperature".into());
            a.push(v.to_string());
        }
        if let Some(v) = &self.label {
            a.push("--label".into());
            a.push(v.clone());
        }
        if let Some(v) = self.nudge_at {
            a.push("--nudge-at".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.max_tokens {
            a.push("--max-tokens".into());
            a.push(v.to_string());
        }
        a
    }
}

#[derive(Debug, Deserialize)]
pub struct ResumeRequest {
    pub folder: String,
    pub attempts: Option<u32>,
    pub n: Option<u32>,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub offset: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct QueueAdvanceRequest {
    pub script_path: String,
    pub expected_model_id: String,
    pub url: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn tasks_handler() -> axum::response::Json<Value> {
    match bench_json(&["--list", "--json"]).await {
        Ok(v) => axum::response::Json(json!({ "data": v, "success": true })),
        Err(e) => axum::response::Json(json!({ "error": e, "success": false })),
    }
}

pub async fn check_handler() -> axum::response::Json<Value> {
    match bench_json(&["--check", "--json"]).await {
        Ok(v) => axum::response::Json(json!({ "data": v, "success": true })),
        Err(e) => axum::response::Json(json!({ "error": e, "success": false })),
    }
}

pub async fn start_handler(
    axum::extract::Json(req): axum::extract::Json<StartRequest>,
) -> axum::response::Json<Value> {
    if should_refuse_start(a_run_is_live()) {
        return axum::response::Json(json!({
            "error": "a bench run is already active", "success": false
        }));
    }
    {
        let mut g = state().write().unwrap();
        g.log.clear();
        g.exited = false;
        g.pid = None;
        g.run_folder = None;
        g.current = None;
    }
    match spawn_bench(req.to_args()).await {
        Ok(pid) => {
            // bench.py creates the folder as it starts; give it a moment so
            // the run can be attached to its output directory.
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            let folder = newest_run_folder();
            let current = CurrentRun {
                pid,
                folder: folder.clone(),
                model: req.model.clone(),
                label: req.label.clone(),
                langs: req.langs.clone(),
                attempts: req.attempts,
                n: req.n,
                temperature: req.temperature,
                started: chrono::Utc::now().to_rfc3339(),
            };
            {
                let mut g = state().write().unwrap();
                g.pid = Some(pid);
                g.run_folder = folder.clone();
                g.current = Some(current.clone());
            }
            // Everything the hero's identity row needs, before results.json
            // exists at all.
            axum::response::Json(json!({
                "pid": pid, "folder": folder, "run": current, "success": true
            }))
        }
        Err(e) => axum::response::Json(json!({ "error": e, "success": false })),
    }
}

/// The run this backend spawned, if it is still alive.
///
/// A run started from the CLI has no process state here — the frontend keeps
/// working for those through the existing results.json polling path, which
/// is why `run` is nullable rather than an error.
pub async fn current_handler() -> axum::response::Json<Value> {
    let live = a_run_is_live();
    let run = state().read().unwrap().current.clone();
    axum::response::Json(json!({
        "data": { "running": live, "run": if live { run } else { None } },
        "success": true
    }))
}

pub async fn stop_handler() -> axum::response::Json<Value> {
    let pid = state().read().unwrap().pid;
    match pid {
        Some(pid) if pid_alive(pid) => {
            sigterm_only(pid);
            axum::response::Json(json!({
                "success": true,
                "message": "SIGTERM sent; the run saves results and stays resumable"
            }))
        }
        _ => axum::response::Json(json!({ "error": "no live bench run", "success": false })),
    }
}

pub async fn skip_handler() -> axum::response::Json<Value> {
    let folder = state().read().unwrap().run_folder.clone();
    match folder {
        Some(f) => {
            let marker = runs_dir().join(&f).join("skip");
            match std::fs::write(&marker, b"") {
                Ok(()) => axum::response::Json(json!({ "success": true, "marker": marker })),
                Err(e) => axum::response::Json(
                    json!({ "error": format!("could not write skip marker: {e}"), "success": false }),
                ),
            }
        }
        None => axum::response::Json(json!({ "error": "no active run to skip", "success": false })),
    }
}

pub async fn runs_handler() -> axum::response::Json<Value> {
    let files = tokio::task::spawn_blocking(read_run_files)
        .await
        .unwrap_or_default();
    let list = assemble_run_list(&files);
    axum::response::Json(json!({ "data": list, "success": true }))
}

pub async fn run_by_id_handler(
    axum::extract::Path(id): axum::extract::Path<String>,
) -> axum::response::Json<Value> {
    let files = tokio::task::spawn_blocking(read_run_files)
        .await
        .unwrap_or_default();
    // Matched on run_id, never folder name — folders can be renamed.
    for (folder, text) in &files {
        if let Ok(s) = parse_run_summary(text, folder)
            && s.run_id == id
            && let Ok(v) = serde_json::from_str::<Value>(text)
        {
            return axum::response::Json(json!({ "data": v, "success": true }));
        }
    }
    axum::response::Json(json!({ "error": format!("no run with run_id {id}"), "success": false }))
}

pub async fn log_handler(
    axum::extract::Query(q): axum::extract::Query<LogQuery>,
) -> axum::response::Json<Value> {
    let (lines, next) = {
        let g = state().read().unwrap();
        g.log.read_from(q.offset.unwrap_or(0))
    };
    let live = a_run_is_live();
    axum::response::Json(json!({
        "lines": lines, "nextOffset": next, "running": live, "success": true
    }))
}

pub async fn resume_handler(
    axum::extract::Json(req): axum::extract::Json<ResumeRequest>,
) -> axum::response::Json<Value> {
    if should_refuse_start(a_run_is_live()) {
        return axum::response::Json(json!({
            "error": "a bench run is already active", "success": false
        }));
    }
    let dir = bench_dir();
    // ABSOLUTE: the --resume argument is cwd-resolved by bench.py.
    let path = resume_run_path(&dir, &req.folder);
    let mut args = vec!["--resume".to_string(), path.to_string_lossy().to_string()];
    // bench.py refuses a resume whose attempts/n differ, so pass them through.
    if let Some(v) = req.attempts {
        args.push("--attempts".into());
        args.push(v.to_string());
    }
    if let Some(v) = req.n {
        args.push("--n".into());
        args.push(v.to_string());
    }
    if let Some(v) = &req.url {
        args.push("-u".into());
        args.push(v.clone());
    }
    {
        let mut g = state().write().unwrap();
        g.log.clear();
        g.exited = false;
    }
    match spawn_bench(args).await {
        Ok(pid) => {
            let mut g = state().write().unwrap();
            g.pid = Some(pid);
            g.run_folder = Some(req.folder.clone());
            drop(g);
            axum::response::Json(json!({ "pid": pid, "success": true }))
        }
        Err(e) => axum::response::Json(json!({ "error": e, "success": false })),
    }
}

pub async fn queue_advance_handler(
    axum::extract::Json(req): axum::extract::Json<QueueAdvanceRequest>,
) -> axum::response::Json<Value> {
    let script = req.script_path.clone();
    let launched =
        tokio::task::spawn_blocking(move || crate::api::launcher::launch_profile(&script)).await;
    if let Ok(Err(e)) = launched {
        return axum::response::Json(json!({ "error": e, "success": false }));
    }

    // Poll /v1/models for the expected id rather than trusting the launcher's
    // 60s readiness timeout — a cold 27B load can exceed it, and the first
    // tasks would then fail as `server`.
    let base = req
        .url
        .clone()
        .unwrap_or_else(|| "http://localhost:8081".to_string());
    let url = format!("{}/v1/models", base.trim_end_matches('/'));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(600);
    let client = reqwest::Client::new();
    while std::time::Instant::now() < deadline {
        if let Ok(resp) = client.get(&url).send().await
            && let Ok(body) = resp.text().await
            && queue_advance_ready(&body, &req.expected_model_id)
        {
            return axum::response::Json(json!({ "ready": true, "success": true }));
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    axum::response::Json(json!({
        "ready": false, "success": false,
        "error": format!("{} did not appear in {url} within 600s", req.expected_model_id)
    }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Real mockserver output, not a hand-written fixture: a fixture encodes
    /// what someone assumed the file looks like, which is the assumption most
    /// worth testing.
    const FINISHED: &str = include_str!("../../tests/fixtures/bench_finished.json");
    const RUNNING: &str = include_str!("../../tests/fixtures/bench_running.json");

    // T01 — summary parse.
    #[test]
    fn t01_summary_parse_reads_identity_and_summary_fields() {
        let s = parse_run_summary(FINISHED, "seedA_20260808-223558").unwrap();
        assert!(!s.run_id.is_empty(), "run_id must be present");
        assert_eq!(s.suite_hash, "e293ad7");
        assert_eq!(s.models, vec!["seedA".to_string()]);
        assert_eq!(s.summary.get("samples").and_then(|v| v.as_u64()), Some(12));
    }

    // T01 — the live=={} rule, both directions.
    #[test]
    fn t01_empty_live_means_finished_and_nonempty_means_running() {
        assert!(
            parse_run_summary(FINISHED, "f").unwrap().finished,
            "live == {{}} must mean FINISHED"
        );
        assert!(
            !parse_run_summary(RUNNING, "r").unwrap().finished,
            "a non-empty live block must mean RUNNING"
        );
    }

    // T02 — run-list assembly carries summaries only.
    #[test]
    fn t02_run_list_omits_records_entirely() {
        let files = vec![("seedA".to_string(), FINISHED.to_string())];
        let list = assemble_run_list(&files);
        assert_eq!(list.len(), 1);
        let encoded = serde_json::to_string(&list).unwrap();
        assert!(
            !encoded.contains("\"records\""),
            "the cheap history row must not carry records"
        );
        assert!(
            !encoded.contains("first_failed"),
            "no per-sample failure detail may leak into the list"
        );
    }

    // T02 — identity is run_id, not folder name.
    #[test]
    fn t02_identity_survives_a_renamed_folder() {
        let original = assemble_run_list(&[("seedA_20260808-223558".into(), FINISHED.into())]);
        let renamed = assemble_run_list(&[("i-renamed-this".into(), FINISHED.into())]);
        assert_eq!(
            original[0].run_id, renamed[0].run_id,
            "run_id must survive the folder being renamed"
        );
        assert_ne!(original[0].folder, renamed[0].folder);
    }

    // T03 — queue-advance readiness.
    #[test]
    fn t03_ready_only_when_expected_id_is_present() {
        let body = r#"{"data":[{"id":"ref-model"},{"id":"buggy-model"}]}"#;
        assert!(queue_advance_ready(body, "buggy-model"));
        assert!(
            !queue_advance_ready(body, "some-other-model"),
            "an absent id must not report ready"
        );
    }

    #[test]
    fn t03_malformed_or_empty_is_never_ready() {
        assert!(!queue_advance_ready("not json at all", "m"));
        assert!(!queue_advance_ready(r#"{"data":[]}"#, "m"));
        assert!(
            !queue_advance_ready(r#"{"data":[{"id":"m"}]}"#, ""),
            "an empty expectation must never be satisfied"
        );
    }

    // T04 — ring buffer keeps the newest lines.
    #[test]
    fn t04_append_past_capacity_keeps_the_newest_lines() {
        let mut log = BenchLog::default();
        for i in 0..(LOG_CAPACITY + 10) {
            log.append(format!("line {i}"));
        }
        let (lines, next) = log.read_from(0);
        assert_eq!(lines.len(), LOG_CAPACITY, "capacity must bound the buffer");
        assert_eq!(lines[lines.len() - 1], format!("line {}", LOG_CAPACITY + 9));
        assert_eq!(
            next,
            LOG_CAPACITY + 10,
            "offset counts every line ever seen"
        );
    }

    // T04 — offset reads return only unseen text.
    #[test]
    fn t04_offset_read_returns_only_unseen_lines() {
        let mut log = BenchLog::default();
        log.append("a".into());
        log.append("b".into());
        let (first, off) = log.read_from(0);
        assert_eq!(first, vec!["a".to_string(), "b".to_string()]);
        let (second, off2) = log.read_from(off);
        assert!(
            second.is_empty(),
            "a caught-up reader must receive nothing, not a repeat"
        );
        assert_eq!(off2, off);
        log.append("c".into());
        let (third, _) = log.read_from(off2);
        assert_eq!(third, vec!["c".to_string()]);
    }

    // T05 — resume path is absolute regardless of cwd.
    #[test]
    fn t05_resume_path_is_absolute_regardless_of_cwd() {
        let p = resume_run_path(Path::new("/opt/localbench"), "seedE_20260808-223643");
        assert!(
            p.is_absolute(),
            "--resume is cwd-resolved; it must be absolute"
        );
        assert_eq!(
            p,
            PathBuf::from("/opt/localbench/runs/seedE_20260808-223643")
        );
    }

    // T06 — start refusal.
    #[test]
    fn t06_a_live_run_refuses_a_second_start_a_finished_one_does_not() {
        assert!(should_refuse_start(true), "a live run must refuse a start");
        assert!(
            !should_refuse_start(false),
            "a finished run must not block the next start"
        );
    }

    // Flag spelling must match bench.py, or every run silently uses defaults.
    #[test]
    fn start_request_uses_bench_pys_own_flag_spelling() {
        let req = StartRequest {
            model: Some("buggy-model".into()),
            langs: Some("js".into()),
            attempts: Some(3),
            n: Some(3),
            temperature: Some(0.6),
            url: Some("http://127.0.0.1:8123".into()),
            ..Default::default()
        };
        let args = req.to_args();
        let joined = args.join(" ");
        assert!(joined.contains("-m buggy-model"));
        assert!(joined.contains("--langs js"));
        assert!(joined.contains("--attempts 3"));
        assert!(
            joined.contains("--n 3"),
            "samples flag is --n, not --samples"
        );
        assert!(joined.contains("--temperature 0.6"));
        assert!(joined.contains("-u http://127.0.0.1:8123"));
    }
}
