//! AI management endpoints: directory browse, PTY terminal proxy, saved commands CRUD.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use crate::models::ai::*;

// ─── Directory Browse ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: String,
}

pub fn browse_directory(path: &str) -> Vec<DirectoryEntry> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    entries
        .filter_map(|e| e.ok())
        .map(|e| DirectoryEntry {
            name: e.file_name().to_string_lossy().to_string(),
            is_dir: e.path().is_dir(),
        })
        .collect()
}

// ─── Git Info ──────────────────────────────────────────────────────

pub fn read_git_info(dir: &str) -> Option<GitInfo> {
    let head_path = Path::new(dir).join(".git");
    if !head_path.exists() {
        return None;
    }

    // Try to read HEAD for branch/commit
    let head_content = fs::read_to_string(head_path.join("HEAD")).ok()?;
    let head_trimmed = head_content.trim();

    // Check if it's a symbolic reference (branch) or direct commit hash
    if head_trimmed.starts_with("ref: refs/") {
        let ref_path = head_trimmed.strip_prefix("ref: ").unwrap_or(head_trimmed);
        let ref_file = Path::new(dir).join(".git").join(ref_path);
        let ref_content = fs::read_to_string(&ref_file).ok()?;
        let commit_hash = ref_content.trim();

        // Extract branch name from ref path (e.g., "refs/heads/main" -> "main")
        let branch = if let Some(b) = ref_path.strip_prefix("refs/heads/") {
            Some(b.to_string())
        } else if let Some(b) = ref_path.strip_prefix("refs/tags/") {
            Some(b.to_string())
        } else {
            None
        };

        Some(GitInfo {
            branch,
            commit_hash: if commit_hash.len() >= 7 {
                Some(commit_hash[..7].to_string())
            } else {
                None
            },
        })
    } else if head_trimmed.len() >= 7 {
        // Direct commit hash (detached HEAD)
        Some(GitInfo {
            branch: None,
            commit_hash: Some(head_trimmed[..7].to_string()),
        })
    } else {
        None
    }
}

// ─── Build Directory Status ────────────────────────────────────────

pub fn check_build_dir(build_path: &str) -> BuildDirStatus {
    let p = Path::new(build_path);
    if !p.exists() {
        return BuildDirStatus {
            exists: false,
            last_modified: None,
        };
    }

    let metadata = fs::metadata(p).ok();
    let last_modified = metadata.and_then(|m| m.modified().ok()).map(|t| {
        chrono::DateTime::<chrono::Utc>::from(t)
            .format("%Y-%m-%d %H:%M")
            .to_string()
    });

    BuildDirStatus {
        exists: true,
        last_modified,
    }
}

// ─── Detect Executables ────────────────────────────────────────────

pub fn detect_executables(dir: &str) -> Vec<ExecutableInfo> {
    let p = Path::new(dir);
    if !p.exists() || !p.is_dir() {
        return vec![
            ExecutableInfo {
                name: "llama-server".to_string(),
                path: format!("{}/llama-server", dir),
                exists: false,
            },
            ExecutableInfo {
                name: "main".to_string(),
                path: format!("{}/main", dir),
                exists: false,
            },
        ];
    }

    let mut found = Vec::new();
    if let Ok(entries) = fs::read_dir(p) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            if path.is_file() {
                // Check if it's an executable (has execute permission or known names)
                if name.contains("llama") || name == "main" || name.starts_with("server") {
                    found.push(ExecutableInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        exists: true,
                    });
                }
            }
        }
    }

    if found.is_empty() {
        found = vec![
            ExecutableInfo {
                name: "llama-server".to_string(),
                path: format!("{}/llama-server", dir),
                exists: false,
            },
            ExecutableInfo {
                name: "main".to_string(),
                path: format!("{}/main", dir),
                exists: false,
            },
        ];
    }

    found
}

// ─── Directory Validation ─────────────────────────────────────────

