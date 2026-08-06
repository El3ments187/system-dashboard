//! Launch profile management: script scanning, parsing, process control, resource monitoring, metadata persistence.

use crate::api::log_manager::{self, LogLevel, LogLine, LogStream, classify_log_level};
use crate::models::ai::*;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use walkdir::WalkDir;

// ─── Configuration ──────────────────────────────────────────────────

/// Default profile-scan dir: env override, else $HOME-derived. Never a
/// literal user path — the app must work on any machine unchanged.
fn default_scan_dir() -> PathBuf {
    if let Ok(d) = std::env::var("MODEL_DECK_SCAN_DIR") {
        return PathBuf::from(d);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    PathBuf::from(home).join("Documents/AI/Start_Scripts")
}
const METADATA_FILE: &str = ".opencode/profile_metadata.json";

fn metadata_file_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/tmp"));
    base.join(METADATA_FILE)
}

// ─── State ──────────────────────────────────────────────────────────

pub struct LauncherState {
    pub profiles: Vec<LaunchProfile>,
    pub states: HashMap<String, ProfileState>,
    pub metadata: HashMap<String, ProfileMetadata>,
    scan_dir: String,
    running_script: Option<String>,
}

static LAUNCHER_STATE: RwLock<Option<std::sync::Arc<RwLock<LauncherState>>>> = RwLock::new(None);

pub fn get_state() -> std::sync::Arc<RwLock<LauncherState>> {
    let guard = LAUNCHER_STATE.read().unwrap();
    if let Some(arc) = guard.as_ref() {
        return arc.clone();
    }
    drop(guard);
    let mut outer = LAUNCHER_STATE.write().unwrap();
    if let Some(arc) = outer.as_ref() {
        return arc.clone();
    }
    let state = LauncherState {
        profiles: Vec::new(),
        states: HashMap::new(),
        metadata: HashMap::new(),
        scan_dir: default_scan_dir().to_string_lossy().into_owned(),
        running_script: None,
    };
    let arc = std::sync::Arc::new(RwLock::new(state));
    *outer = Some(arc.clone());
    arc
}

pub fn update_scan_dir(dir: &str) {
    let state = get_state();
    let mut guard = state.write().unwrap();
    guard.scan_dir = dir.to_string();
}

pub fn get_running_script() -> Option<String> {
    let state = get_state();
    let guard = state.read().unwrap();
    guard.running_script.clone()
}

// ─── Script Scanner ─────────────────────────────────────────────────

pub fn scan_scripts(dir: &str) -> Vec<LaunchProfile> {
    let dir_path = PathBuf::from(dir);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Vec::new();
    }

    let mut profiles = Vec::new();

    for entry in WalkDir::new(&dir_path)
        .follow_links(true)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() || path.extension().is_none_or(|ext| ext != "sh") {
            continue;
        }

        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let file_name = abs_path
            .file_stem()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();
        let script_path = abs_path.to_string_lossy().to_string();

        // Compute a simple hash of the file content to detect changes
        let file_hash = compute_file_hash(&abs_path);

        // Parse arguments from the script
        let parsed_args = parse_script_content(&script_path);

        // Extract metadata from filename
        let filename_meta = extract_filename_metadata(&file_name);

        profiles.push(LaunchProfile {
            id: format!("profile_{}", hash_string(&script_path)),
            name: file_name.to_string(),
            script_path,
            file_hash,
            parsed_args,
            filename_meta,
            warning: None,
        });
    }

    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    profiles
}

fn compute_file_hash(path: &Path) -> String {
    let content = fs::read_to_string(path).unwrap_or_default();
    hash_string(&content)
}

fn hash_string(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let result = hasher.finalize();
    // Convert first 8 bytes to hex string manually
    result[..8].iter().map(|b| format!("{:02x}", b)).collect()
}

// ─── Script Parser ──────────────────────────────────────────────────

pub fn parse_script_content(script_path: &str) -> Option<ParsedScriptArgs> {
    let content = fs::read_to_string(script_path).ok()?;
    parse_script_args(&content)
}

pub fn parse_script_args(content: &str) -> Option<ParsedScriptArgs> {
    // Find the llama-server command line within the script
    // Look for lines containing "llama-server" and extract arguments
    let server_line = find_llama_server_command(content)?;
    let tokens = tokenize_shell_line(&server_line);
    let vars = extract_shell_variables(content);

    let mut args = ParsedScriptArgs::default();

    // Model path: -m / --model / --hf-file
    if let Some(val) = token_value(&tokens, &["-m", "--model", "--hf-file"]) {
        args.model_path = Some(resolve_shell_variables(&val, &vars));
    }

    if let Some(val) = token_value(&tokens, &["--alias"]) {
        args.alias = Some(val);
    }

    // Context size: -c / --ctx-size (also accepts --ctx-size=N via token_value)
    if let Some(val) = token_numeric(&tokens, &["-c", "--ctx-size"]) {
        args.context_size = Some(val as u32);
    }

    if let Some(val) = token_numeric(&tokens, &["--port"]) {
        args.port = Some(val as u16);
    }

    if let Some(val) = token_value(&tokens, &["--host"]) {
        args.host = Some(val);
    }

    if let Some(val) = token_numeric(&tokens, &["-b", "--batch-size"]) {
        args.batch_size = Some(val as u32);
    }

    if let Some(val) = token_numeric(&tokens, &["-ub", "--ubatch-size"]) {
        args.ubatch_size = Some(val as u32);
    }

    if let Some(val) = token_numeric(&tokens, &["--parallel", "-np"]) {
        args.parallel = Some(val as u32);
    }

    if let Some(val) = token_numeric(&tokens, &["--cache-reuse"]) {
        args.cache_reuse = Some(val as u32);
    }

    if let Some(val) = token_value(&tokens, &["--flash-attn", "-fa"]) {
        args.flash_attn = Some(val);
    }

    if let Some(val) = token_numeric(&tokens, &["-t", "--threads"]) {
        args.threads = Some(val as u32);
    }

    if let Some(val) = token_float(&tokens, &["--temp"]) {
        args.temperature = Some(val);
    }

    if let Some(val) = token_float(&tokens, &["--top-p"]) {
        args.top_p = Some(val);
    }

    if let Some(val) = token_numeric(&tokens, &["--top-k"]) {
        args.top_k = Some(val as i32);
    }

    if let Some(val) = token_float(&tokens, &["--repeat-penalty"]) {
        args.repeat_penalty = Some(val);
    }

    if let Some(val) = token_float(&tokens, &["--min-p"]) {
        args.min_p = Some(val);
    }

    if let Some(val) = token_float(&tokens, &["--presence-penalty"]) {
        args.presence_penalty = Some(val);
    }

    if let Some(val) = token_value(&tokens, &["--cache-type-k", "-ctk"]) {
        args.cache_type_k = Some(val);
    }

    if let Some(val) = token_value(&tokens, &["--cache-type-v", "-ctv"]) {
        args.cache_type_v = Some(val);
    }

    if let Some(val) = token_value(&tokens, &["--spec-type"]) {
        args.spec_type = Some(val);
    }

    if let Some(val) = token_numeric(&tokens, &["--spec-draft-n-max"]) {
        args.spec_draft_n_max = Some(val as u32);
    }

    if let Some(val) = token_value(&tokens, &["--model-draft", "-md"]) {
        args.model_draft = Some(resolve_shell_variables(&val, &vars));
    }

    if let Some(val) = token_value(&tokens, &["--mmproj"]) {
        args.mmproj = Some(resolve_shell_variables(&val, &vars));
    }

    Some(args)
}

