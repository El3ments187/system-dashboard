//! AI service configuration and connection testing.

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub llama_server_url: String,
    pub openwebui_url: String,
    pub opencode_url: String,
    pub comfyui_url: String,
    #[serde(default)]
    pub launcher_scan_dir: Option<String>,
    #[serde(default)]
    pub llama_working_dir: Option<String>,
    /// The localbench checkout the Bench page drives. Config/env is enough
    /// for v1; a Settings-page field is v1.1.
    #[serde(default)]
    pub bench_dir: Option<String>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            llama_server_url: "http://localhost:8081".to_string(),
            openwebui_url: "http://localhost:3000".to_string(),
            opencode_url: "http://localhost:4000".to_string(),
            comfyui_url: "http://localhost:8188".to_string(),
            launcher_scan_dir: None,
            llama_working_dir: None,
            bench_dir: None,
        }
    }
}

// ── Disk persistence ──────────────────────────────────────────────────────────

fn settings_dir() -> PathBuf {
    if let Ok(d) = std::env::var("MODEL_DECK_SETTINGS_DIR") {
        return PathBuf::from(d);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    PathBuf::from(home).join(".config/model-deck")
}

fn settings_file() -> PathBuf {
    settings_dir().join("settings.json")
}

fn models_file() -> PathBuf {
    settings_dir().join("models.json")
}

pub fn models_location() -> (PathBuf, bool) {
    let path = models_file();
    let exists = path.exists();
    (path, exists)
}

type ModelsCache = std::collections::HashMap<String, crate::models::ai::ModelCapabilities>;

fn load_models_cache() -> ModelsCache {
    let path = models_file();
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return ModelsCache::new(),
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_models_cache(cache: &ModelsCache) {
    let path = models_file();
    if let Some(parent) = path.parent()
        && let Err(e) = std::fs::create_dir_all(parent)
    {
        eprintln!("[Settings] Failed to create models.json dir: {e}");
        return;
    }
    let tmp = path.with_extension("json.tmp");
    match serde_json::to_string_pretty(cache) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&tmp, json) {
                eprintln!("[Settings] Failed to write models.json.tmp: {e}");
                return;
            }
            if let Err(e) = std::fs::rename(&tmp, &path) {
                eprintln!("[Settings] Failed to rename models.json.tmp: {e}");
            }
        }
        Err(e) => eprintln!("[Settings] Failed to serialise models cache: {e}"),
    }
}

/// Read current capabilities for `script_path` from models.json.
pub fn get_model_capabilities(script_path: &str) -> Option<crate::models::ai::ModelCapabilities> {
    load_models_cache().remove(script_path)
}

/// Write-on-change: only saves if the entry for `script_path` changed.
pub fn update_model_capabilities(
    script_path: &str,
    caps: crate::models::ai::ModelCapabilities,
) {
    let mut cache = load_models_cache();
    if cache.get(script_path) == Some(&caps) {
        return;
    }
    cache.insert(script_path.to_string(), caps);
    save_models_cache(&cache);
}

/// Remove entries whose script_path is not in `current_paths`. Only saves if
/// something was actually removed. Does nothing if `current_paths` is empty
/// (protects against a bad scan erasing all caps).
pub fn prune_model_capabilities(current_paths: &std::collections::HashSet<String>) {
    if current_paths.is_empty() {
        return;
    }
    let mut cache = load_models_cache();
    let before = cache.len();
    cache.retain(|k, _| current_paths.contains(k));
    if cache.len() < before {
        save_models_cache(&cache);
    }
}

pub(crate) fn load_settings_from_path(
    path: &Path,
) -> Result<AiSettings, Box<dyn Error + Send + Sync>> {
    let text = std::fs::read_to_string(path)?;
    let s: AiSettings = serde_json::from_str(&text)?;
    Ok(s)
}

pub(crate) fn save_settings_to_path(
    path: &Path,
    settings: &AiSettings,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn load_settings_from_disk() -> AiSettings {
    load_settings_from_path(&settings_file()).unwrap_or_default()
}

fn save_settings_to_disk(settings: &AiSettings) {
    if let Err(e) = save_settings_to_path(&settings_file(), settings) {
        eprintln!("Failed to save settings: {e}");
    }
}

pub fn settings_location() -> (PathBuf, bool) {
    let path = settings_file();
    let exists = path.exists();
    (path, exists)
}

// ── In-memory singleton ───────────────────────────────────────────────────────

use std::sync::OnceLock;

static AI_SETTINGS: OnceLock<Mutex<AiSettings>> = OnceLock::new();

fn get_settings_lock() -> &'static Mutex<AiSettings> {
    AI_SETTINGS.get_or_init(|| Mutex::new(load_settings_from_disk()))
}

pub fn get_ai_settings() -> AiSettings {
    get_settings_lock().lock().unwrap().clone()
}