pub fn validate_directory(path: &str) -> Vec<String> {
    let p = Path::new(path);
    if !p.exists() || !p.is_dir() {
        return vec![];
    }

    let mut checks = Vec::new();

    // Check for CMakeLists.txt
    if p.join("CMakeLists.txt").exists() {
        checks.push("CMakeLists.txt".to_string());
    }

    // Check for .git directory
    if p.join(".git").exists() {
        checks.push(".git".to_string());
    }

    // Check for build/ directory
    if p.join("build").is_dir() {
        checks.push("build/".to_string());
    }

    // Check for build/bin/ directory
    if p.join("build/bin").is_dir() {
        checks.push("build/bin/".to_string());
    }

    checks
}

// ─── Repository Info (git remote, version) ─────────────────────────

pub fn get_repo_readme_url(dir: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(dir)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    remote_url_to_readme_url(&url)
}

fn remote_url_to_readme_url(remote: &str) -> Option<String> {
    let remote = remote.trim_end_matches(".git");
    let repo_path = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("https://github.com/"))
        .or_else(|| remote.strip_prefix("http://github.com/"))?;
    Some(format!(
        "https://github.com/{}/blob/master/README.md",
        repo_path
    ))
}

pub fn get_local_build_tag(dir: &str, tag_prefix: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["tag", "--sort=-version:refname"])
        .current_dir(dir)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|l| l.starts_with(tag_prefix))
        .map(|s| s.trim().to_string())
}

pub async fn get_latest_release_tag(github_repo: &str) -> Option<String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        github_repo
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "system-dashboard")
        .send()
        .await
        .ok()?;
    let json: serde_json::Value = resp.json().await.ok()?;
    json.get("tag_name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn get_repo_version(dir: &str) -> Option<String> {
    let describe = std::process::Command::new("git")
        .args(["describe", "--always", "--dirty"])
        .current_dir(dir)
        .output()
        .ok();
    if let Some(out) = describe {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }

    let rev = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(dir)
        .output()
        .ok()?;
    if rev.status.success() {
        let s = String::from_utf8_lossy(&rev.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    None
}

// ─── Saved Commands (JSON file persistence) ────────────────────────

const COMMANDS_FILE: &str = ".opencode/ai_commands.json";

fn commands_file_path() -> String {
    let base = std::env::current_dir().unwrap_or_else(|_| "/tmp".into());
    format!("{}/{}", base.display(), COMMANDS_FILE)
}

#[derive(Debug, Serialize, Deserialize)]
struct CommandsFile {
    pub commands: Vec<SavedCommand>,
}

pub fn load_commands() -> Vec<SavedCommand> {
    let path = commands_file_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(data) = serde_json::from_str::<CommandsFile>(&content) {
            return data.commands;
        }
    }
    Vec::new()
}

pub fn save_commands(commands: &[SavedCommand]) -> Result<(), String> {
    let path = commands_file_path();
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let data = CommandsFile {
        commands: commands.to_vec(),
    };
    let json =
        serde_json::to_string_pretty(&data).map_err(|e| format!("Serialization error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {}", e))
}

pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("cmd_{}", now)
}

// ─── PTY Terminal Proxy ────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TerminalSpawnResponse {
    pub pid: i32,
    pub pts_name: String,
}

const MAX_SCROLLBACK: usize = 8192;

struct TerminalState {
    master_fd: std::os::unix::io::RawFd,
    pid: i32,
    broadcast_tx: Option<tokio::sync::broadcast::Sender<String>>,
    _reader_handle: Option<std::thread::JoinHandle<()>>,
    scrollback: ScrollbackBuffer,
    /// When the terminal last had zero attached viewers. `None` while at least
    /// one viewer is connected. Used by the idle reaper to detect abandoned
    /// sessions (e.g. a tab closed via the browser's own X instead of the
    /// in-app Close button, which intentionally only detaches rather than kills).
    zero_viewers_since: Option<std::time::Instant>,
}