/// Split a (possibly multi-flag) shell command line into whitespace-separated
/// tokens, treating `"..."` and `'...'` as single tokens with quotes removed.
/// This avoids the substring-collision bugs of naive `str::find` matching
/// (e.g. flag `-m` falsely matching inside `--mmproj`) and naturally supports
/// `--flag=value` tokens, which are split out by the caller.
fn tokenize_shell_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_token = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' | '\'' => {
                in_token = true;
                let quote = c;
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if nc == quote {
                        break;
                    }
                    current.push(nc);
                }
            }
            c if c.is_whitespace() => {
                if in_token {
                    tokens.push(std::mem::take(&mut current));
                    in_token = false;
                }
            }
            c => {
                in_token = true;
                current.push(c);
            }
        }
    }
    if in_token {
        tokens.push(current);
    }
    tokens
}

/// Look up the value following any of `flags` in a tokenized command line.
/// Supports both `--flag value` (separate tokens) and `--flag=value` forms.
fn token_value(tokens: &[String], flags: &[&str]) -> Option<String> {
    for (i, tok) in tokens.iter().enumerate() {
        for &flag in flags {
            if tok == flag {
                return tokens.get(i + 1).cloned();
            }
            if let Some(val) = tok.strip_prefix(&format!("{}=", flag)) {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn token_numeric(tokens: &[String], flags: &[&str]) -> Option<i64> {
    token_value(tokens, flags)?.parse().ok()
}

fn token_float(tokens: &[String], flags: &[&str]) -> Option<f64> {
    token_value(tokens, flags)?.parse().ok()
}

/// Collect simple `NAME=value` / `export NAME=value` shell variable
/// assignments from anywhere in the script (typically defined before the
/// llama-server invocation), so values like `-m "$MODEL"` can be resolved.
fn extract_shell_variables(content: &str) -> HashMap<String, String> {
    let mut vars = HashMap::new();
    for raw_line in content.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let trimmed = trimmed
            .strip_prefix("export ")
            .unwrap_or(trimmed)
            .trim_start();
        let Some(eq_pos) = trimmed.find('=') else {
            continue;
        };
        let name = &trimmed[..eq_pos];
        let valid_name = !name.is_empty()
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            && name
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
        if !valid_name {
            continue;
        }
        let raw_value = trimmed[eq_pos + 1..].trim();
        let value =
            if let Some(quote) = raw_value.chars().next().filter(|c| *c == '"' || *c == '\'') {
                raw_value[1..].split(quote).next().unwrap_or("").to_string()
            } else {
                raw_value.split('#').next().unwrap_or("").trim().to_string()
            };
        vars.insert(name.to_string(), value);
    }
    vars
}

/// Substitute `$NAME` / `${NAME}` references using previously-collected
/// shell variables. Longer names are substituted first to avoid partial
/// matches (e.g. `$MODEL` inside `$MODEL_DRAFT`).
fn resolve_shell_variables(value: &str, vars: &HashMap<String, String>) -> String {
    let mut entries: Vec<(&String, &String)> = vars.iter().collect();
    entries.sort_by_key(|(name, _)| std::cmp::Reverse(name.len()));
    let mut result = value.to_string();
    for (name, val) in entries {
        result = result.replace(&format!("${{{}}}", name), val);
        result = result.replace(&format!("${}", name), val);
    }
    result
}

fn find_llama_server_command(content: &str) -> Option<String> {
    // Find the line(s) containing llama-server command
    let mut result = String::new();
    let mut found_server = false;

    for line in content.lines() {
        // Skip full-line comments entirely (including commented-out flags
        // mixed into a multi-line continuation block).
        if line.trim_start().starts_with('#') {
            continue;
        }
        // Only trigger on the line that actually *invokes* llama-server (its
        // first word is `llama-server` or a path ending in `/llama-server`),
        // not any line that merely mentions the string elsewhere (e.g.
        // `echo 'no llama-server here'`).
        if !found_server {
            let mut words = line.split_whitespace();
            let first_word = words.next().unwrap_or("");
            let second_word = words.next().unwrap_or("");
            let is_server = first_word == "llama-server"
                || first_word.ends_with("/llama-server")
                // headless: `exec /path/to/llama-server \`
                || (first_word == "exec"
                    && (second_word == "llama-server"
                        || second_word.ends_with("/llama-server")));
            if is_server {
                found_server = true;
            }
        }
        if found_server {
            // Remove leading whitespace and continuation backslash-newline
            let trimmed = line.trim();
            // Strip leading `exec ` so the tokenizer only sees the server path + args
            let trimmed = trimmed.strip_prefix("exec ").unwrap_or(trimmed);
            let continues = trimmed.ends_with('\\');
            let cleaned = if continues {
                trimmed[..trimmed.len() - 1].trim_end().to_string()
            } else {
                trimmed.to_string()
            };
            result.push_str(&cleaned);
            result.push(' ');

            // A line without a trailing continuation backslash ends the command.
            if !continues {
                break;
            }
        }
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

// ─── Filename Metadata Extraction ───────────────────────────────────

pub fn extract_filename_metadata(filename: &str) -> Option<FilenameMetadata> {
    // Remove .sh extension
    let name = filename.strip_suffix(".sh").unwrap_or(filename);

    // Try to parse patterns like "Qwen3.6-27B-MTP" or "Gemma-4-26B-A4B-qat"
    // Split by hyphens and try to identify components
    let parts: Vec<&str> = name.split('-').collect();

    if parts.is_empty() {
        return None;
    }

    let mut family = None;
    let mut params = None;
    let mut quant = None;
    let mut variant = None;

    // First part is typically the model family (e.g., "Qwen3.6", "Gemma-4")
    // Handle cases like "Qwopus" or "Gemma-4" where family might span parts
    if let Some(first) = parts.first() {
        // Check if first part contains a number (model version indicator)
        if first.chars().any(|c| c.is_ascii_digit()) {
            family = Some(first.to_string());
        } else if parts.len() > 1 && parts[1].chars().any(|c| c.is_ascii_digit()) {
            // Handle "Gemma-4" as a single family name
            family = Some(format!("{}-{}", first, parts[1]));
        }
    }

    // Look for parameter indicators (e.g., "27B", "35B", "9b", "700M", "A3B").
    // Two-pass: plain size tokens first; A-prefix MoE tokens (A3B) only as fallback.
    let mut params_idx: Option<usize> = None;
    for (i, part) in parts.iter().enumerate() {
        let upper = part.to_ascii_uppercase();
        if is_params_token(part) && !upper.starts_with('A') {
            params = Some(part.to_string());
            params_idx = Some(i);
            break;
        }
    }
    if params.is_none() {
        for (i, part) in parts.iter().enumerate() {
            if is_params_token(part) {
                params = Some(part.to_string());
                params_idx = Some(i);
                break;
            }
        }
    }

    // Look for quantization indicators, preserving the full token (e.g.
    // "Q4_K_M", "Q5_K_S", "IQ4_XS", "MXFP4", "Q4", "qat") rather than just a
    // truncated prefix.
    let mut quant_idx: Option<usize> = None;
    for (i, part) in parts.iter().enumerate() {
        if is_quant_token(part) {
            quant = Some(part.to_string());
            quant_idx = Some(i);
            break;
        }
    }

    // Remaining parts are variant indicators (e.g., "MTP", "NEO", "REAM-Compact"),
    // excluding whichever parts were already classified as params or quant tokens.
    let remaining: Vec<&str> = parts
        .iter()
        .enumerate()
        .skip(2)
        .filter(|(i, _)| quant_idx != Some(*i) && params_idx != Some(*i))
        .map(|(_, p)| *p)
        .collect();

    if !remaining.is_empty() {
        variant = Some(remaining.join("-"));
    }

    if family.is_some() || params.is_some() || quant.is_some() || variant.is_some() {
        Some(FilenameMetadata {
            family,
            params,
            quant,
            variant,
        })
    } else {
        None
    }
}

/// Matches GGUF-style quantization tokens such as `Q4_K_M`, `Q5_K_S`, `Q8_0`,
/// `IQ4_XS`, `MXFP4`, or the bare short forms `Q4`/`Q5`, plus the fixed-point
/// labels `FP16`/`BF16`/`INT8`/`qat`.
fn is_quant_token(token: &str) -> bool {
    let upper = token.to_ascii_uppercase();
    if upper == "FP16" || upper == "BF16" || upper == "INT8" || upper == "QAT" {
        return true;
    }
    let rest = if let Some(r) = upper.strip_prefix("MXFP") {
        return !r.is_empty() && r.chars().all(|c| c.is_ascii_digit());
    } else if let Some(r) = upper.strip_prefix("IQ") {
        r
    } else if let Some(r) = upper.strip_prefix('Q') {
        r
    } else {
        return false;
    };

    let digit_count = rest.chars().take_while(|c| c.is_ascii_digit()).count();
    if digit_count == 0 {
        return false;
    }
    let after_digits = &rest[digit_count..];
    after_digits.is_empty()
        || (after_digits.starts_with('_')
            && after_digits.len() > 1
            && after_digits[1..]
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_'))
}

/// A params token is a SIZE SHAPE — optional MoE 'A' prefix, digits,
/// optional decimal, then B or M: 27B, 1.5B, 700M, 9b, A3B. Never a mere
/// B-containing word (the "Bonsai" bug).
fn is_params_token(s: &str) -> bool {
    let core = s.strip_prefix(['A', 'a']).unwrap_or(s);
    let Some(last) = core.chars().last() else {
        return false;
    };
    if !matches!(last, 'B' | 'b' | 'M' | 'm') {
        return false;
    }
    let digits = &core[..core.len() - 1];
    !digits.is_empty()
        && digits.chars().all(|c| c.is_ascii_digit() || c == '.')
        && digits.chars().any(|c| c.is_ascii_digit())
}

// ─── Process Manager ────────────────────────────────────────────────

pub fn launch_profile(script_path: &str) -> Result<Value, String> {
    eprintln!(
        "[Launcher] launch_profile request received for {}",
        script_path
    );

    // Check if the script exists and is executable before doing anything else.
    let script_p = PathBuf::from(script_path);
    if !script_p.exists() {
        eprintln!("[Launcher] Script not found: {}", script_path);
        return Err(format!("Script not found: {}", script_path));
    }

    // The script is run as `bash <path>`, so only read permission is required.
    if let Err(e) = fs::metadata(&script_p)
        .and_then(|_| fs::File::open(&script_p))
        .map(|_| ())
    {
        eprintln!("[Launcher] Cannot read script {}: {}", script_path, e);
        return Err(format!("Permission denied: {}", e));
    }

    // Snapshot the currently running script (read lock, released immediately) so
    // we never hold a lock across the stop/spawn work below.
    let currently_running = {
        let state = get_state();
        let guard = state.read().unwrap();
        guard.running_script.clone()
    };

    // Set status to "starting" synchronously before spawning, so the next
    // poll from the frontend immediately sees "starting" instead of "stopped".
    let script_str = script_path.to_string();
    {
        let state = get_state();
        let mut guard = state.write().unwrap();
        guard.states.insert(
            script_str.clone(),
            ProfileState {
                status: "starting".to_string(),
                llama_server_pid: None,
                start_time: Some(chrono::Utc::now().to_rfc3339()),
                peak_vram_mb: None,
                peak_ram_mb: None,
                current_tps: None,
            },
        );
    }

    // Execute the script in background (non-blocking). Stopping any previously
    // running profile also happens here so the HTTP response is never delayed
    // by graceful-shutdown waits or process startup.
    tokio::spawn(async move {
        if let Some(running) = currently_running
            && running != script_str
        {
            eprintln!("[Launcher] Stopping existing profile: {}", running);
            let running_clone = running.clone();
            let stop_result =
                tokio::task::spawn_blocking(move || stop_profile_internal(&running_clone)).await;
            match stop_result {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => {
                    eprintln!(
                        "[Launcher] Failed to stop existing profile {}: {}",
                        running, e
                    )
                }
                Err(e) => eprintln!("[Launcher] Stop task panicked for {}: {}", running, e),
            }
        }

        // Clear previous logs for this profile and add a launch marker so the
        // console panel always shows context for the current run.
        {
            let log_mgr = log_manager::get_log_manager();
            log_mgr.clear(&script_str);
            crate::api::gpu_offload_parser::clear(&script_str);
            crate::api::startup_info::clear(&script_str);
            crate::api::startup_info::on_load_start(&script_str);
            log_mgr.add_line(
                &script_str,
                LogLine {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    stream: LogStream::Stdout,
                    level: LogLevel::Info,
                    text: format!("[Dashboard] Launching: {}", script_str),
                },
            );
        }
        eprintln!("[Launcher] Spawning script: {}", script_str);
        match execute_script(&script_str).await {
            Ok(pid) => {
                eprintln!("[Launcher] Script {} launched with PID {}", script_str, pid);
                let state = get_state();
                let mut guard = state.write().unwrap();
                guard.states.insert(
                    script_str.clone(),
                    ProfileState {
                        status: "loading".to_string(),
                        llama_server_pid: Some(pid),
                        start_time: Some(chrono::Utc::now().to_rfc3339()),
                        peak_vram_mb: None,
                        peak_ram_mb: None,
                        current_tps: None,
                    },
                );
                guard.running_script = Some(script_str.clone());

                // Spawn health check task to monitor model startup
                let script_path_for_health = script_str.clone();
                tokio::spawn(async move {
                    wait_for_model_ready(&script_path_for_health).await;
                });

                // Update metadata with run count
                if let Some(meta) = guard.metadata.get_mut(&script_str) {
                    meta.run_count += 1;
                    meta.last_run_date = Some(chrono::Utc::now().to_rfc3339());
                    meta.last_startup_time_ms = Some(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as f64,
                    );
                } else {
                    guard.metadata.insert(
                        script_str.clone(),
                        ProfileMetadata {
                            script_path: script_str,
                            model_path: None,
                            peak_vram_mb: None,
                            peak_ram_mb: None,
                            avg_gen_tps: None,
                            peak_gen_tps: None,
                            last_context_size: None,
                            last_run_date: Some(chrono::Utc::now().to_rfc3339()),
                            run_count: 1,
                            last_startup_time_ms: Some(
                                std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis() as f64,
                            ),
                        },
                    );
                }

                save_metadata(&guard.metadata);
            }
            Err(e) => {
                eprintln!("[Launcher] Failed to launch {}: {}", script_str, e);
                {
                    let log_mgr = log_manager::get_log_manager();
                    log_mgr.add_line(
                        &script_str,
                        LogLine {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            stream: LogStream::Stderr,
                            level: LogLevel::Error,
                            text: format!("[Dashboard] Failed to launch script: {}", e),
                        },
                    );
                    log_mgr.set_process_exited(&script_str);
                }
                let _state = get_state();
                let mut guard = _state.write().unwrap();
                guard.states.insert(
                    script_str.clone(),
                    ProfileState {
                        status: "failed".to_string(),
                        llama_server_pid: None,
                        start_time: Some(chrono::Utc::now().to_rfc3339()),
                        peak_vram_mb: None,
                        peak_ram_mb: None,
                        current_tps: None,
                    },
                );
            }
        }
    });

    eprintln!(
        "[Launcher] launch_profile returning immediately for {}",
        script_path
    );
    Ok(json!({ "success": true, "message": "Model launch initiated" }))
}

async fn execute_script(script_path: &str) -> Result<u32, String> {
    let script_dir = Path::new(script_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("/tmp"));

    let mut child = tokio::process::Command::new("bash")
        .current_dir(&script_dir)
        .arg(script_path)
        // Make the bash wrapper the leader of its own process group, so any
        // child it forks (e.g. llama-server, when the script doesn't `exec`
        // into it) inherits the same group and can be signaled together.
        .process_group(0)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn script: {}", e))?;

    let pid = child
        .id()
        .ok_or_else(|| "Process ID not available".to_string())?;

    // Take pipe handles before detaching — ChildStdout/ChildStderr are
    // independent of the Child handle, so they remain open after drop(child).
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Detach the process so it continues after we return
    drop(child);

    let log_mgr = log_manager::get_log_manager();

    // Spawn async reader for stdout — when the script uses `exec llama-server`,
    // llama-server inherits this pipe and all its output is captured here.
    if let Some(stdout_handle) = stdout {
        let path = script_path.to_string();
        let mgr = log_mgr.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout_handle).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                crate::api::gpu_offload_parser::process_line(&path, &line);
                crate::api::startup_info::process_line(&path, &line);
                let level = classify_log_level(&line);
                mgr.add_line(
                    &path,
                    LogLine {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        stream: LogStream::Stdout,
                        level,
                        text: line,
                    },
                );
            }
            mgr.set_process_exited(&path);
        });
    }

    // Spawn async reader for stderr.
    if let Some(stderr_handle) = stderr {
        let path = script_path.to_string();
        let mgr = log_mgr.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr_handle).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                crate::api::gpu_offload_parser::process_line(&path, &line);
                crate::api::startup_info::process_line(&path, &line);
                let level = classify_log_level(&line);
                mgr.add_line(
                    &path,
                    LogLine {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        stream: LogStream::Stderr,
                        level,
                        text: line,
                    },
                );
            }
        });
    }

    Ok(pid)
}

