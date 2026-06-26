//! AI service configuration and connection testing.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub llama_server_url: String,
    pub openwebui_url: String,
    pub opencode_url: String,
    pub comfyui_url: String,
    #[serde(default)]
    pub launcher_scan_dir: Option<String>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            llama_server_url: "http://localhost:8081".to_string(),
            openwebui_url: "http://localhost:3000".to_string(),
            opencode_url: "http://localhost:4000".to_string(),
            comfyui_url: "http://localhost:8188".to_string(),
            launcher_scan_dir: None,
        }
    }
}

use std::sync::OnceLock;

static AI_SETTINGS: OnceLock<Mutex<AiSettings>> = OnceLock::new();

fn get_settings_lock() -> &'static Mutex<AiSettings> {
    AI_SETTINGS.get_or_init(|| Mutex::new(AiSettings::default()))
}

pub fn get_ai_settings() -> AiSettings {
    get_settings_lock().lock().unwrap().clone()
}

pub fn set_ai_settings(settings: AiSettings) {
    *get_settings_lock().lock().unwrap() = settings;
}

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub url: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

pub async fn test_connection(url: &str) -> TestConnectionResponse {
    let client = reqwest::Client::new();

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