type ScrollbackBuffer = std::sync::Arc<std::sync::Mutex<Vec<String>>>;

static TERMINALS: Mutex<Vec<(String, std::sync::Arc<std::sync::RwLock<TerminalState>>)>> =
    Mutex::new(Vec::new());
static NEXT_TERMINAL_ID: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
static REAPER_STARTED: std::sync::Once = std::sync::Once::new();

/// Grace period a terminal may sit with zero attached viewers before it is
/// considered abandoned and reaped. Generous on purpose: a terminal running an
/// unattended long job (e.g. an update script with no viewer tab open) must
/// not be killed prematurely.
const REAP_GRACE: std::time::Duration = std::time::Duration::from_secs(60 * 60);
const REAP_SWEEP_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

fn ensure_reaper_started() {
    REAPER_STARTED.call_once(|| {
        tokio::spawn(reaper_loop());
    });
}

async fn reaper_loop() {
    loop {
        tokio::time::sleep(REAP_SWEEP_INTERVAL).await;

        let snapshot: Vec<(String, std::sync::Arc<std::sync::RwLock<TerminalState>>)> = {
            let terminals = TERMINALS.lock().unwrap();
            terminals.clone()
        };

        let now = std::time::Instant::now();
        let mut to_reap: Vec<String> = Vec::new();

        for (pts, state_arc) in snapshot {
            let viewers = {
                let state = state_arc.read().unwrap();
                state
                    .broadcast_tx
                    .as_ref()
                    .map(|tx| tx.receiver_count())
                    .unwrap_or(0)
            };

            if viewers > 0 {
                let mut state = state_arc.write().unwrap();
                state.zero_viewers_since = None;
                continue;
            }

            let since = {
                let mut state = state_arc.write().unwrap();
                if state.zero_viewers_since.is_none() {
                    state.zero_viewers_since = Some(now);
                }
                state.zero_viewers_since.unwrap()
            };

            if now.duration_since(since) >= REAP_GRACE {
                to_reap.push(pts);
            }
        }

        for pts in to_reap {
            eprintln!(
                "[Terminal] reaping {} — no viewers for {:?}",
                pts, REAP_GRACE
            );
            let _ = kill_terminal(&pts);
        }
    }
}

fn find_terminal(pts: &str) -> Option<std::sync::Arc<std::sync::RwLock<TerminalState>>> {
    let terminals = TERMINALS.lock().unwrap();
    for (name, state) in terminals.iter() {
        if name == pts {
            return Some(state.clone());
        }
    }
    None
}

pub fn attach_terminal_viewer(
    pts: &str,
) -> Result<(tokio::sync::broadcast::Receiver<String>, ScrollbackBuffer), String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.read().unwrap();

    if let Some(tx) = &state.broadcast_tx {
        Ok((tx.subscribe(), state.scrollback.clone()))
    } else {
        Err("Terminal has no broadcast channel".to_string())
    }
}

pub fn get_terminal_history(pts: &str) -> Result<Vec<String>, String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.read().unwrap();
    Ok(state
        .scrollback
        .lock()
        .map(|sb| sb.clone())
        .unwrap_or_default())
}