/// Polls the model's health endpoint until it responds or times out.
/// Transitions status from "loading" to "running" on success, or "failed" on timeout.
async fn wait_for_model_ready(script_path: &str) {
    let parsed_args = get_profile_parsed_args(script_path);
    let port = parsed_args.as_ref().and_then(|a| a.port);
    let host = parsed_args
        .and_then(|a| a.host)
        .unwrap_or_else(|| "127.0.0.1".to_string());

    // 60 second timeout, 1 second polling interval
    let timeout_secs = 60;
    let poll_interval = Duration::from_secs(1);
    let start = std::time::Instant::now();

    while start.elapsed().as_secs() < timeout_secs {
        tokio::time::sleep(poll_interval).await;

        // Check if process is still alive — extract owned values so the guard can be dropped.
        let (profile_status, profile_pid) = {
            let state = get_state();
            let guard = state.read().unwrap();
            let status = guard.states.get(script_path).map(|ps| ps.status.clone());
            let pid = guard
                .states
                .get(script_path)
                .and_then(|ps| ps.llama_server_pid);
            (status, pid)
        };

        // If status changed (e.g., user stopped it), exit
        match profile_status.as_deref() {
            Some(s) if s != "loading" => {
                eprintln!(
                    "[HealthCheck] {} status is no longer 'loading', exiting health check",
                    script_path
                );
                return;
            }
            None => return,
            _ => {}
        }

        // Check process liveness
        if let Some(pid) = profile_pid
            && unsafe { libc::kill(pid as i32, 0) != 0 }
        {
            // PID is dead — the bash wrapper may have exited after exec'ing the server.
            // Check if a live server is still bound to the expected port before failing.
            let still_on_port = port.is_some_and(|p| {
                let mut sys = sysinfo::System::new();
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                find_llama_server_pid_by_port(&sys, p).is_some()
            });
            if !still_on_port {
                eprintln!(
                    "[HealthCheck] PID {} for {} is no longer alive and no server on port, marking as failed",
                    pid, script_path
                );
                let state = get_state();
                let mut guard = state.write().unwrap();
                if let Some(entry) = guard.states.get_mut(script_path) {
                    entry.status = "failed".to_string();
                    entry.llama_server_pid = None;
                }
                return;
            }
            // Server is still alive on port under a different PID — continue polling.
            // The liveness check in scan_profiles will update the stored PID.
        }

        // Check health endpoint if port is available
        if let Some(p) = port {
            let health_url = format!("http://{}:{}/health", host, p);
            if let Ok(resp) = metrics_http_client().get(&health_url).send().await
                && resp.status().is_success()
            {
                eprintln!(
                    "[HealthCheck] {} health check succeeded, marking as running",
                    script_path
                );
                crate::api::startup_info::on_load_ready(script_path);
                let state = get_state();
                let mut guard = state.write().unwrap();
                if let Some(entry) = guard.states.get_mut(script_path) {
                    entry.status = "running".to_string();
                }
                return;
            }
        }
    }

    // Timeout reached - mark as failed
    eprintln!(
        "[HealthCheck] {} health check timed out after {} seconds, marking as failed",
        script_path, timeout_secs
    );
    let state = get_state();
    let mut guard = state.write().unwrap();
    if let Some(entry) = guard.states.get_mut(script_path) {
        entry.status = "failed".to_string();
    }
}

