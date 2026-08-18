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
    // A run is finished only when it actually covered its task set.  A run that
    // stopped early (25/27 tasks) has live=={} but suite_tasks > tasks — it is
    // interrupted and must be offered Resume, not silently treated as done.
    // Runs without suite_tasks (pre-157 format) fall back to live=={} alone.
    let tasks_covered = v
        .get("summary")
        .and_then(|s| s.get("suite_tasks"))
        .and_then(|st| st.as_u64())
        .map(|suite_tasks| {
            let tasks = v
                .get("summary")
                .and_then(|s| s.get("tasks"))
                .and_then(|t| t.as_u64())
                .unwrap_or(0);
            tasks >= suite_tasks
        })
        .unwrap_or(true);
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
        finished: live_empty && tasks_covered,
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

/// Where `/v1/models` lives for a given base url.
///
/// Mirrors bench.py, which appends `/v1` only when the url has no path
/// (`args.base_url = given if parts.path else given + "/v1"`). Probing a
/// different address than the run will use would make the gate a lie.
pub(crate) fn models_probe_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    }
}

/// Is a server answering at all?
///
/// Deliberately weaker than `queue_advance_ready`: that one waits for a
/// SPECIFIC model id after a swap, while this only asks whether there is an
/// endpoint to benchmark. An empty model list still counts — bench.py can
/// auto-detect, and benching a mockserver with no model loaded is
/// legitimate.
/// The model ids the target actually reports.
///
/// `--model` is only an EXPECTATION: bench.py passes it through and never
/// checks it against the server, so a stale value is recorded verbatim and
/// the run becomes un-attributable. Returning what the endpoint really says
/// lets the page compare the two before a run starts.
pub(crate) fn reported_models(models_body: &str) -> Vec<String> {
    serde_json::from_str::<Value>(models_body)
        .ok()
        .and_then(|v| v.get("data").and_then(|d| d.as_array().cloned()))
        .map(|items| {
            items
                .iter()
                .filter_map(|i| i.get("id").and_then(|id| id.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn server_answering(models_body: &str) -> bool {
    serde_json::from_str::<Value>(models_body)
        .ok()
        .and_then(|v| v.get("data").map(|d| d.is_array()))
        .unwrap_or(false)
}

// ── Log ring buffer ───────────────────────────────────────────────────────────

/// Bench-local ring buffer with offset reads.
///
/// Deliberately not `log_manager`: that one is keyed per script path and
/// broadcasts, with no offset API. Adding offsets there would change a shared
/// component used by the llama console, which this must not disturb.
#[derive(Default)]
pub(crate) struct BenchLog {
    lines: std::collections::VecDeque<String>,
    /// How many lines have been dropped off the front, so offsets stay stable
    /// across eviction.
    dropped: usize,
}

impl BenchLog {
    pub(crate) fn append(&mut self, line: String) {
        self.lines.push_back(line);
        if self.lines.len() > LOG_CAPACITY {
            self.lines.pop_front();
            self.dropped += 1;
        }
    }

    /// Return only text the caller has not seen, plus the next offset.
    /// The console's de-duplication depends on this being exact.
    pub(crate) fn read_from(&self, offset: usize) -> (Vec<String>, usize) {
        let total = self.dropped + self.lines.len();
        // If offset is ahead of total (stale client after a log clear), return
        // all current lines so the caller catches up rather than seeing nothing.
        let start = if offset > total {
            self.dropped
        } else {
            offset.max(self.dropped)
        };
        let idx = start - self.dropped;
        (self.lines.iter().skip(idx).cloned().collect(), total)
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
    /// The endpoint this run targets, so the page can say what is being
    /// benchmarked before results.json exists.
    pub url: Option<String>,
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
    /// T127: set while a spawn is in flight so concurrent start/resume
    /// requests see the window as occupied and are refused. Cleared once the
    /// pid is stored (success) or on spawn failure.
    spawning: bool,
    /// Pid recovered from disk after a dashboard restart; cached to avoid
    /// scanning all run directories on every poll.
    recovered_pid: Option<u32>,
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

/// Pure liveness predicate extracted for testing without the pid_alive
/// side-effect. `spawning` is true while a spawn is in flight.
fn is_live_state(pid: Option<u32>, exited: bool, spawning: bool) -> bool {
    if spawning {
        return true;
    }
    match pid {
        Some(p) => !exited && pid_alive(p),
        None => false,
    }
}

fn a_run_is_live() -> bool {
    let g = state().read().unwrap_or_else(|e| e.into_inner());
    is_live_state(g.pid, g.exited, g.spawning)
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
    // Send to the whole process group when we know it (bench.py uses
    // process_group(0), so the group includes every subprocess). Fall back to
    // the individual pid when getpgid fails. Never send to both: the pid is a
    // member of its own group and a second SIGTERM during the KeyboardInterrupt
    // handler can hit the default disposition, killing the process before it
    // saves results.json.
    unsafe {
        if pgid > 0 {
            libc::kill(-pgid, libc::SIGTERM);
        } else {
            libc::kill(ipid, libc::SIGTERM);
        }
    }
}

// ── Spawning ──────────────────────────────────────────────────────────────────

/// Run `bench.py` to completion and return stdout. Used by the two read-only
/// JSON queries, which finish quickly.
async fn bench_json(args: &[&str]) -> Result<Value, String> {
    let dir = bench_dir();
    let fut = tokio::process::Command::new("python3")
        .current_dir(&dir)
        .arg("bench.py")
        .args(args)
        .output();
    let out = tokio::time::timeout(std::time::Duration::from_secs(30), fut)
        .await
        .map_err(|_| "bench.py --json timed out after 30s".to_string())?
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
    let mut g = state().write().unwrap_or_else(|e| e.into_inner());
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
    // Reap the process when it exits so it does not become a zombie. The pipes
    // are already detached; wait() here just collects the exit status.
    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    if let Some(h) = stdout {
        tokio::spawn(async move {
            let mut lines = TokioBufReader::new(h).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                push_log(line);
            }
            state().write().unwrap_or_else(|e| e.into_inner()).exited = true;
        });
    } else {
        state().write().unwrap_or_else(|e| e.into_inner()).exited = true;
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
///
/// bench.py does not emit the folder name in stdout (T122), so after spawning
/// we sleep 600 ms and pick whatever the filesystem just created. The gap is
/// wide enough for bench.py to mkdir but narrow enough that a second run
/// cannot race in. Two simultaneous starts are blocked by `a_run_is_live()`,
/// so the heuristic is safe in normal operation.
/// Snapshot of all run folder names currently present, taken before spawning
/// so the diff approach (T133) can identify which folder bench.py created.
fn snapshot_run_folders(base: &std::path::Path) -> std::collections::HashSet<String> {
    std::fs::read_dir(base)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect()
}

/// Returns the first folder in `base` not present in `known`, or `None` if
/// bench.py has not created its directory yet.
fn new_folder_since(
    base: &std::path::Path,
    known: &std::collections::HashSet<String>,
) -> Option<String> {
    std::fs::read_dir(base)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .find(|name| !known.contains(name))
}

/// Polls `runs_dir()` for a folder not in `known` for up to 2 s at 50 ms
/// intervals, then falls back to the mtime heuristic if nothing appears.
async fn folder_after_spawn(known: &std::collections::HashSet<String>) -> Option<String> {
    let base = runs_dir();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if let Some(folder) = new_folder_since(&base, known) {
            return Some(folder);
        }
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    // Fallback: mtime heuristic (same as the original 600ms approach).
    newest_run_folder()
}

/// Scan `base` for a run folder whose `results.json` has a non-empty `live`
/// field and whose `pid` file names a still-alive process.  Used by
/// `stop_handler` to recover the pid after a dashboard restart (T135).
fn recover_pid_for_live_run(base: &std::path::Path) -> Option<u32> {
    let rd = std::fs::read_dir(base).ok()?;
    let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if !entry.path().is_dir() {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(entry.path().join("results.json")) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(live) = json.get("live") else {
            continue;
        };
        if live.as_object().is_none_or(|m| m.is_empty()) {
            continue;
        }
        let Ok(pid_str) = std::fs::read_to_string(entry.path().join("pid")) else {
            continue;
        };
        let Ok(pid) = pid_str.trim().parse::<u32>() else {
            continue;
        };
        if pid_alive(pid) {
            return Some(pid);
        }
    }
    None
}

/// T185: if a run folder has a non-empty live blob but no alive pid, clear
/// the blob and return the folder name. Records are left untouched.
fn clear_stale_live_blob(base: &std::path::Path) -> Option<String> {
    let rd = std::fs::read_dir(base).ok()?;
    for entry in rd.filter_map(|e| e.ok()) {
        if !entry.path().is_dir() {
            continue;
        }
        let path = entry.path();
        let results_path = path.join("results.json");
        let Ok(text) = std::fs::read_to_string(&results_path) else {
            continue;
        };
        let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(live) = json.get("live") else {
            continue;
        };
        if live.as_object().is_none_or(|m| m.is_empty()) {
            continue;
        }
        let pid_str = std::fs::read_to_string(path.join("pid")).ok();
        let is_alive = pid_str
            .and_then(|s| s.trim().parse::<u32>().ok())
            .map(pid_alive)
            .unwrap_or(false);
        if is_alive {
            continue;
        }
        if let Some(obj) = json.as_object_mut() {
            obj.insert(
                "live".to_string(),
                serde_json::Value::Object(Default::default()),
            );
        }
        let Ok(out) = serde_json::to_string_pretty(&json) else {
            continue;
        };
        if std::fs::write(&results_path, out).is_ok() {
            return Some(entry.file_name().to_string_lossy().to_string());
        }
    }
    None
}

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
    /// Since localbench `-129`, `--temperature` has NO default: omitting the
    /// flag leaves the server's own setting alone and records
    /// `temperature: null`. That is a real mode, not a trap — but the value
    /// actually sampled at is then whatever llama-server was launched with,
    /// which the run does not record and the dashboard cannot recover. Two
    /// runs could differ in sampling with nothing on record to say so.
    ///
    /// So a dashboard-started run carries an explicit value and stays
    /// self-describing. This is a policy of THIS dashboard, not a bench.py
    /// default — bench.py no longer has one. Letting the dashboard express
    /// "the server decides" is a legitimate feature, but it needs a visible
    /// control that says so; a blank box silently meaning it would be worse
    /// than requiring the value.
    ///
    /// Resume is deliberately different: it must reproduce the recorded run's
    /// conditions, so `ResumeRequest::temperature = None` forwards no flag.
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.temperature.is_none() {
            return Err(
                "temperature is required: bench.py no longer defaults it, so a run started \
                 without one records null and what it actually sampled at cannot be recovered"
                    .to_string(),
            );
        }
        Ok(())
    }

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
        // Always forwarded, never conditional — see validate().
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

/// Every setting `bench.py::_check_resume_compatible` treats as fatal when it
/// differs from the recorded run: `attempts`, `n`, `time_budget`, `time_step`
/// and `temperature`. A resume that omits one of these does not fall back to
/// the recorded value — bench.py compares against ITS OWN default and exits.
///
/// `temperature: None` is not "unspecified", it is the flag being omitted,
/// which is what a run recorded with `temperature: null` requires. Since
/// localbench `-129` that is a distinct value from `0.0`, so the two must not
/// be collapsed on the way through.
#[derive(Debug, Deserialize, Default)]
pub struct ResumeRequest {
    pub folder: String,
    pub attempts: Option<u32>,
    pub n: Option<u32>,
    pub url: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub time_budget: Option<f64>,
    pub time_step: Option<f64>,
}

impl ResumeRequest {
    /// Reject folder values that could escape the runs directory.
    /// Accepts only single-component names with no path separators or leading dots.
    pub(crate) fn validate_folder(&self) -> Result<(), &'static str> {
        if self.folder.is_empty() {
            return Err("folder must not be empty");
        }
        if self.folder.starts_with('/') || self.folder.starts_with('\\') {
            return Err("absolute paths are not allowed");
        }
        if self.folder.contains('/') || self.folder.contains('\\') {
            return Err("folder must be a single directory name, not a path");
        }
        if self.folder.contains("..") {
            return Err("path traversal sequences are not allowed");
        }
        // "." passes the ".." check but resolves to the runs dir itself.
        if self.folder == "." {
            return Err("single dot resolves to the runs directory");
        }
        Ok(())
    }

    /// Reject url values that are not http or https. `None` is allowed — the
    /// field is optional and a missing url omits `--url` from the bench.py
    /// invocation. Scheme check only: an allow-list of the configured server
    /// plus MOCK_URL would be tighter but blocks legitimate ad-hoc targets.
    pub(crate) fn validate_url(&self) -> Result<(), &'static str> {
        let Some(url) = &self.url else {
            return Ok(());
        };
        let scheme_end = url
            .find("://")
            .ok_or("url must include a scheme (http:// or https://)")?;
        let scheme = &url[..scheme_end];
        if scheme != "http" && scheme != "https" {
            return Err("url scheme must be http or https");
        }
        if url.len() <= scheme_end + 3 {
            return Err("url has no host after the scheme");
        }
        Ok(())
    }

    /// Flags in bench.py's own spelling, including every setting its resume
    /// guard compares. Omitting one is not neutral: bench.py compares the
    /// recorded run against its OWN default and exits on a mismatch.
    pub(crate) fn to_args(&self, resume_path: &str) -> Vec<String> {
        // ABSOLUTE: the --resume argument is cwd-resolved by bench.py.
        let mut a = vec!["--resume".to_string(), resume_path.to_string()];
        if let Some(v) = self.attempts {
            a.push("--attempts".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.n {
            a.push("--n".into());
            a.push(v.to_string());
        }
        if let Some(v) = &self.url {
            a.push("-u".into());
            a.push(v.clone());
        }
        if let Some(v) = &self.model {
            a.push("-m".into());
            a.push(v.clone());
        }
        // Absent temperature is the run having recorded `null` — the flag then
        // stays off, because since localbench -129 "unset" and "0" are
        // different conditions and bench.py refuses to mix them.
        if let Some(v) = self.temperature {
            a.push("--temperature".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.time_budget {
            a.push("--time-budget".into());
            a.push(v.to_string());
        }
        if let Some(v) = self.time_step {
            a.push("--time-step".into());
            a.push(v.to_string());
        }
        a
    }
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
    if let Err(e) = req.validate() {
        return axum::response::Json(json!({ "error": e, "success": false }));
    }
    // T127: check liveness and set the spawning flag in the same write-lock
    // acquisition. A concurrent request that passed the old read-only check
    // now sees spawning=true when it acquires its own write lock and is
    // refused, closing the check-then-act gap.
    {
        let mut g = state().write().unwrap_or_else(|e| e.into_inner());
        if should_refuse_start(is_live_state(g.pid, g.exited, g.spawning)) {
            return axum::response::Json(json!({
                "error": "a bench run is already active", "success": false
            }));
        }
        g.spawning = true;
        g.log.clear();
        g.exited = false;
        g.pid = None;
        g.run_folder = None;
        g.current = None;
    }
    // T133: snapshot before spawn so the diff finds bench.py's folder even
    // if an older run has a more recent mtime when the poll fires.
    let known_folders = snapshot_run_folders(&runs_dir());
    match spawn_bench(req.to_args()).await {
        Ok(pid) => {
            let folder = folder_after_spawn(&known_folders).await;
            let current = CurrentRun {
                pid,
                folder: folder.clone(),
                model: req.model.clone(),
                label: req.label.clone(),
                langs: req.langs.clone(),
                url: req.url.clone(),
                attempts: req.attempts,
                n: req.n,
                temperature: req.temperature,
                started: chrono::Utc::now().to_rfc3339(),
            };
            {
                let mut g = state().write().unwrap_or_else(|e| e.into_inner());
                g.pid = Some(pid);
                g.run_folder = folder.clone();
                g.current = Some(current.clone());
                g.spawning = false;
            }
            // T135: persist the pid so stop_handler can recover it after a
            // dashboard restart, when BenchState.pid would otherwise be None.
            if let Some(ref f) = folder {
                if let Err(e) = std::fs::write(runs_dir().join(f).join("pid"), pid.to_string()) {
                    eprintln!("bench: failed to write pid file: {e}");
                }
            }
            // Everything the hero's identity row needs, before results.json
            // exists at all.
            axum::response::Json(json!({
                "pid": pid, "folder": folder, "run": current, "success": true
            }))
        }
        Err(e) => {
            state()
                .write()
                .unwrap_or_else(|e2| e2.into_inner())
                .spawning = false;
            axum::response::Json(json!({ "error": e, "success": false }))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ReadyQuery {
    pub url: Option<String>,
}

/// Is there a server to benchmark at this url?
///
/// The Start button gates on this. Probed from the backend rather than the
/// page because an arbitrary llama-server is a cross-origin target.
pub async fn ready_handler(
    axum::extract::Query(q): axum::extract::Query<ReadyQuery>,
) -> axum::response::Json<Value> {
    let base = q.url.unwrap_or_default();
    if base.trim().is_empty() {
        return axum::response::Json(json!({
            "data": { "ready": false, "url": base, "reason": "No url configured" },
            "success": true
        }));
    }
    let probe = models_probe_url(&base);
    let client = reqwest::Client::new();
    let result =
        tokio::time::timeout(std::time::Duration::from_secs(3), client.get(&probe).send()).await;

    // Sentence-cased here, at the source. These strings are rendered as UI
    // copy, and a display-layer capitalisation pass was only ever a stopgap.
    let (ready, reason, models) = match result {
        Ok(Ok(resp)) => match resp.text().await {
            Ok(body) if server_answering(&body) => (true, String::new(), reported_models(&body)),
            Ok(_) => (
                false,
                format!("{probe} did not return a model list"),
                vec![],
            ),
            Err(e) => (false, format!("Could not read {probe}: {e}"), vec![]),
        },
        Ok(Err(e)) => (false, format!("No server answering at {base}: {e}"), vec![]),
        Err(_) => (
            false,
            format!("No server answering at {base}: timed out"),
            vec![],
        ),
    };

    axum::response::Json(json!({
        "data": {
            "ready": ready,
            "url": base,
            "probe": probe,
            "reason": reason,
            "models": models
        },
        "success": true
    }))
}

/// The run this backend spawned, if it is still alive.
///
/// A run started from the CLI has no process state here — the frontend keeps
/// working for those through the existing results.json polling path, which
/// is why `run` is nullable rather than an error.
pub async fn current_handler() -> axum::response::Json<Value> {
    let run = state()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .current
        .clone();
    // T185: check in-memory state first; if not live, scan disk for a process
    // that survived a dashboard restart and is still running. The result is
    // cached in BenchState so the filesystem scan only happens once.
    let live = a_run_is_live() || {
        let cached = state().read().unwrap_or_else(|e| e.into_inner()).recovered_pid;
        match cached {
            Some(pid) if pid_alive(pid) => true,
            Some(_) => {
                state().write().unwrap_or_else(|e| e.into_inner()).recovered_pid = None;
                false
            }
            None => {
                if let Some(pid) = recover_pid_for_live_run(&runs_dir()) {
                    state().write().unwrap_or_else(|e| e.into_inner()).recovered_pid = Some(pid);
                    true
                } else {
                    false
                }
            }
        }
    };
    axum::response::Json(json!({
        "data": { "running": live, "run": if live { run } else { None } },
        "success": true
    }))
}

pub async fn stop_handler() -> axum::response::Json<Value> {
    let pid = state().read().unwrap_or_else(|e| e.into_inner()).pid;
    // T135: if pid was lost after a restart, recover it from the pid file
    // written at spawn time — the process may still be running.
    let effective_pid = pid.or_else(|| recover_pid_for_live_run(&runs_dir()));
    match effective_pid {
        Some(pid) if pid_alive(pid) => {
            sigterm_only(pid);
            axum::response::Json(json!({
                "success": true,
                "message": "SIGTERM sent; the run saves results and stays resumable"
            }))
        }
        _ => {
            // T185: pid is dead but live blob may still be set — clear it so
            // the user can start again without hand-editing results.json.
            if let Some(cleared) = clear_stale_live_blob(&runs_dir()) {
                axum::response::Json(json!({
                    "success": true,
                    "message": format!("the process was already gone; the run is marked finished ({cleared})")
                }))
            } else {
                axum::response::Json(json!({ "error": "no live bench run", "success": false }))
            }
        }
    }
}

pub async fn skip_handler() -> axum::response::Json<Value> {
    let folder = state()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .run_folder
        .clone();
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
    // Matched on run_id, never folder name — folders can be renamed.
    // Iterates lazily and stops at the first match rather than reading every
    // file upfront.
    let id_clone = id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let Ok(rd) = std::fs::read_dir(runs_dir()) else {
            return None;
        };
        rd.filter_map(|e| e.ok()).find_map(|e| {
            let text = std::fs::read_to_string(e.path().join("results.json")).ok()?;
            let v = serde_json::from_str::<Value>(&text).ok()?;
            let run_id = v.get("run_id").and_then(|r| r.as_str())?;
            if run_id != id_clone.as_str() {
                return None;
            }
            Some(v)
        })
    })
    .await
    .ok()
    .flatten();
    match result {
        Some(v) => axum::response::Json(json!({ "data": v, "success": true })),
        None => axum::response::Json(
            json!({ "error": format!("no run with run_id {id}"), "success": false }),
        ),
    }
}

pub async fn log_handler(
    axum::extract::Query(q): axum::extract::Query<LogQuery>,
) -> axum::response::Json<Value> {
    let (lines, next) = {
        let g = state().read().unwrap_or_else(|e| e.into_inner());
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
    if let Err(reason) = req.validate_folder() {
        return axum::response::Json(json!({ "error": reason, "success": false }));
    }
    if let Err(reason) = req.validate_url() {
        return axum::response::Json(json!({ "error": reason, "success": false }));
    }
    // T127: same atomic check-and-set as start_handler.
    {
        let mut g = state().write().unwrap_or_else(|e| e.into_inner());
        if should_refuse_start(is_live_state(g.pid, g.exited, g.spawning)) {
            return axum::response::Json(json!({
                "error": "a bench run is already active", "success": false
            }));
        }
        g.spawning = true;
        g.log.clear();
        g.exited = false;
        // Clear stale process state from any prior run so a failed spawn cannot
        // leave a dead pid in place that makes is_live_state return true.
        g.pid = None;
        g.run_folder = None;
        g.current = None;
    }
    let dir = bench_dir();
    // ABSOLUTE: the --resume argument is cwd-resolved by bench.py.
    let path = resume_run_path(&dir, &req.folder);
    let args = req.to_args(&path.to_string_lossy());
    match spawn_bench(args).await {
        Ok(pid) => {
            let current = CurrentRun {
                pid,
                folder: Some(req.folder.clone()),
                model: None,
                label: None,
                langs: None,
                url: req.url.clone(),
                attempts: req.attempts,
                n: req.n,
                temperature: req.temperature,
                started: chrono::Utc::now().to_rfc3339(),
            };
            {
                let mut g = state().write().unwrap_or_else(|e| e.into_inner());
                g.pid = Some(pid);
                g.run_folder = Some(req.folder.clone());
                g.current = Some(current);
                g.spawning = false;
            }
            // T135: persist pid for post-restart recovery.
            let _ = std::fs::write(runs_dir().join(&req.folder).join("pid"), pid.to_string());
            // bench.py refuses an incompatible resume by exiting immediately.
            // Reporting success here would announce a run that is already
            // dead and leave the reason visible only to someone who thinks to
            // open the Console tab.
            if settle_liveness_check(a_run_is_live, RESUME_SETTLE_MS).await {
                return axum::response::Json(json!({ "pid": pid, "success": true }));
            }
            let reason = {
                let g = state().read().unwrap_or_else(|e| e.into_inner());
                let (lines, _) = g.log.read_from(0);
                let start = lines.len().saturating_sub(8);
                lines[start..].join("\n")
            };
            axum::response::Json(json!({
                "error": if reason.is_empty() {
                    "bench.py exited immediately without output".to_string()
                } else {
                    reason
                },
                "success": false
            }))
        }
        Err(e) => {
            state()
                .write()
                .unwrap_or_else(|e2| e2.into_inner())
                .spawning = false;
            axum::response::Json(json!({ "error": e, "success": false }))
        }
    }
}

/// Long enough for bench.py to reject a resume and exit, short enough not to
/// stall the button. A refusal is a `sys.exit` on the first read of the run
/// file, not work.
const RESUME_SETTLE_MS: u64 = 900;

/// Second-probe delay after the initial settle — just long enough for a
/// process that was in the middle of its exit sequence at t=SETTLE to have
/// fully exited.
const RESUME_CONFIRM_MS: u64 = 300;

/// T138: check liveness at t=settle_ms and again at t=settle_ms+CONFIRM, so a
/// process mid-exit (reading results.json) at the first probe does not produce
/// a false success.  The closure is called twice; both must return true.
async fn settle_liveness_check<F: Fn() -> bool>(is_live: F, settle_ms: u64) -> bool {
    tokio::time::sleep(std::time::Duration::from_millis(settle_ms)).await;
    if !is_live() {
        return false;
    }
    tokio::time::sleep(std::time::Duration::from_millis(RESUME_CONFIRM_MS)).await;
    is_live()
}

pub async fn queue_advance_handler(
    axum::extract::Json(req): axum::extract::Json<QueueAdvanceRequest>,
) -> axum::response::Json<Value> {
    if req.script_path.is_empty() {
        return axum::response::Json(
            json!({ "error": "script_path must not be empty", "success": false }),
        );
    }
    if req.script_path.contains("..") {
        return axum::response::Json(
            json!({ "error": "path traversal sequences are not allowed", "success": false }),
        );
    }
    if req.script_path.starts_with('/') {
        return axum::response::Json(
            json!({ "error": "absolute paths are not allowed", "success": false }),
        );
    }
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
    let url = models_probe_url(&base);
    // T137: browsers drop connections well before 600s.  Cap each request at
    // 30s and signal still_waiting=true so a caller can re-POST immediately
    // without rebuilding the whole poll loop client-side.  Total patience for
    // a cold 27B load (~10 min) is achieved by the caller looping on
    // still_waiting rather than this handler holding a connection for 600s.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
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
        "ready": false, "still_waiting": true, "success": false,
        "error": format!("{} not yet visible in {url} — re-POST to continue waiting", req.expected_model_id)
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

    // T193 — ResumeRequest carries the model flag through to_args.
    #[test]
    fn t193_resume_to_args_includes_model_flag() {
        let req = ResumeRequest {
            folder: "run_20260808".to_string(),
            model: Some("gemma-4-27B".to_string()),
            ..Default::default()
        };
        let args = req.to_args("/runs/run_20260808");
        let pos = args
            .iter()
            .position(|a| a == "-m")
            .expect("-m flag must appear in to_args when model is Some");
        assert_eq!(args[pos + 1], "gemma-4-27B");
    }

    #[test]
    fn t193_resume_to_args_omits_model_flag_when_none() {
        let req = ResumeRequest {
            folder: "run_20260808".to_string(),
            model: None,
            ..Default::default()
        };
        let args = req.to_args("/runs/run_20260808");
        assert!(
            !args.contains(&"-m".to_string()),
            "-m must be absent from to_args when model is None"
        );
    }

    #[test]
    fn t193_resume_to_args_always_starts_with_resume_path() {
        let req = ResumeRequest {
            folder: "run_20260808".to_string(),
            model: Some("x".to_string()),
            temperature: Some(0.6),
            ..Default::default()
        };
        let args = req.to_args("/absolute/path/to/run");
        assert_eq!(args[0], "--resume");
        assert_eq!(args[1], "/absolute/path/to/run");
    }

    // T193b — finished is task-coverage based, not just live=={}.
    #[test]
    fn t193b_interrupted_run_is_not_finished_when_tasks_lt_suite_tasks() {
        let json = r#"{
            "run_id":"r1","suite_hash":"abc","created":"2026-08-01T00:00:00",
            "models":["m"],
            "summary":{"tasks":25,"suite_tasks":27,"samples":0,"mean_points":0,
                        "max_points":0,"solved":0,"first_try":0,"tests_passed":0,
                        "tests_expected":0,"seconds":0,"unsolved":[]},
            "config":{},"live":{}
        }"#;
        let s = parse_run_summary(json, "f").unwrap();
        assert!(
            !s.finished,
            "25/27 tasks with live=={{}} must be interrupted (finished=false), not finished"
        );
    }

    #[test]
    fn t193b_complete_run_is_finished_when_tasks_eq_suite_tasks() {
        let json = r#"{
            "run_id":"r1","suite_hash":"abc","created":"2026-08-01T00:00:00",
            "models":["m"],
            "summary":{"tasks":27,"suite_tasks":27,"samples":0,"mean_points":0,
                        "max_points":0,"solved":0,"first_try":0,"tests_passed":0,
                        "tests_expected":0,"seconds":0,"unsolved":[]},
            "config":{},"live":{}
        }"#;
        let s = parse_run_summary(json, "f").unwrap();
        assert!(s.finished, "27/27 tasks with live=={{}} must be finished");
    }

    #[test]
    fn t193b_no_suite_tasks_falls_back_to_live_empty() {
        let json = r#"{
            "run_id":"r1","suite_hash":"abc","created":"2026-08-01T00:00:00",
            "models":["m"],
            "summary":{"tasks":4,"samples":0,"mean_points":0,"max_points":0,
                        "solved":0,"first_try":0,"tests_passed":0,"tests_expected":0,
                        "seconds":0,"unsolved":[]},
            "config":{},"live":{}
        }"#;
        let s = parse_run_summary(json, "f").unwrap();
        assert!(
            s.finished,
            "without suite_tasks, live=={{}} alone must mean finished (pre-157 format)"
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

    // T45, amended by T96. This test used to assert the refusal names GREEDY
    // decoding, because bench.py declared `--temperature` with `default=0.0`.
    // localbench -129 removed that default: omitting the flag now leaves the
    // server's own setting alone, so "omitting it selects greedy" is false and
    // a test demanding the word "greedy" pinned a rule that no longer exists.
    //
    // The REFUSAL still stands, on a reason that is currently true: a run
    // started without a temperature records `null`, and what it actually
    // sampled at is then unrecoverable. Both halves are still guarded — the
    // refusal below, and `t45_temperature_zero_is_a_real_value_not_an_absent_one`
    // which keeps 0 distinct from absent.
    #[test]
    fn t45_start_refuses_a_missing_temperature_because_the_run_cannot_record_it() {
        let mut req = StartRequest {
            model: Some("m".into()),
            ..Default::default()
        };
        let err = req
            .validate()
            .expect_err("a missing temperature must be refused");
        assert!(
            !err.contains("defaults --temperature to 0.0"),
            "the reason must not cite a bench.py default that no longer exists: {err}"
        );
        assert!(
            err.contains("no longer defaults"),
            "the reason must be one that is currently true: {err}"
        );

        req.temperature = Some(0.6);
        assert!(req.validate().is_ok());
        let joined = req.to_args().join(" ");
        assert!(
            joined.contains("--temperature 0.6"),
            "temperature must always be forwarded explicitly: {joined}"
        );
    }

    // T96 — the live break. bench.py's `_check_resume_compatible` exits when
    // the resumed run's temperature differs from the recorded one, and since
    // -129 `None` is one of the values it compares. A resume that forwards no
    // `--temperature` therefore kills every dashboard-started run, all of
    // which record a concrete value because `validate()` demands one.
    #[test]
    fn t96_resume_forwards_every_setting_bench_pys_resume_guard_compares() {
        let req = ResumeRequest {
            folder: "seedA_20260808".into(),
            attempts: Some(3),
            n: Some(1),
            url: Some("http://localhost:8081".into()),
            model: None,
            temperature: Some(0.2),
            time_budget: Some(15.0),
            time_step: Some(30.0),
        };
        let joined = req.to_args("/runs/seedA_20260808").join(" ");

        assert!(
            joined.contains("--temperature 0.2"),
            "the recorded temperature must be forwarded or bench.py exits: {joined}"
        );
        // The rest of the same fatal comparison in bench.py:1137.
        for expected in [
            "--attempts 3",
            "--n 1",
            "--time-budget 15",
            "--time-step 30",
        ] {
            assert!(
                joined.contains(expected),
                "resume must forward {expected}: {joined}"
            );
        }
    }

    // The absence half, per AGENTS.md: a run recorded with `temperature: null`
    // must be resumed with NO flag. Sending 0 instead would be the inverse bug
    // — bench.py treats unset and 0 as different conditions and refuses both
    // directions of the mismatch.
    #[test]
    fn t96_resume_of_a_run_without_a_temperature_sends_no_temperature_flag() {
        let req = ResumeRequest {
            folder: "seedB".into(),
            attempts: Some(3),
            temperature: None,
            ..Default::default()
        };
        let joined = req.to_args("/runs/seedB").join(" ");
        assert!(
            !joined.contains("--temperature"),
            "unset must stay unset, not become 0: {joined}"
        );
    }

    #[test]
    fn t45_temperature_zero_is_a_real_value_not_an_absent_one() {
        // 0.0 chosen deliberately must still be forwarded, and must not be
        // confused with "not supplied".
        let req = StartRequest {
            temperature: Some(0.0),
            ..Default::default()
        };
        assert!(req.validate().is_ok());
        assert!(req.to_args().join(" ").contains("--temperature 0"));
    }

    // T37 (backend half) — the readiness gate Start depends on.
    #[test]
    fn t37_probe_url_matches_bench_pys_own_v1_handling() {
        // bench.py appends /v1 only when the url has no path.
        assert_eq!(
            models_probe_url("http://localhost:8081"),
            "http://localhost:8081/v1/models"
        );
        assert_eq!(
            models_probe_url("http://localhost:8081/"),
            "http://localhost:8081/v1/models"
        );
        // Already /v1 — must not become /v1/v1/models.
        assert_eq!(
            models_probe_url("http://127.0.0.1:8123/v1"),
            "http://127.0.0.1:8123/v1/models"
        );
    }

    #[test]
    fn t37_answering_is_weaker_than_expecting_a_specific_model() {
        // An empty roster still means a server is there to benchmark.
        assert!(server_answering(r#"{"data":[]}"#));
        assert!(server_answering(r#"{"data":[{"id":"ref-model"}]}"#));
        // Nothing answering, or answering with something else entirely.
        assert!(!server_answering("connection refused"));
        assert!(!server_answering(r#"{"error":"no model loaded"}"#));
        // The stricter queue check still demands the exact id.
        assert!(!queue_advance_ready(r#"{"data":[]}"#, "some-model"));
    }

    // T65 — the ids the target actually reports, so a stale --model can be
    // caught before a 35-minute run records the wrong name forever.
    #[test]
    fn t65_reported_models_reads_the_ids_the_endpoint_returns() {
        assert_eq!(
            reported_models(r#"{"data":[{"id":"Qwen3.6-35B-APEX"}]}"#),
            vec!["Qwen3.6-35B-APEX".to_string()]
        );
        assert_eq!(
            reported_models(r#"{"data":[{"id":"a"},{"id":"b"}]}"#),
            vec!["a".to_string(), "b".to_string()]
        );
        // An empty roster is still a live server; it just names nothing to
        // compare against, which must read as "unknown", not as a mismatch.
        assert!(reported_models(r#"{"data":[]}"#).is_empty());
        assert!(reported_models("connection refused").is_empty());
        assert!(reported_models(r#"{"data":[{"name":"no-id-field"}]}"#).is_empty());
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

    // T93, the absence half. bench.py cannot be told "no languages": an empty
    // `--langs` is an empty set, which is falsy, so its filter is skipped and
    // the FULL suite runs (`bench.py:233`). Sending the flag with an empty
    // value would therefore run everything while claiming to be filtered, so
    // `None` must omit the flag entirely rather than emit a bare `--langs`.
    #[test]
    fn t93_no_langs_omits_the_flag_rather_than_sending_an_empty_one() {
        let req = StartRequest {
            model: Some("buggy-model".into()),
            langs: None,
            temperature: Some(0.6),
            ..Default::default()
        };
        let joined = req.to_args().join(" ");
        assert!(
            !joined.contains("--langs"),
            "an empty --langs means EVERY language to bench.py: {joined}"
        );
    }

    // T118 — validate_folder blocks path traversal and absolute paths.
    #[test]
    fn t118_validate_folder_accepts_plain_name() {
        let req = ResumeRequest {
            folder: "seedA_20260808-223558".into(),
            ..Default::default()
        };
        assert!(req.validate_folder().is_ok());
    }

    #[test]
    fn t118_validate_folder_rejects_absolute_path() {
        let req = ResumeRequest {
            folder: "/etc/passwd".into(),
            ..Default::default()
        };
        assert!(req.validate_folder().is_err());
    }

    #[test]
    fn t118_validate_folder_rejects_path_separator() {
        let req = ResumeRequest {
            folder: "runs/../../etc".into(),
            ..Default::default()
        };
        assert!(req.validate_folder().is_err());
    }

    #[test]
    fn t118_validate_folder_rejects_dotdot() {
        let req = ResumeRequest {
            folder: "..".into(),
            ..Default::default()
        };
        assert!(req.validate_folder().is_err());
    }

    #[test]
    fn t118_validate_folder_rejects_empty() {
        let req = ResumeRequest {
            folder: "".into(),
            ..Default::default()
        };
        assert!(req.validate_folder().is_err());
    }

    // T138 — a single pid_alive check at t=900ms gives false success when the
    // process is mid-exit (reading results.json) and dies moments later.
    // settle_liveness_check polls twice with a gap; both checks must pass.
    #[tokio::test]
    async fn t138_settle_liveness_check_requires_both_probes_to_pass() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        // First probe alive, second probe dead → must NOT report alive.
        let n = AtomicUsize::new(0);
        let result = settle_liveness_check(
            || n.fetch_add(1, Ordering::SeqCst) == 0,
            0, // settle_ms=0 so the test doesn't wait 900ms
        )
        .await;
        assert!(
            !result,
            "process alive at first probe but dead at second must not be reported alive"
        );

        // Both probes alive → must report alive.
        let result2 = settle_liveness_check(|| true, 0).await;
        assert!(result2, "consistently alive process must be reported alive");
    }

    // T136 — queue_advance_handler used to build the /v1/models url by
    // concatenation, producing …/v1/v1/models when the user configured a
    // /v1-suffixed base url (the default).  models_probe_url() strips the
    // trailing /v1 before appending /v1/models.
    #[test]
    fn t136_models_probe_url_handles_v1_suffixed_base() {
        // Demonstrate the old bug.
        let v1_url = "http://localhost:8081/v1";
        let buggy = format!("{}/v1/models", v1_url.trim_end_matches('/'));
        assert_eq!(
            buggy, "http://localhost:8081/v1/v1/models",
            "raw concatenation produces a double /v1"
        );
        // The fix: use models_probe_url which strips the trailing /v1.
        assert_eq!(
            models_probe_url(v1_url),
            "http://localhost:8081/v1/models",
            "models_probe_url must not double-append /v1"
        );
        // Plain URL (no /v1 suffix) must be unchanged.
        assert_eq!(
            models_probe_url("http://localhost:8081"),
            "http://localhost:8081/v1/models"
        );
    }

    // T135 — after a dashboard restart BenchState.pid is None; stop_handler
    // must recover the pid from the pid file written at spawn time.
    #[test]
    fn t135_recover_pid_for_live_run_finds_pid_file_beside_active_run() {
        let runs = std::env::temp_dir().join(format!(
            "bench_t135_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let folder = runs.join("my-run_20260808-120000");
        std::fs::create_dir_all(&folder).unwrap();

        // A results.json whose `live` field is non-empty (run is active).
        std::fs::write(
            folder.join("results.json"),
            r#"{"live":{"current_task":"js/foo","done":1,"total":4},"models":["m"]}"#,
        )
        .unwrap();

        // The pid file the dashboard writes at spawn time.
        let own_pid = std::process::id(); // always alive
        std::fs::write(folder.join("pid"), own_pid.to_string()).unwrap();

        let found = recover_pid_for_live_run(&runs);
        assert_eq!(
            found,
            Some(own_pid),
            "must recover the pid from the pid file beside the active run"
        );

        // A run whose live field is empty must not be returned.
        let finished = runs.join("done-run_20260808-110000");
        std::fs::create_dir_all(&finished).unwrap();
        std::fs::write(
            finished.join("results.json"),
            r#"{"live":{},"models":["m"]}"#,
        )
        .unwrap();
        std::fs::write(finished.join("pid"), own_pid.to_string()).unwrap();

        // Recovery must still find the active run, not the finished one.
        assert_eq!(recover_pid_for_live_run(&runs), Some(own_pid));

        let _ = std::fs::remove_dir_all(&runs);
    }

    // T160 — pid recovery must SKIP unusable run folders rather than aborting
    // the whole scan.  Five tests, one per `?` that was causing early return.
    // Defective folder is created FIRST (insertion order = scan order on tmpfs),
    // valid live folder SECOND.  With the old `?` code the defective folder
    // aborts the scan and None is returned; after the fix the scan continues.
    fn t160_make_runs(suffix: &str) -> std::path::PathBuf {
        let runs = std::env::temp_dir().join(format!(
            "bench_t160{}_{}",
            suffix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&runs).unwrap();
        runs
    }

    fn t160_add_live_folder(runs: &std::path::Path, own_pid: u32) {
        // Named "live" — hashes after "defective" on this filesystem,
        // so "defective" is always returned first by read_dir.
        let live = runs.join("live");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::write(
            live.join("results.json"),
            r#"{"live":{"current_task":"js/foo","done":1,"total":4},"models":["m"]}"#,
        )
        .unwrap();
        std::fs::write(live.join("pid"), own_pid.to_string()).unwrap();
    }

    #[test]
    fn t160a_pid_recovery_skips_folder_missing_results_json() {
        let own_pid = std::process::id();
        let runs = t160_make_runs("a");
        // "defective" hashes before "live" on this filesystem → scanned first.
        std::fs::create_dir_all(runs.join("defective")).unwrap();
        t160_add_live_folder(&runs, own_pid);
        assert_eq!(
            recover_pid_for_live_run(&runs),
            Some(own_pid),
            "missing results.json must be skipped, not abort the scan",
        );
        let _ = std::fs::remove_dir_all(&runs);
    }

    #[test]
    fn t160b_pid_recovery_skips_folder_with_invalid_json() {
        let own_pid = std::process::id();
        let runs = t160_make_runs("b");
        let defective = runs.join("defective");
        std::fs::create_dir_all(&defective).unwrap();
        std::fs::write(defective.join("results.json"), "not json at all").unwrap();
        t160_add_live_folder(&runs, own_pid);
        assert_eq!(
            recover_pid_for_live_run(&runs),
            Some(own_pid),
            "invalid JSON must be skipped, not abort the scan",
        );
        let _ = std::fs::remove_dir_all(&runs);
    }

    #[test]
    fn t160c_pid_recovery_skips_folder_with_no_live_key() {
        let own_pid = std::process::id();
        let runs = t160_make_runs("c");
        let defective = runs.join("defective");
        std::fs::create_dir_all(&defective).unwrap();
        // results.json valid JSON but no `live` key.
        std::fs::write(defective.join("results.json"), r#"{"models":["m"]}"#).unwrap();
        t160_add_live_folder(&runs, own_pid);
        assert_eq!(
            recover_pid_for_live_run(&runs),
            Some(own_pid),
            "missing `live` key must be skipped, not abort the scan",
        );
        let _ = std::fs::remove_dir_all(&runs);
    }

    #[test]
    fn t160d_pid_recovery_skips_folder_missing_pid_file() {
        let own_pid = std::process::id();
        let runs = t160_make_runs("d");
        let defective = runs.join("defective");
        std::fs::create_dir_all(&defective).unwrap();
        // Non-empty live but no pid file.
        std::fs::write(
            defective.join("results.json"),
            r#"{"live":{"current_task":"ts/bar","done":0,"total":1},"models":["m"]}"#,
        )
        .unwrap();
        t160_add_live_folder(&runs, own_pid);
        assert_eq!(
            recover_pid_for_live_run(&runs),
            Some(own_pid),
            "missing pid file must be skipped, not abort the scan",
        );
        let _ = std::fs::remove_dir_all(&runs);
    }

    #[test]
    fn t160e_pid_recovery_skips_folder_with_unparseable_pid() {
        let own_pid = std::process::id();
        let runs = t160_make_runs("e");
        let defective = runs.join("defective");
        std::fs::create_dir_all(&defective).unwrap();
        std::fs::write(
            defective.join("results.json"),
            r#"{"live":{"current_task":"ts/bar","done":0,"total":1},"models":["m"]}"#,
        )
        .unwrap();
        std::fs::write(defective.join("pid"), "not-a-number").unwrap();
        t160_add_live_folder(&runs, own_pid);
        assert_eq!(
            recover_pid_for_live_run(&runs),
            Some(own_pid),
            "unparseable pid must be skipped, not abort the scan",
        );
        let _ = std::fs::remove_dir_all(&runs);
    }

    // T133 — folder-attach must use a pre-spawn snapshot so a decoy directory
    // (or the previous run's folder touched during the 600ms window) is never
    // mistaken for the new run's folder.
    #[test]
    fn t133_new_folder_since_skips_decoy_and_finds_real_folder() {
        let runs = std::env::temp_dir().join(format!(
            "bench_t133_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&runs).unwrap();

        // Pre-existing decoy (newest by mtime — the old heuristic would pick this).
        std::fs::create_dir(runs.join("decoy-run_20260808-120000")).unwrap();

        let known = snapshot_run_folders(&runs);

        // No new folder yet: must return None, not the decoy.
        assert!(
            new_folder_since(&runs, &known).is_none(),
            "must not attach to the decoy when bench.py has not created its folder yet"
        );

        // bench.py creates its folder.
        std::fs::create_dir(runs.join("new-run_20260808-120001")).unwrap();

        let found = new_folder_since(&runs, &known);
        assert_eq!(
            found.as_deref(),
            Some("new-run_20260808-120001"),
            "must attach to the newly created folder, not the decoy"
        );

        let _ = std::fs::remove_dir_all(&runs);
    }

    // T144 — validate_folder must reject "." (which contains no ".." so it
    // passes all existing guards but resolves to the runs directory itself).
    #[test]
    fn t144_validate_folder_rejects_dot() {
        let req = |folder: &str| ResumeRequest {
            folder: folder.to_string(),
            ..Default::default()
        };
        assert!(
            req(".").validate_folder().is_err(),
            r#""." resolves to the runs dir itself and must be rejected"#
        );
        // "./" and ".//" already fail the path-separator check — verify that
        // too so the guard is clearly complete.
        assert!(
            req("./").validate_folder().is_err(),
            r#""./" must be rejected (contains /)"#
        );
        assert!(
            req(".//.").validate_folder().is_err(),
            r#"".//.". must be rejected (contains /)"#
        );
    }

    // T161 — ResumeRequest.url must require http/https and reject unparseable
    // strings.  The configured URL still resumes successfully.
    #[test]
    fn t161_validate_url_rejects_non_http_scheme() {
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: Some("file:///etc/passwd".into()),
            ..Default::default()
        };
        assert!(
            req.validate_url().is_err(),
            "file:// scheme must be rejected",
        );
    }

    #[test]
    fn t161_validate_url_rejects_unparseable_string() {
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: Some("not-a-url".into()),
            ..Default::default()
        };
        assert!(
            req.validate_url().is_err(),
            "string with no :// must be rejected",
        );
    }

    #[test]
    fn t161_validate_url_rejects_scheme_only() {
        // "http://" has no host — bench.py would error anyway but we reject early.
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: Some("http://".into()),
            ..Default::default()
        };
        assert!(
            req.validate_url().is_err(),
            "http:// with no host must be rejected",
        );
    }

    #[test]
    fn t161_validate_url_accepts_http() {
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: Some("http://localhost:8080".into()),
            ..Default::default()
        };
        assert!(req.validate_url().is_ok(), "http URL must be accepted");
    }

    #[test]
    fn t161_validate_url_accepts_https() {
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: Some("https://llama.local:8080".into()),
            ..Default::default()
        };
        assert!(req.validate_url().is_ok(), "https URL must be accepted");
    }

    #[test]
    fn t161_validate_url_accepts_none() {
        // url is optional; None means the --url flag is simply omitted.
        let req = ResumeRequest {
            folder: "run_20260101-120000".into(),
            url: None,
            ..Default::default()
        };
        assert!(req.validate_url().is_ok(), "None url must be accepted");
    }

    // T127 — the spawning flag is included in the liveness check so a
    // concurrent start that slips past the original read-only check is refused
    // when it tries to acquire the write lock.
    #[test]
    fn t127_spawning_flag_makes_state_live_so_concurrent_start_is_refused() {
        assert!(
            is_live_state(None, false, true),
            "spawning=true must report live — closes the TOCTOU window"
        );
        assert!(
            !is_live_state(None, false, false),
            "idle state (no pid, not spawning) must not report live"
        );
        assert!(
            !is_live_state(None, true, false),
            "exited with no pid must not report live"
        );
    }

    // T140 — all state() lock acquisitions use unwrap_or_else so a poisoned
    // lock does not crash the process. Verify the recovery pattern holds for
    // any RwLock — avoids touching the global singleton from a test.
    #[test]
    fn t140_poisoned_rwlock_is_recovered_by_unwrap_or_else() {
        use std::sync::{Arc, RwLock};
        let lock: Arc<RwLock<u32>> = Arc::new(RwLock::new(42));
        let lock2 = Arc::clone(&lock);
        let _ = std::panic::catch_unwind(move || {
            let _g = lock2.write().unwrap();
            panic!("deliberate poison for T140");
        });
        // After poisoning, unwrap_or_else must recover the inner value.
        let val = *lock.read().unwrap_or_else(|e| e.into_inner());
        assert_eq!(val, 42, "poisoned lock must be recovered, not panic");
    }

    // ── T185 helpers ─────────────────────────────────────────────────────────

    fn t185_make_runs(suffix: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bench_t185{}_{}",
            suffix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn t185_add_run(
        runs: &std::path::Path,
        name: &str,
        live: serde_json::Value,
        record_count: usize,
        pid: Option<u32>,
    ) {
        let dir = runs.join(name);
        std::fs::create_dir_all(&dir).unwrap();
        let records: Vec<serde_json::Value> = (0..record_count)
            .map(|i| serde_json::json!({"n": i}))
            .collect();
        let results = serde_json::json!({"live": live, "records": records});
        std::fs::write(
            dir.join("results.json"),
            serde_json::to_string_pretty(&results).unwrap(),
        )
        .unwrap();
        if let Some(p) = pid {
            std::fs::write(dir.join("pid"), p.to_string()).unwrap();
        }
    }

    // ── T185 tests ───────────────────────────────────────────────────────────

    #[test]
    fn t185a_clear_stale_live_blob_clears_dead_pid_run() {
        let runs = t185_make_runs("a");
        t185_add_run(
            &runs,
            "run1",
            serde_json::json!({"task": "ts/scheduler", "total": 10}),
            6,
            Some(9_999_999), // dead pid
        );
        let cleared = clear_stale_live_blob(&runs);
        assert_eq!(cleared.as_deref(), Some("run1"), "must return folder name");
        let text = std::fs::read_to_string(runs.join("run1/results.json")).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert!(
            json["live"].as_object().unwrap().is_empty(),
            "live must be empty after clear"
        );
    }

    #[test]
    fn t185b_clear_stale_live_blob_leaves_records_untouched() {
        let runs = t185_make_runs("b");
        t185_add_run(
            &runs,
            "run1",
            serde_json::json!({"task": "ts/scheduler"}),
            6,
            Some(9_999_999),
        );
        clear_stale_live_blob(&runs);
        let text = std::fs::read_to_string(runs.join("run1/results.json")).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            json["records"].as_array().unwrap().len(),
            6,
            "record count must be unchanged"
        );
    }

    #[test]
    fn t185c_clear_stale_live_blob_skips_alive_pid() {
        let runs = t185_make_runs("c");
        let own_pid = std::process::id();
        t185_add_run(
            &runs,
            "live_run",
            serde_json::json!({"task": "ts/scheduler"}),
            3,
            Some(own_pid), // alive pid — must not be cleared
        );
        let cleared = clear_stale_live_blob(&runs);
        assert!(cleared.is_none(), "must not clear a run whose pid is alive");
        // Verify live blob was left intact
        let text = std::fs::read_to_string(runs.join("live_run/results.json")).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert!(
            !json["live"].as_object().unwrap().is_empty(),
            "live blob must not have been touched"
        );
    }

    #[test]
    fn t185d_clear_stale_live_blob_skips_empty_live() {
        let runs = t185_make_runs("d");
        t185_add_run(
            &runs,
            "run1",
            serde_json::json!({}), // already empty — nothing to do
            3,
            Some(9_999_999),
        );
        let cleared = clear_stale_live_blob(&runs);
        assert!(
            cleared.is_none(),
            "must not touch a run whose live blob is already empty"
        );
    }

    #[test]
    fn t185e_clear_stale_live_blob_returns_none_for_empty_dir() {
        let runs = t185_make_runs("e");
        let cleared = clear_stale_live_blob(&runs);
        assert!(cleared.is_none(), "empty runs dir must return None");
    }

    // T9 — BenchLog::read_from with offset > total after a log clear.
    // A stale client offset (held from before the clear) must return all
    // current lines rather than an empty response that permanently misses them.
    #[test]
    fn t9_stale_offset_after_clear_returns_all_current_lines() {
        let mut log = BenchLog::default();
        for i in 0..5 {
            log.append(format!("old {i}"));
        }
        let (_, far_offset) = log.read_from(0);
        assert_eq!(far_offset, 5);

        log.clear();
        log.append("fresh A".into());
        log.append("fresh B".into());

        // far_offset (5) > total (2): must return all current lines, not empty.
        let (lines, next) = log.read_from(far_offset);
        assert_eq!(
            lines,
            vec!["fresh A".to_string(), "fresh B".to_string()],
            "stale offset past total must catch up to all current lines"
        );
        assert_eq!(next, 2, "next offset is the new total");
    }
}