fn spawn_reader_thread(
    pts_name: String,
    master_fd: std::os::unix::io::RawFd,
    pid: i32,
    tx: tokio::sync::broadcast::Sender<String>,
    scrollback: ScrollbackBuffer,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            unsafe {
                match libc::read(master_fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) {
                    n if n > 0 => {
                        let text = String::from_utf8_lossy(&buf[..n as usize]).to_string();
                        let _ = tx.send(text.clone());
                        let mut sb = scrollback.lock().unwrap();
                        sb.push(text);
                        while sb.len() > MAX_SCROLLBACK {
                            sb.remove(0);
                        }
                    }
                    0 => {
                        // EOF — shell process exited cleanly
                        eprintln!("[Terminal] {} EOF detected, cleaning up", pts_name);
                        drop(tx);
                        libc::close(master_fd);
                        let _ = libc::waitpid(pid, std::ptr::null_mut(), 0);
                        remove_terminal(&pts_name);
                        break;
                    }
                    _ => {
                        let err = *libc::__errno_location();
                        if err == libc::EIO {
                            // EIO — slave side closed (shell crashed/killed)
                            eprintln!("[Terminal] {} EIO detected, cleaning up", pts_name);
                            drop(tx);
                            libc::close(master_fd);
                            let _ = libc::waitpid(pid, std::ptr::null_mut(), 0);
                            remove_terminal(&pts_name);
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(10));
                    }
                }
            }
        }
    })
}

fn remove_terminal(pts: &str) {
    let mut terminals = TERMINALS.lock().unwrap();
    terminals.retain(|(name, _)| name != pts);
}

/// Spawn a shell in the given directory and return PTY info.
pub fn spawn_terminal(dir: &str) -> Result<TerminalSpawnResponse, String> {
    use nix::pty::{Winsize, openpty};
    use nix::unistd::{ForkResult, execve, fork};
    use std::os::fd::IntoRawFd;
    use std::os::unix::io::AsRawFd;

    let ws = Winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };

    match openpty(Some(&ws), None) {
        Ok(pty) => {
            // Take ownership of master fd so nix doesn't close it when pty drops.
            let master_fd = pty.master.into_raw_fd();
            let slave_fd = pty.slave.as_raw_fd();

            // Non-blocking so a read with no pending output returns EAGAIN
            // immediately instead of blocking the calling thread forever.
            // The background reader thread already tolerates EAGAIN by
            // retrying after a short sleep, and read_terminal_output()
            // relies on this to be safe to call from an async handler.
            unsafe {
                let flags = libc::fcntl(master_fd, libc::F_GETFL);
                libc::fcntl(master_fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
            }

            // Generate a unique pts identifier for this terminal session
            let pts_id = NEXT_TERMINAL_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let pts_name = format!("pts_{}", pts_id);

            let _pid = unsafe { fork().map_err(|e| format!("Fork failed: {}", e))? };

            match &_pid {
                ForkResult::Child => {
                    // Close master fd in child
                    let _ = nix::unistd::close(master_fd);

                    // Detach from any existing controlling terminal and make the
                    // pty slave the new controlling terminal, then wire it up as
                    // stdin/stdout/stderr so the shell actually reads/writes through it.
                    let _ = nix::unistd::setsid();
                    unsafe { libc::ioctl(slave_fd, libc::TIOCSCTTY, 0) };
                    let _ = nix::unistd::dup2(slave_fd, 0);
                    let _ = nix::unistd::dup2(slave_fd, 1);
                    let _ = nix::unistd::dup2(slave_fd, 2);
                    if slave_fd > 2 {
                        let _ = nix::unistd::close(slave_fd);
                    }

                    // Change directory if provided
                    if !dir.is_empty() {
                        let cdir = std::ffi::CString::new(dir)
                            .unwrap_or_else(|_| std::ffi::CString::new("").unwrap());
                        nix::unistd::chdir(cdir.as_ref()).ok();
                        drop(cdir);
                    }

                    // Execute shell
                    let shell = std::ffi::CString::new("/bin/bash")
                        .unwrap_or_else(|_| std::ffi::CString::new("").unwrap());
                    let args: Vec<std::ffi::CString> = vec![shell.clone()];
                    let env: Vec<std::ffi::CString> = std::env::vars_os()
                        .filter_map(|(k, v)| {
                            let key = k.to_string_lossy().to_string();
                            let val = v.to_string_lossy().to_string();
                            std::ffi::CString::new(format!("{}={}", key, val)).ok()
                        })
                        .collect();
                    let _ = execve(&shell, &args, &env);
                    std::process::exit(1);
                }
                ForkResult::Parent { child } => {
                    // Create broadcast channel for WebSocket viewers (capacity 1000)
                    let (broadcast_tx, _) = tokio::sync::broadcast::channel(1000);

                    // Shared scrollback buffer for history replay
                    let scrollback: ScrollbackBuffer =
                        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));

                    // Spawn background reader thread that broadcasts PTY output
                    let reader_handle = spawn_reader_thread(
                        pts_name.clone(),
                        master_fd,
                        child.as_raw(),
                        broadcast_tx.clone(),
                        scrollback.clone(),
                    );
                    eprintln!(
                        "[Terminal] spawned {} pid={} dir={}",
                        pts_name,
                        child.as_raw(),
                        dir
                    );

                    // Register terminal state for I/O operations
                    let ts = TerminalState {
                        master_fd,
                        pid: child.as_raw(),
                        broadcast_tx: Some(broadcast_tx),
                        _reader_handle: Some(reader_handle),
                        scrollback,
                        zero_viewers_since: Some(std::time::Instant::now()),
                    };
                    let mut terminals = TERMINALS.lock().unwrap();
                    terminals.push((
                        pts_name.clone(),
                        std::sync::Arc::new(std::sync::RwLock::new(ts)),
                    ));
                    drop(terminals);
                    ensure_reaper_started();
                    Ok(TerminalSpawnResponse {
                        pid: child.as_raw(),
                        pts_name,
                    })
                }
            }
        }
        Err(e) => Err(format!("PTY open failed: {}", e)),
    }
}