pub fn stop_profile(script_path: &str) -> Result<Value, String> {
    stop_profile_internal(script_path)
}

fn stop_profile_internal(script_path: &str) -> Result<Value, String> {
    // Snapshot the PID and release the lock immediately. graceful_shutdown
    // blocks synchronously for up to ~15s (SIGINT/SIGTERM/SIGKILL wait loop),
    // and holding a lock across that would stall every other launcher
    // request (e.g. /api/launch/profiles) for the same duration.
    let state = get_state();
    let guard = state.read().unwrap();
    let pid = guard
        .states
        .get(script_path)
        .and_then(|profile_state| profile_state.llama_server_pid);
    drop(guard);

    if let Some(pid) = pid {
        eprintln!("[Launcher] Stopping PID {} for {}", pid, script_path);
        graceful_shutdown(pid)?;
    }

    let _state = get_state();
    let mut guard = _state.write().unwrap();

    // Persist the last-known peak VRAM/RAM/TPS into metadata before they're
    // lost, so the Run Models table can still show historical figures once
    // this profile is no longer running.
    let context_size = guard
        .profiles
        .iter()
        .find(|p| p.script_path == script_path)
        .and_then(|p| p.parsed_args.as_ref())
        .and_then(|a| a.context_size);
    if let Some(last_state) = guard.states.get(script_path).cloned() {
        capture_metrics_into_metadata(&mut guard.metadata, script_path, &last_state, context_size);
    }

    // Update state
    if let Some(state_entry) = guard.states.get_mut(script_path) {
        state_entry.status = "stopped".to_string();
        state_entry.llama_server_pid = None;
    } else {
        guard.states.insert(
            script_path.to_string(),
            ProfileState {
                status: "stopped".to_string(),
                llama_server_pid: None,
                start_time: None,
                peak_vram_mb: None,
                peak_ram_mb: None,
                current_tps: None,
            },
        );
    }

    guard.running_script = None;
    save_metadata(&guard.metadata);
    crate::api::gpu_offload_parser::clear(script_path);
    crate::api::startup_info::clear(script_path);

    Ok(json!({ "success": true }))
}

