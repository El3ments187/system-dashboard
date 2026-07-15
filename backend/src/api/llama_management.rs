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
        } else {
            ref_path.strip_prefix("refs/tags/").map(|b| b.to_string())
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

pub fn run_version_cmd(dir: &str, cmd: &str) -> Option<String> {
    if cmd.trim().is_empty() {
        return None;
    }
    let output = std::process::Command::new("sh")
        .args(["-c", cmd])
        .current_dir(dir)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

pub fn get_repo_version(dir: &str) -> Option<String> {
    let describe = std::process::Command::new("git")
        .args(["describe", "--always", "--dirty"])
        .current_dir(dir)
        .output()
        .ok();
    if let Some(out) = describe
        && out.status.success()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
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
    if let Ok(content) = fs::read_to_string(&path)
        && let Ok(data) = serde_json::from_str::<CommandsFile>(&content)
    {
        return data.commands;
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

const MAX_SCROLLBACK_BYTES: usize = 4 * 1024 * 1024;

pub struct Scrollback {
    chunks: std::collections::VecDeque<(usize, String)>,
    bytes: usize,
    start: usize,
    next: usize,
}

impl Default for Scrollback {
    fn default() -> Self {
        Self::new()
    }
}

impl Scrollback {
    pub fn new() -> Self {
        Scrollback {
            chunks: std::collections::VecDeque::new(),
            bytes: 0,
            start: 0,
            next: 0,
        }
    }

    pub fn push(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        let abs_start = self.next;
        self.next += text.len();
        self.bytes += text.len();
        self.chunks.push_back((abs_start, text.to_string()));
        while self.bytes > MAX_SCROLLBACK_BYTES {
            if let Some((_, chunk)) = self.chunks.pop_front() {
                let len = chunk.len();
                self.bytes -= len;
                self.start += len;
            } else {
                break;
            }
        }
    }

    pub fn read_from(&self, offset: usize) -> (String, usize) {
        let next = self.next;
        if offset >= next {
            return (String::new(), next);
        }
        let effective = offset.max(self.start);
        let mut result = String::new();
        for (abs_start, chunk) in &self.chunks {
            let chunk_end = abs_start + chunk.len();
            if chunk_end <= effective {
                continue;
            }
            if *abs_start >= effective {
                result.push_str(chunk);
            } else {
                let rel = effective - abs_start;
                if let Some(s) = chunk.get(rel..) {
                    result.push_str(s);
                }
            }
        }
        (result, next)
    }

    pub fn start_offset(&self) -> usize {
        self.start
    }

    pub fn history(&self) -> Vec<String> {
        self.chunks.iter().map(|(_, s)| s.clone()).collect()
    }
}

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

type ScrollbackBuffer = std::sync::Arc<std::sync::Mutex<Scrollback>>;

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
        .map(|sb| sb.history())
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
                        sb.push(&text);
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
                        std::sync::Arc::new(std::sync::Mutex::new(Scrollback::new()));

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

pub fn read_terminal_output(pts: &str, offset: i64) -> Result<(String, usize), String> {
    let guard = find_terminal(pts).ok_or("Terminal not found")?;
    let state = guard.read().unwrap();
    let sb = state.scrollback.lock().unwrap();
    let abs_offset = if offset < 0 { 0usize } else { offset as usize };
    Ok(sb.read_from(abs_offset))
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
            _ => Err("Resize failed (ioctl returned non-zero)".to_string()),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_from_empty_returns_empty_at_zero() {
        let sb = Scrollback::new();
        assert_eq!(sb.read_from(0), (String::new(), 0));
    }

    #[test]
    fn push_two_chunks_read_all_from_zero() {
        let mut sb = Scrollback::new();
        sb.push("a");
        sb.push("b");
        let (text, next) = sb.read_from(0);
        assert_eq!(text, "ab");
        assert_eq!(next, 2);
    }

    #[test]
    fn no_duplication_read_at_next_offset() {
        let mut sb = Scrollback::new();
        sb.push("a");
        sb.push("b");
        let (_, next) = sb.read_from(0);
        let (text2, next2) = sb.read_from(next);
        assert_eq!(text2, String::new());
        assert_eq!(next2, next);
    }

    #[test]
    fn delta_only_after_push() {
        let mut sb = Scrollback::new();
        sb.push("a");
        sb.push("b");
        let (_, prev_next) = sb.read_from(0);
        sb.push("c");
        let (text, next) = sb.read_from(prev_next);
        assert_eq!(text, "c");
        assert_eq!(next, 3);
    }

    #[test]
    fn byte_cap_trim_and_start_offset_advances_exactly() {
        let mut sb = Scrollback::new();
        let chunk = "x".repeat(1024 * 1024); // 1 MB
        for _ in 0..5 {
            sb.push(&chunk);
        }
        assert!(sb.bytes <= MAX_SCROLLBACK_BYTES);
        // start + retained bytes == total bytes ever written
        assert_eq!(sb.start + sb.bytes, sb.next);
        assert!(sb.start > 0, "oldest chunks should have been dropped");
    }

    #[test]
    fn resync_below_floor_no_panic_and_monotonic() {
        let mut sb = Scrollback::new();
        let chunk = "x".repeat(1024 * 1024);
        for _ in 0..5 {
            sb.push(&chunk);
        }
        let floor = sb.start_offset();
        assert!(floor > 0);
        // Requesting from before the floor must not panic and must return data
        let (text, next) = sb.read_from(0);
        assert!(!text.is_empty());
        // next_offset must be at least as large as floor
        assert!(next >= floor);
    }

    #[test]
    fn multibyte_utf8_no_panic_and_roundtrip() {
        let mut sb = Scrollback::new();
        let s = "héllo→";
        sb.push(s);
        let (text, next) = sb.read_from(0);
        assert_eq!(text, s);
        assert_eq!(next, s.len()); // byte length
        let (empty, _) = sb.read_from(next);
        assert_eq!(empty, String::new());
    }

    #[test]
    fn monotonic_offsets_across_trim() {
        let mut sb = Scrollback::new();
        let chunk = "x".repeat(1024 * 1024);
        let mut last_next = 0usize;
        for _ in 0..6 {
            sb.push(&chunk);
            let (_, next) = sb.read_from(last_next);
            assert!(next >= last_next, "next_offset went backwards");
            last_next = next;
        }
    }

    #[test]
    fn history_returns_pushed_texts_in_order() {
        let mut sb = Scrollback::new();
        sb.push("alpha");
        sb.push("beta");
        sb.push("gamma");
        assert_eq!(sb.history(), vec!["alpha", "beta", "gamma"]);
    }

    #[test]
    fn interleaved_push_read_concatenates_to_full_stream() {
        let mut sb = Scrollback::new();
        let chunks = ["chunk1", "chunk2", "chunk3", "chunk4"];
        let mut offset = 0;
        let mut full = String::new();
        for chunk in &chunks {
            sb.push(chunk);
            let (delta, next) = sb.read_from(offset);
            full.push_str(&delta);
            offset = next;
        }
        assert_eq!(full, chunks.concat());
    }
}