pub fn set_ai_settings(settings: AiSettings) {
    save_settings_to_disk(&settings);
    *get_settings_lock().lock().unwrap() = settings;
}

// ── Connection testing ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub url: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

fn settings_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

pub async fn test_connection(url: &str) -> TestConnectionResponse {
    let client = settings_http_client();

    // Try health endpoint first (common pattern for OpenWebUI/OpenCode)
    let health_paths = ["/api/health", "/health"];

    for path in &health_paths {
        let full_url = format!("{}{}", url.trim_end_matches('/'), path);
        match client.get(&full_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    return TestConnectionResponse {
                        url: full_url,
                        available: true,
                        error_message: None,
                    };
                }
            }
            Err(_) => continue,
        }
    }

    // Try llama-server metrics endpoint
    let llama_paths = ["/metrics", "/health"];

    for path in &llama_paths {
        let full_url = format!("{}{}", url.trim_end_matches('/'), path);
        match client.get(&full_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    return TestConnectionResponse {
                        url: full_url,
                        available: true,
                        error_message: None,
                    };
                }
            }
            Err(_) => continue,
        }
    }

    // Try root endpoint as last resort
    match client.get(url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                return TestConnectionResponse {
                    url: url.to_string(),
                    available: true,
                    error_message: None,
                };
            }
        }
        Err(e) => {
            return TestConnectionResponse {
                url: url.to_string(),
                available: false,
                error_message: Some(format!("Connection failed: {}", e)),
            };
        }
    }

    TestConnectionResponse {
        url: url.to_string(),
        available: false,
        error_message: Some("Service responded but health check failed".to_string()),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    // Serialise env-var mutations so parallel tests don't race on MODEL_DECK_SETTINGS_DIR.
    static SETTINGS_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    fn settings_test_guard() -> std::sync::MutexGuard<'static, ()> {
        SETTINGS_TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap()
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("model-deck-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn settings_dir_env_override() {
        let _g = settings_test_guard();
        let expected = std::env::temp_dir().join("md-override-test");
        unsafe { std::env::set_var("MODEL_DECK_SETTINGS_DIR", &expected) };
        let result = settings_dir();
        unsafe { std::env::remove_var("MODEL_DECK_SETTINGS_DIR") };
        assert_eq!(result, expected);
    }

    #[test]
    fn settings_dir_default_uses_home() {
        let _g = settings_test_guard();
        unsafe { std::env::remove_var("MODEL_DECK_SETTINGS_DIR") };
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
        let result = settings_dir();
        assert_eq!(result, PathBuf::from(home).join(".config/model-deck"));
    }

    #[test]
    fn load_save_round_trip() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("settings.json");

        let original = AiSettings {
            llama_server_url: "http://test:9999".to_string(),
            openwebui_url: "http://test:3001".to_string(),
            opencode_url: "http://test:4001".to_string(),
            comfyui_url: "http://test:8189".to_string(),
            launcher_scan_dir: Some("/some/scan".to_string()),
            llama_working_dir: Some("/some/work".to_string()),
            bench_dir: Some("/some/localbench".to_string()),
        };

        save_settings_to_path(&path, &original).unwrap();
        let loaded = load_settings_from_path(&path).unwrap();

        assert_eq!(loaded.llama_server_url, original.llama_server_url);
        assert_eq!(loaded.openwebui_url, original.openwebui_url);
        assert_eq!(loaded.launcher_scan_dir, original.launcher_scan_dir);
        assert_eq!(loaded.llama_working_dir, original.llama_working_dir);
        assert_eq!(loaded.bench_dir, original.bench_dir);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_json_returns_error() {
        let dir = tmp_dir("corrupt");
        let path = dir.join("settings.json");
        std::fs::write(&path, b"{ not valid json ").unwrap();

        let result = load_settings_from_path(&path);
        assert!(result.is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_file_returns_error() {
        let path = PathBuf::from("/tmp/model-deck-nonexistent-99999/settings.json");
        let result = load_settings_from_path(&path);
        assert!(result.is_err());
    }

    #[test]
    fn save_creates_parent_dirs() {
        let dir = tmp_dir("mkdirs");
        let path = dir.join("nested").join("deep").join("settings.json");

        save_settings_to_path(&path, &AiSettings::default()).unwrap();
        assert!(path.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn settings_location_reports_exists() {
        let _g = settings_test_guard();
        let dir = tmp_dir("location");
        unsafe { std::env::set_var("MODEL_DECK_SETTINGS_DIR", &dir) };

        // Before the file exists
        let (path, exists) = settings_location();
        assert_eq!(path, dir.join("settings.json"));
        assert!(!exists);

        // After saving
        save_settings_to_path(&path, &AiSettings::default()).unwrap();
        let (_, exists2) = settings_location();
        assert!(exists2);

        unsafe { std::env::remove_var("MODEL_DECK_SETTINGS_DIR") };
        std::fs::remove_dir_all(&dir).ok();
    }
}