fn graceful_shutdown(pid: u32) -> Result<(), String> {
    use std::time::Duration;

    let ipid = pid as i32;
    // Use the actual PGID so the signal reaches processes that are not their
    // own group leader (e.g. llama-server launched by a bash wrapper).
    // Also send directly to the PID as a fallback.
    let pgid = unsafe { libc::getpgid(ipid) };
    let group_target = if pgid > 0 { -pgid } else { -ipid };

    // SIGINT first (graceful shutdown) — both to the group and the PID directly.
    unsafe {
        libc::kill(group_target, libc::SIGINT);
        libc::kill(ipid, libc::SIGINT);
    }

    // Wait 10 seconds for graceful exit
    if !wait_for_exit(pid, Duration::from_secs(10)) {
        eprintln!(
            "[Launcher] PID {} didn't exit gracefully, sending SIGTERM",
            pid
        );
        unsafe {
            libc::kill(group_target, libc::SIGTERM);
            libc::kill(ipid, libc::SIGTERM);
        }

        // Wait 5 seconds for SIGTERM
        if !wait_for_exit(pid, Duration::from_secs(5)) {
            eprintln!(
                "[Launcher] PID {} didn't exit after SIGTERM, sending SIGKILL",
                pid
            );
            unsafe {
                libc::kill(group_target, libc::SIGKILL);
                libc::kill(ipid, libc::SIGKILL);
            }
            // Wait a bit for SIGKILL to take effect
            std::thread::sleep(Duration::from_millis(500));
        }
    }

    Ok(())
}