pub fn read_terminal_output(pts: &str, _offset: i64) -> Result<String, String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.read().unwrap();
    let fd = state.master_fd;

    // Read all available data from PTY using libc::read (non-blocking via O_NONBLOCK)
    let mut buf = [0u8; 4096];
    unsafe {
        match libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) {
            n if n > 0 => {
                // Convert to string, handling ANSI escape sequences
                let text = String::from_utf8_lossy(&buf[..n as usize]).to_string();
                Ok(text)
            }
            _ => Ok(String::new()),
        }
    }
}

pub fn write_terminal_input(pts: &str, input: &str) -> Result<(), String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.write().unwrap();
    let fd = state.master_fd;

    unsafe {
        let ret = libc::write(fd, input.as_ptr() as *const libc::c_void, input.len());
        if ret >= 0 {
            Ok(())
        } else {
            Err(format!("Write error: {}", std::io::Error::last_os_error()))
        }
    }
}

pub fn resize_terminal(pts: &str, rows: u16, cols: u16) -> Result<(), String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.read().unwrap();
    let fd = state.master_fd;

    // Build TIOCSWINSZ ioctl command using libc
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };

    unsafe {
        match libc::ioctl(fd, libc::TIOCSWINSZ, &ws) {
            0 => Ok(()),
            _ => Err(format!("Resize failed (ioctl returned non-zero)")),
        }
    }
}

pub fn kill_terminal(pts: &str) -> Result<(), String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.write().unwrap();
    let pid = state.pid;
    eprintln!("[Terminal] killing {} pid={}", pts, pid);
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
    drop(state);
    // Wait for process to exit, then escalate to SIGKILL if needed
    std::thread::sleep(std::time::Duration::from_millis(500));
    unsafe {
        if libc::kill(pid, 0) == 0 {
            eprintln!("[Terminal] {} still alive, sending SIGKILL", pts);
            libc::kill(pid, libc::SIGKILL);
        }
    }
    // Remove from registry — reader thread will clean up fd on EOF/EIO
    remove_terminal(pts);
    Ok(())
}

// ─── Request Types ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCommandRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCommandRequest {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteCommandRequest {
    pub id: String,
}

#[derive(Deserialize)]
pub struct TerminalOutputQuery {
    pub pts: String,
    #[serde(default)]
    pub offset: Option<i64>,
}