fn wait_for_exit(pid: u32, timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        unsafe {
            if libc::kill(pid as i32, 0) != 0 {
                // Process no longer exists (errno is ESRCH or EPERM depending on OS)
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

// ─── Resource Monitoring ────────────────────────────────────────────

pub fn update_profile_metrics(script_path: &str, metrics: ProfileState) {
    let state = get_state();
    let mut guard = state.write().unwrap();
    if let Some(existing) = guard.states.get_mut(script_path) {
        // next_peak_mb (max) — see its doc comment: .or() here was
        // last-sample-wins, which is not a peak and let one early/bad
        // sample define a whole run.
        existing.peak_vram_mb = next_peak_mb(metrics.peak_vram_mb, existing.peak_vram_mb);
        existing.peak_ram_mb = next_peak_mb(metrics.peak_ram_mb, existing.peak_ram_mb);
        existing.current_tps = metrics.current_tps;
    }
}

pub fn find_llama_server_pid(script_path: &str) -> Option<u32> {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Get the parent bash process PID from our state
    let state = get_state();
    let guard = state.read().unwrap();

    if let Some(profile_state) = guard.states.get(script_path)
        && let Some(parent_pid) = profile_state.llama_server_pid
    {
        // Find child processes of the parent that are llama-server
        // (skip thread entries — only the main process has a real PID).
        for (pid, proc) in system.processes() {
            if proc.thread_kind().is_none()
                && let Some(ppid) = proc.parent()
                && ppid.as_u32() == parent_pid
                && let Some(exe_path) = proc.exe().as_ref().and_then(|p| p.to_str())
                && exe_path.contains("llama-server")
            {
                return Some(pid.as_u32());
            }
        }
    }

    None
}

/// Find a running llama-server process bound to `port`, regardless of its
/// process tree. Needed because some launch scripts detach llama-server into
/// an independent process (e.g. spawning it inside `gnome-terminal -- bash -c
/// '...' &`) and then exit themselves — the tracked wrapper PID dies almost
/// immediately even though the actual server keeps running. Matching by the
/// `--port` argument lets us recognize that case instead of misreporting the
/// profile as stopped.
fn find_llama_server_pid_by_port(system: &sysinfo::System, port: u16) -> Option<u32> {
    let port_str = port.to_string();
    for (pid, proc) in system.processes() {
        // Skip thread entries (sysinfo can enumerate individual threads on
        // Linux) — only the main process (thread_kind() == None) has a real,
        // independently-signalable PID.
        if proc.thread_kind().is_some() {
            continue;
        }
        let is_llama_server = proc
            .exe()
            .as_ref()
            .and_then(|p| p.to_str())
            .is_some_and(|exe| exe.contains("llama-server"));
        if !is_llama_server {
            continue;
        }
        let cmd = proc.cmd();
        let has_matching_port = cmd.iter().zip(cmd.iter().skip(1)).any(|(flag, value)| {
            flag == std::ffi::OsStr::new("--port") && value == std::ffi::OsStr::new(&port_str)
        });
        if has_matching_port {
            return Some(pid.as_u32());
        }
    }
    None
}

// ─── Metadata Persistence ───────────────────────────────────────────

pub fn load_metadata() -> HashMap<String, ProfileMetadata> {
    let path = metadata_file_path();
    if let Ok(content) = fs::read_to_string(&path)
        && let Ok(data) = serde_json::from_str::<HashMap<String, ProfileMetadata>>(&content)
    {
        return data;
    }
    HashMap::new()
}

pub fn save_metadata(metadata: &HashMap<String, ProfileMetadata>) {
    let path = metadata_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(&metadata);
    if let Ok(json_str) = json {
        fs::write(&path, json_str).ok();
    }
}

/// Fold a profile's last-known live state (peak VRAM/RAM, current TPS) into
/// its persisted metadata so the Run Models table can still show historical
/// VRAM/RAM/TPS for a script after it has stopped running.
pub fn capture_metrics_into_metadata(
    metadata: &mut HashMap<String, ProfileMetadata>,
    script_path: &str,
    last_state: &ProfileState,
    context_size: Option<u32>,
) {
    let entry = metadata
        .entry(script_path.to_string())
        .or_insert_with(|| ProfileMetadata {
            script_path: script_path.to_string(),
            model_path: None,
            peak_vram_mb: None,
            peak_ram_mb: None,
            avg_gen_tps: None,
            peak_gen_tps: None,
            last_context_size: None,
            last_run_date: None,
            run_count: 0,
            last_startup_time_ms: None,
        });

    if let Some(v) = last_state.peak_vram_mb {
        entry.peak_vram_mb = Some(entry.peak_vram_mb.map_or(v, |existing| existing.max(v)));
    }
    if let Some(v) = last_state.peak_ram_mb {
        entry.peak_ram_mb = Some(entry.peak_ram_mb.map_or(v, |existing| existing.max(v)));
    }
    if let Some(v) = last_state.current_tps {
        entry.avg_gen_tps = Some(v);
        entry.peak_gen_tps = Some(entry.peak_gen_tps.map_or(v, |existing| existing.max(v)));
    }
    if let Some(c) = context_size {
        entry.last_context_size = Some(c);
    }
}

// ─── Public API Functions ───────────────────────────────────────────

pub fn scan_profiles() -> ProfileResponse {
    let state = get_state();
    let mut guard = state.write().unwrap();

    // Load existing metadata
    guard.metadata = load_metadata();

    // Scan scripts
    let mut profiles = scan_scripts(&guard.scan_dir);

    // Update file hashes and check for changes
    for profile in &mut profiles {
        if let Some(existing_meta) = guard.metadata.get(&profile.script_path) {
            profile.file_hash.clone_from(&existing_meta.script_path);
        }
    }

    // Check each script exists, mark warnings for missing ones
    for profile in &mut profiles {
        let p = PathBuf::from(&profile.script_path);
        if !p.exists() {
            profile.warning = Some("Script file not found".to_string());
        }
    }

    // Clean up states/metadata for removed scripts
    guard
        .states
        .retain(|path, _| profiles.iter().any(|p| p.script_path == *path));
    guard
        .metadata
        .retain(|path, _| profiles.iter().any(|p| p.script_path == *path));

    // Check liveness of running processes — mark as stopped if tracked PID is gone
    let mut metadata_changed = false;
    {
        let LauncherState {
            states, metadata, ..
        } = &mut *guard;
        let mut liveness_system = sysinfo::System::new();
        liveness_system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        for (script_path, state_entry) in states.iter_mut() {
            if state_entry.status == "running"
                || state_entry.status == "loading"
                || state_entry.status == "starting"
            {
                // No PID yet means the spawn is still in progress; skip liveness check
                // to avoid immediately marking the profile as "failed".
                if state_entry.status == "starting" && state_entry.llama_server_pid.is_none() {
                    continue;
                }
                let tracked_pid_alive = state_entry
                    .llama_server_pid
                    .is_some_and(|pid| unsafe { libc::kill(pid as i32, 0) == 0 });

                let died = if tracked_pid_alive {
                    false
                } else {
                    // The tracked process (usually the launch script's bash
                    // wrapper) is gone. Some scripts detach llama-server into
                    // an independent process (e.g. a separate terminal
                    // window) and exit themselves shortly after, so check
                    // for a live llama-server bound to the expected port
                    // before concluding the profile actually stopped.
                    let port = profiles
                        .iter()
                        .find(|p| &p.script_path == script_path)
                        .and_then(|p| p.parsed_args.as_ref())
                        .and_then(|a| a.port);
                    let rediscovered =
                        port.and_then(|p| find_llama_server_pid_by_port(&liveness_system, p));
                    match rediscovered {
                        Some(real_pid) => {
                            eprintln!(
                                "[Launcher] {} wrapper process exited but llama-server (PID {}) is still running on its port",
                                script_path, real_pid
                            );
                            state_entry.llama_server_pid = Some(real_pid);
                            // Update the PID to the real server process; keep status as-is.
                            // For "loading"/"starting" profiles, wait_for_model_ready will
                            // transition to "running" once the health check succeeds.
                            false
                        }
                        None => {
                            eprintln!(
                                "[Launcher] {} for {} is no longer alive, marking stopped",
                                state_entry.llama_server_pid.map_or_else(
                                    || "PID <none>".to_string(),
                                    |p| format!("PID {}", p)
                                ),
                                script_path
                            );
                            true
                        }
                    }
                };
                if died {
                    // Use the freshly-scanned `profiles` local (guard.profiles
                    // isn't updated until after this block) to find context_size.
                    let context_size = profiles
                        .iter()
                        .find(|p| &p.script_path == script_path)
                        .and_then(|p| p.parsed_args.as_ref())
                        .and_then(|a| a.context_size);
                    capture_metrics_into_metadata(metadata, script_path, state_entry, context_size);
                    // If process died during loading/starting, mark as failed; otherwise stopped
                    if state_entry.status == "loading" || state_entry.status == "starting" {
                        state_entry.status = "failed".to_string();
                    } else {
                        state_entry.status = "stopped".to_string();
                    }
                    state_entry.llama_server_pid = None;
                    metadata_changed = true;
                }
            }
        }
    }
    if metadata_changed {
        save_metadata(&guard.metadata);
    }

    // Recover state for profiles that are inactive (no state, "stopped", or "failed") but have
    // a live llama-server on their configured port.  Handles the case where the bash wrapper
    // exits before the health check sees the server, causing a premature "stopped" mark.
    //
    // Multiple profiles may share the same port (all 8081 is common); only ONE is recovered
    // per port.  The known running_script is checked first so it takes priority.
    let mut recovery_system = sysinfo::System::new();
    recovery_system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let running_script_clone = guard.running_script.clone();
    let mut recovery_candidates: Vec<&LaunchProfile> = profiles.iter().collect();
    recovery_candidates.sort_by_key(|p| {
        if running_script_clone.as_deref() == Some(p.script_path.as_str()) {
            0u8
        } else {
            1u8
        }
    });
    // Pre-claim ports that are already held by active profiles so subsequent polls
    // don't recover a second profile onto the same port.
    let mut recovered_ports: std::collections::HashSet<u16> = std::collections::HashSet::new();
    for profile in &profiles {
        let is_active = guard.states.get(&profile.script_path).is_some_and(|s| {
            s.status == "running" || s.status == "loading" || s.status == "starting"
        });
        if is_active
            && let Some(parsed_args) = &profile.parsed_args
            && let Some(port) = parsed_args.port
        {
            recovered_ports.insert(port);
        }
    }
    for profile in &recovery_candidates {
        let is_inactive = {
            let s = guard.states.get(&profile.script_path);
            s.is_none_or(|s| s.status == "stopped" || s.status == "failed")
        };
        if is_inactive
            && let Some(parsed_args) = &profile.parsed_args
            && let Some(port) = parsed_args.port
            && !recovered_ports.contains(&port)
            && let Some(pid) = find_llama_server_pid_by_port(&recovery_system, port)
        {
            eprintln!(
                "[Launcher] Recovered running state for {} (PID {} on port {})",
                profile.script_path, pid, port
            );
            // Preserve any peak VRAM/RAM already known from BEFORE tracking
            // was lost (e.g. a Model Deck backend restart while llama-server
            // itself kept running) rather than unconditionally discarding
            // it. The unconditional insert this replaced would blank these
            // back to None on every such recovery, fighting against
            // start_metrics_updater's 2-second writes each time it fired.
            let (prior_peak_vram_mb, prior_peak_ram_mb) = guard
                .states
                .get(&profile.script_path)
                .map(|s| (s.peak_vram_mb, s.peak_ram_mb))
                .unwrap_or((None, None));
            guard.states.insert(
                profile.script_path.clone(),
                ProfileState {
                    status: "running".to_string(),
                    llama_server_pid: Some(pid),
                    start_time: None,
                    peak_vram_mb: prior_peak_vram_mb,
                    peak_ram_mb: prior_peak_ram_mb,
                    current_tps: None,
                },
            );
            guard.running_script = Some(profile.script_path.clone());
            recovered_ports.insert(port);
        }
    }

    // Sort: running first, then loading/starting, then alphabetical by name
    let mut sorted_profiles = profiles.clone();
    sorted_profiles.sort_by(|a, b| {
        let status_priority = |p: &LaunchProfile| -> u8 {
            guard
                .states
                .get(&p.script_path)
                .map_or(2, |s| match s.status.as_str() {
                    "running" => 0,
                    "loading" => 1,
                    "starting" => 1,
                    _ => 2,
                })
        };
        let a_pri = status_priority(a);
        let b_pri = status_priority(b);
        match a_pri.cmp(&b_pri) {
            std::cmp::Ordering::Equal => a.name.cmp(&b.name),
            other => other,
        }
    });

    guard.profiles = sorted_profiles;

    ProfileResponse {
        profiles: guard.profiles.clone(),
        states: guard.states.clone(),
        metadata: guard.metadata.clone(),
        scan_dir: guard.scan_dir.clone(),
    }
}

pub fn get_profile_status(script_path: &str) -> Option<ProfileState> {
    let state = get_state();
    let guard = state.read().unwrap();
    guard.states.get(script_path).cloned()
}

pub fn get_profile_parsed_args(script_path: &str) -> Option<ParsedScriptArgs> {
    let state = get_state();
    let guard = state.read().unwrap();
    let result = guard
        .profiles
        .iter()
        .find(|p| p.script_path == script_path)
        .and_then(|p| p.parsed_args.clone());
    drop(guard);
    result
}

pub fn start_metrics_updater() {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            // Scoped block so the non-Send RwLockReadGuard is dropped before
            // any `.await` point below (required for the async block itself
            // to be Send, as tokio::spawn demands).
            let running_scripts: Vec<String> = {
                let state = get_state();
                let guard = state.read().unwrap();
                guard
                    .states
                    .iter()
                    .filter(|(_, s)| s.status == "running")
                    .map(|(k, _)| k.clone())
                    .collect()
            };

            for script_path in running_scripts {
                update_profile_metrics_for_script(&script_path).await;
            }
        }
    });
}

/// Shared async HTTP client for polling llama-server's /metrics endpoint.
/// Reused across polls (rather than building a client per call) and given a
/// short timeout so an unreachable/stalled server can't block the updater.
fn metrics_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default()
    })
}

/// Pure parse of `nvidia-smi --query-compute-apps=pid,used_gpu_memory
/// --format=csv,noheader,nounits` output — extracted so the matching
/// logic is unit-testable without executing nvidia-smi (user-reported:
/// the RUN MODELS row showed 0.3 GB VRAM while nvidia-smi itself showed
/// 13,310 MiB for the same PID; every seam in this pipeline now either
/// has tests or peak-max semantics that make a bad sample harmless).
pub(crate) fn parse_compute_apps_vram_mb(pid: u32, stdout: &str) -> Option<f64> {
    for line in stdout.lines() {
        let mut parts = line.splitn(2, ',');
        if let (Some(pid_str), Some(mb_str)) = (parts.next(), parts.next())
            && let (Ok(line_pid), Ok(mb)) =
                (pid_str.trim().parse::<u32>(), mb_str.trim().parse::<f64>())
            && line_pid == pid
        {
            return Some(mb);
        }
    }
    None
}

fn query_vram_mb_for_pid(pid: u32) -> Option<f64> {
    let output = std::process::Command::new("nvidia-smi")
        .args([
            "--query-compute-apps=pid,used_gpu_memory",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    parse_compute_apps_vram_mb(pid, &String::from_utf8_lossy(&output.stdout))
}

/// TRUE peak semantics for the RUN MODELS columns: the stored value only
/// ever grows within a run (fresh runs start from None, so it resets
/// naturally per run). Plain overwrite — the previous behavior — is
/// "last sample", not a peak: an early-load reading (0.3 GB before
/// layers finish) could be what a stop persists, and a missing sample
/// tick could regress a real peak. max() makes any single bad/early/
/// missing sample harmless.
pub(crate) fn next_peak_mb(current: Option<f64>, prev: Option<f64>) -> Option<f64> {
    match (current, prev) {
        (Some(c), Some(p)) => Some(c.max(p)),
        (Some(c), None) => Some(c),
        (None, p) => p,
    }
}

async fn update_profile_metrics_for_script(script_path: &str) {
    let port = get_profile_parsed_args(script_path).and_then(|a| a.port);
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Scoped block: the RwLockReadGuard (and the &ProfileState borrowed from
    // it) must not be live across any `.await` point below, or the
    // surrounding async block loses its Send bound (required by
    // tokio::spawn). Extract only the plain, owned values we need.
    let (llama_server_pid, start_time) = {
        let state = get_state();
        let guard = state.read().unwrap();

        let Some(profile_state) = guard.states.get(script_path) else {
            return;
        };
        if profile_state.status != "running" || profile_state.llama_server_pid.is_none() {
            return;
        }

        // Check liveness before proceeding. If the tracked process (usually
        // the launch script's bash wrapper) has exited, some scripts detach
        // llama-server into an independent process (e.g. a separate
        // terminal window) and exit themselves shortly after — check for a
        // live llama-server on the expected port before concluding stopped.
        if let Some(pid) = profile_state.llama_server_pid
            && unsafe { libc::kill(pid as i32, 0) != 0 }
        {
            drop(guard);
            if let Some(real_pid) = port.and_then(|p| find_llama_server_pid_by_port(&system, p)) {
                eprintln!(
                    "[Metrics] {} wrapper process exited but llama-server (PID {}) is still running on its port",
                    script_path, real_pid
                );
                let state = get_state();
                let mut guard = state.write().unwrap();
                if let Some(entry) = guard.states.get_mut(script_path) {
                    entry.llama_server_pid = Some(real_pid);
                }
            } else {
                eprintln!(
                    "[Metrics] PID {} for {} is no longer alive",
                    pid, script_path
                );
                let state = get_state();
                let mut guard = state.write().unwrap();
                if let Some(entry) = guard.states.get_mut(script_path) {
                    entry.status = "stopped".to_string();
                    entry.llama_server_pid = None;
                }
                return;
            }

            let state = get_state();
            let guard = state.read().unwrap();
            let Some(profile_state) = guard.states.get(script_path) else {
                return;
            };
            (
                profile_state.llama_server_pid,
                profile_state.start_time.clone(),
            )
        } else {
            (
                profile_state.llama_server_pid,
                profile_state.start_time.clone(),
            )
        }
    };

    // Find the actual llama-server process by matching port from parsed_args
    // (this is the real server PID, distinct from the tracked wrapper PID).
    // FALLBACK (user-reported stale columns): if port resolution yields
    // nothing — parsed_args missing a port, or the port scan failing —
    // the previous code silently skipped this entire update every 2s
    // forever, leaving the row on stale persisted metadata from an old
    // run while the model visibly ran. The tracked llama_server_pid
    // (guaranteed Some by the guard above) is a sound fallback: worse
    // than the port-verified PID only in the orphan-process edge case,
    // strictly better than never updating at all.
    let found_llama_pid = port
        .and_then(|p| find_llama_server_pid_by_port(&system, p))
        .or(llama_server_pid);

    if let Some(llama_pid) = found_llama_pid
        && let Some(_proc) = system.process(sysinfo::Pid::from(llama_pid as usize))
    {
        // RssAnon semantics via the shared parser — NOT sysinfo's
        // proc.memory() (raw RSS). Keeps this table's RAM column on the
        // same definition as the footer/RUNTIME card, which switched to
        // private-resident (System Monitor's "Memory") after the user
        // caught raw RSS overstating a CUDA process by ~6 GB of driver
        // mappings. Same page, same word "RAM", same number.
        let peak_ram_mb = (crate::collectors::ai::process_mem_kb_from_status(
            &std::fs::read_to_string(format!("/proc/{}/status", llama_pid)).unwrap_or_default(),
        ) / 1024.0)
            .ceil();

        let mut current_tps: Option<f64> = None;

        if let Some(parsed_args) = get_profile_parsed_args(script_path)
            && let Some(port) = parsed_args.port
        {
            let host = parsed_args.host.as_deref().unwrap_or("127.0.0.1");
            let metrics_url = format!("http://{}:{}/metrics", host, port);
            if let Ok(resp) = metrics_http_client().get(&metrics_url).send().await
                && let Ok(text) = resp.text().await
            {
                for line in text.lines() {
                    if line.starts_with("llamacpp:predicted_tokens_seconds")
                        && !line.contains("#")
                        && let Ok(val) =
                            line.split_whitespace().last().unwrap_or("0").parse::<f64>()
                    {
                        current_tps = Some(val);
                    }
                }
            }
        }

        update_profile_metrics(
            script_path,
            ProfileState {
                status: "running".to_string(),
                llama_server_pid,
                start_time,
                peak_vram_mb: query_vram_mb_for_pid(llama_pid),
                peak_ram_mb: Some(peak_ram_mb),
                current_tps,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        default_scan_dir, extract_filename_metadata, graceful_shutdown, next_peak_mb,
        parse_compute_apps_vram_mb, wait_for_exit,
    };

    #[test]
    fn parse_compute_apps_finds_the_pid_line() {
        // Shape straight from the user's nvidia-smi: several G-type
        // processes plus llama-server's C-type line.
        let out = "1480, 357\n2533, 51\n83691, 13310\n";
        assert_eq!(parse_compute_apps_vram_mb(83691, out), Some(13310.0));
    }

    #[test]
    fn parse_compute_apps_none_when_pid_absent_or_garbage() {
        assert_eq!(parse_compute_apps_vram_mb(83691, "1480, 357\n"), None);
        assert_eq!(
            parse_compute_apps_vram_mb(83691, "not, csv, at all\n[N/A]\n"),
            None
        );
        assert_eq!(parse_compute_apps_vram_mb(83691, ""), None);
    }

    #[test]
    fn next_peak_only_ever_grows_within_a_run() {
        // The exact user-visible failure shape: an early-load 0.3 GB
        // sample must not survive once the real 13,310 MB arrives, and a
        // later missing/low sample must not regress the recorded peak.
        let p = next_peak_mb(Some(300.0), None);
        let p = next_peak_mb(Some(13310.0), p);
        assert_eq!(p, Some(13310.0));
        let p = next_peak_mb(None, p);
        assert_eq!(p, Some(13310.0));
        let p = next_peak_mb(Some(12000.0), p);
        assert_eq!(p, Some(13310.0));
        // Fresh run: prev None + first sample = that sample (natural reset).
        assert_eq!(next_peak_mb(Some(2900.0), None), Some(2900.0));
    }
    use std::os::unix::process::CommandExt;
    use std::time::Duration;

    // ── J1: default_scan_dir derives from env, never a literal user path ─

    /// Serializes the two env-mutating tests below. `std::env` is
    /// process-global and cargo runs tests on multiple threads, so without
    /// this they interleave: the HOME test could observe the override test's
    /// `MODEL_DECK_SCAN_DIR=/custom/models` and fail (~2 runs in 12,
    /// measured). Both tests previously carried a `SAFETY: single-threaded
    /// test` comment, which was never true and is what hid the race.
    /// Poison-tolerant so one test panicking can't cascade into a bogus
    /// failure in the other.
    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn default_scan_dir_respects_override_env_var() {
        let _env = env_lock();
        // SAFETY: env_lock makes this the only thread touching these vars
        // for the duration of the test.
        unsafe {
            std::env::set_var("MODEL_DECK_SCAN_DIR", "/custom/models");
        }
        let dir = default_scan_dir();
        unsafe {
            std::env::remove_var("MODEL_DECK_SCAN_DIR");
        }
        assert_eq!(
            dir,
            std::path::PathBuf::from("/custom/models"),
            "MODEL_DECK_SCAN_DIR must be returned verbatim when set"
        );
    }

    #[test]
    fn default_scan_dir_derives_from_home_when_no_override() {
        let _env = env_lock();
        // SAFETY: env_lock makes this the only thread touching these vars
        // for the duration of the test.
        unsafe {
            std::env::remove_var("MODEL_DECK_SCAN_DIR");
        }
        let orig_home = std::env::var("HOME").unwrap_or_default();
        unsafe {
            std::env::set_var("HOME", "/tmp/probe");
        }
        let dir = default_scan_dir();
        if !orig_home.is_empty() {
            unsafe {
                std::env::set_var("HOME", orig_home);
            }
        } else {
            unsafe {
                std::env::remove_var("HOME");
            }
        }
        assert_eq!(
            dir,
            std::path::PathBuf::from("/tmp/probe/Documents/AI/Start_Scripts"),
            "scan-dir must derive from $HOME, never a hardcoded user path"
        );
    }

    // ── H: params shape matcher ──────────────────────────────────────

    #[test]
    fn params_is_matched_by_shape_not_letter() {
        let m = extract_filename_metadata("Ternary-Bonsai-27B-Q2_0.sh").unwrap();
        assert_eq!(
            m.params.as_deref(),
            Some("27B"),
            "params must match a size shape (27B/1.5B/700M), not any B-word"
        );
        assert_eq!(m.quant.as_deref(), Some("Q2_0"));
        assert_ne!(
            m.variant.as_deref(),
            Some("27B"),
            "the params token must not leak into variant"
        );
    }

    #[test]
    fn params_absent_yields_none_not_a_word() {
        let m = extract_filename_metadata("Behemoth-Instruct-Q4_K_M.sh").unwrap();
        assert_eq!(
            m.params, None,
            "no size token present -> None, never a guess"
        );
    }

    #[test]
    fn moe_active_token_is_fallback_only() {
        let m = extract_filename_metadata("Qwen3.6-35B-A3B-REAM-Q3_K_L.sh").unwrap();
        assert_eq!(m.params.as_deref(), Some("35B"));
    }

    // ── C13: kill-escalation ─────────────────────────────────────────

    fn spawn_isolated(secs: &str) -> std::process::Child {
        // process_group(0) puts the child in its own process group so that
        // graceful_shutdown's group-targeted signals (kill -pgid) don't reach
        // the test binary itself.
        std::process::Command::new("sleep")
            .arg(secs)
            .process_group(0)
            .spawn()
            .expect("failed to spawn sleep")
    }

    #[test]
    fn wait_for_exit_returns_true_after_process_dies() {
        let mut child = spawn_isolated("100");
        let pid = child.id();
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
        let _ = child.wait();
        let exited = wait_for_exit(pid, Duration::from_secs(3));
        assert!(exited, "wait_for_exit must return true after process exits");
    }

    #[test]
    fn graceful_shutdown_terminates_process() {
        let mut child = spawn_isolated("100");
        let pid = child.id();
        graceful_shutdown(pid).expect("graceful_shutdown must not error");
        // try_wait reaps the zombie; returns Some once process has exited.
        let status = child.try_wait().expect("try_wait failed");
        assert!(
            status.is_some(),
            "process must have exited after graceful_shutdown"
        );
    }
}
