//! API route handlers.

use axum::Json;
use axum::extract::ws::{Message, WebSocket};
use axum::routing::{delete, get, post};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::api::ai_management as ai_mgmt;
use crate::api::settings::{
    AiSettings, TestConnectionResponse, get_ai_settings, set_ai_settings, test_connection,
};
use crate::collectors::ai::{collect_ai_history, collect_ai_metrics};
use crate::collectors::alerts::{AlertResponse, check_all_alerts, clear_alert_tracking};
use crate::collectors::cpu::collect_cpu_metrics;
use crate::collectors::gpu::collect_gpu_metrics;
use crate::collectors::memory::collect_memory_metrics;
use crate::collectors::storage::{
    collect_storage_by_device, collect_storage_history, collect_storage_metrics,
};
use crate::collectors::system::collect_system_metrics;
use crate::models::ai::SavedCommand;

fn safe_serialize<T: serde::Serialize>(data: &T) -> Value {
    serde_json::to_value(data).unwrap_or_else(|_| json!({"error": "serialization failed"}))
}

pub fn create_router() -> axum::Router {
    axum::Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/metrics/cpu", get(cpu_handler))
        .route("/api/metrics/memory", get(memory_handler))
        .route("/api/metrics/gpu", get(gpu_handler))
        .route("/api/metrics/storage", get(storage_handler))
        .route("/api/metrics/storage/devices", get(storage_devices_handler))
        .route("/api/metrics/storage/history", get(storage_history_handler))
        .route("/api/metrics/system", get(system_handler))
        .route("/api/status", get(status_handler))
        .route(
            "/api/alerts",
            get(alerts_handler).delete(clear_alerts_handler),
        )
        .route("/api/ai/metrics", get(ai_metrics_handler))
        .route("/api/ai/history", get(ai_history_handler))
        .route(
            "/api/ai/settings",
            get(get_settings_handler).put(update_settings_handler),
        )
        .route("/api/ai/test-connection", post(test_connection_handler))
        .route("/api/ai/directory-info", get(directory_info_handler))
        .route("/api/ai/repo-info", get(repo_info_handler))
        .route("/api/ai/browse", get(browse_directory_handler))
        .route("/api/ai/terminal/spawn", post(spawn_terminal_handler))
        .route("/api/ai/terminal/input", post(terminal_input_handler))
        .route("/api/ai/terminal/output", get(terminal_output_handler))
        .route("/api/ai/terminal/resize", post(terminal_resize_handler))
        .route("/api/ai/terminal/kill", post(terminal_kill_handler))
        .route(
            "/api/ai/terminal/history/{pts_name}",
            get(terminal_history_handler),
        )
        .route("/api/ai/terminal/ws/{pts_name}", get(terminal_ws_handler))
        .route(
            "/api/ai/commands",
            get(list_commands_handler)
                .post(create_command_handler)
                .put(update_command_handler),
        )
        .route("/api/ai/commands", delete(delete_command_handler))
}

async fn health_handler() -> axum::response::Json<Value> {
    Json(json!({
        "status": "ok",
        "message": "System Dashboard API is running",
    }))
}

async fn cpu_handler() -> axum::response::Json<Value> {
    let (metrics, _status) = collect_cpu_metrics().await;
    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn memory_handler() -> axum::response::Json<Value> {
    let (metrics, _status) = collect_memory_metrics();
    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn gpu_handler() -> axum::response::Json<Value> {
    let (metrics, _status) = collect_gpu_metrics();
    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_handler() -> axum::response::Json<Value> {
    let (metrics, _status) = collect_storage_metrics();
    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_devices_handler() -> axum::response::Json<Value> {
    let devices = collect_storage_by_device();
    let json_data = safe_serialize(&devices);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_history_handler() -> axum::response::Json<Value> {
    let history = collect_storage_history();
    let json_data = safe_serialize(&history);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn system_handler() -> axum::response::Json<Value> {
    let metrics = collect_system_metrics();
    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn status_handler() -> axum::response::Json<Value> {
    let (gpu_backend, nvml_available) = crate::collectors::gpu::get_gpu_backend_info();
    let collectors = crate::collectors::system::get_collector_health_state();
    let last_update = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S UTC")
        .to_string();

    Json(json!({
        "gpu_backend": gpu_backend,
        "nvml_available": nvml_available,
        "collectors": collectors,
        "last_update": last_update,
    }))
}

async fn alerts_handler() -> axum::response::Json<AlertResponse> {
    let (_cpu, cpu_status) = collect_cpu_metrics().await;
    let (_mem, mem_status) = collect_memory_metrics();
    let (gpus, gpu_status) = collect_gpu_metrics();
    let (_storages, storages_status) = collect_storage_metrics();

    let first_gpu = gpus.first();

    let settings = get_ai_settings();
    let (ai_metrics, ai_collector_status) = collect_ai_metrics(
        &settings.llama_server_url,
        &settings.openwebui_url,
        &settings.opencode_url,
        &settings.comfyui_url,
    )
    .await;

    let llama_available = ai_metrics.llama_server.available;
    let openwebui_available = ai_metrics.openwebui.available;
    let opencode_available = ai_metrics.opencode.available;
    let comfyui_available = ai_metrics.comfyui.available;

    let alerts = check_all_alerts(
        cpu_status,
        mem_status,
        first_gpu,
        gpu_status,
        storages_status,
        ai_collector_status,
        llama_available,
        openwebui_available,
        opencode_available,
        comfyui_available,
    );

    Json(AlertResponse { alerts })
}

async fn clear_alerts_handler() -> axum::response::Json<Value> {
    clear_alert_tracking();
    Json(json!({ "cleared": true }))
}

async fn ai_metrics_handler() -> axum::response::Json<Value> {
    let settings = get_ai_settings();
    let (mut metrics, _status) = collect_ai_metrics(
        &settings.llama_server_url,
        &settings.openwebui_url,
        &settings.opencode_url,
        &settings.comfyui_url,
    )
    .await;

    // Enrich kv_cache_stats with real NVML VRAM data if available
    let (gpus, _) = collect_gpu_metrics();
    if let Some(first_gpu) = gpus.first() {
        if let Some(ref mut stats) = metrics.kv_cache_stats {
            for stat in stats.iter_mut() {
                stat.used_gpu_memory_mb = first_gpu.vram_used_gb * 1024.0;
                stat.free_gpu_memory_mb = first_gpu.vram_total_gb * 1024.0;
            }
        }
    }

    let json_data = safe_serialize(&metrics);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn ai_history_handler() -> axum::response::Json<Value> {
    let history = collect_ai_history();
    let json_data = safe_serialize(&history);
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn get_settings_handler() -> axum::response::Json<AiSettings> {
    Json(get_ai_settings())
}

#[derive(Deserialize)]
pub struct UpdateSettingsRequest {
    pub llama_server_url: String,
    pub openwebui_url: String,
    pub opencode_url: String,
    pub comfyui_url: String,
}

async fn update_settings_handler(
    Json(req): Json<UpdateSettingsRequest>,
) -> axum::response::Json<AiSettings> {
    let settings = AiSettings {
        llama_server_url: req.llama_server_url,
        openwebui_url: req.openwebui_url,
        opencode_url: req.opencode_url,
        comfyui_url: req.comfyui_url,
    };
    set_ai_settings(settings.clone());
    Json(settings)
}

#[derive(Deserialize)]
pub struct TestConnectionRequest {
    pub url: String,
}

async fn test_connection_handler(
    Json(req): Json<TestConnectionRequest>,
) -> axum::response::Json<TestConnectionResponse> {
    Json(test_connection(&req.url).await)
}

#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: String,
}

async fn directory_info_handler(
    query: axum::extract::Query<BrowseQuery>,
) -> axum::response::Json<Value> {
    let path = &query.path;
    let git_info = ai_mgmt::read_git_info(path);
    let build_status = ai_mgmt::check_build_dir(&format!("{}/build", path));
    let executables = ai_mgmt::detect_executables(&format!("{}/build/bin", path));
    let validation = ai_mgmt::validate_directory(path);
    Json(json!({
        "data": {
            "git_info": git_info,
            "build_status": build_status,
            "executables": safe_serialize(&executables),
            "validation": validation,
        }
    }))
}

#[derive(Deserialize)]
pub struct RepoInfoQuery {
    pub path: String,
    #[serde(default)]
    pub github_repo: Option<String>,
    #[serde(default)]
    pub tag_prefix: Option<String>,
}

async fn repo_info_handler(
    query: axum::extract::Query<RepoInfoQuery>,
) -> axum::response::Json<Value> {
    let path = &query.path;
    let github_repo = query.github_repo.as_deref().unwrap_or("ggml-org/llama.cpp");
    let tag_prefix = query.tag_prefix.as_deref().unwrap_or("b");

    let readme_url = ai_mgmt::get_repo_readme_url(path);
    let version = ai_mgmt::get_repo_version(path);
    let local_build_tag = ai_mgmt::get_local_build_tag(path, tag_prefix);
    let latest_build_tag = ai_mgmt::get_latest_release_tag(github_repo).await;
    Json(json!({
        "data": {
            "readme_url": readme_url,
            "version": version,
            "local_build_tag": local_build_tag,
            "latest_build_tag": latest_build_tag,
        }
    }))
}

async fn browse_directory_handler(
    query: axum::extract::Query<BrowseQuery>,
) -> axum::response::Json<Value> {
    let entries = ai_mgmt::browse_directory(&query.path);
    Json(json!({ "data": safe_serialize(&entries) }))
}

async fn spawn_terminal_handler(Json(req): Json<serde_json::Value>) -> axum::response::Json<Value> {
    let dir = req.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    match ai_mgmt::spawn_terminal(dir) {
        Ok(resp) => Json(json!({ "data": safe_serialize(&resp), "success": true })),
        Err(e) => Json(json!({ "error": e, "success": false })),
    }
}

async fn list_commands_handler() -> axum::response::Json<Value> {
    let commands = ai_mgmt::load_commands();
    Json(json!({ "data": safe_serialize(&commands) }))
}

#[derive(Deserialize)]
pub struct CreateCommandRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub description: Option<String>,
}

async fn create_command_handler(
    Json(req): Json<CreateCommandRequest>,
) -> axum::response::Json<Value> {
    let mut commands = ai_mgmt::load_commands();
    let id = ai_mgmt::generate_id();
    commands.push(SavedCommand {
        id,
        name: req.name,
        command: req.command,
        description: req.description,
    });
    if let Err(e) = ai_mgmt::save_commands(&commands) {
        return Json(json!({ "error": e }));
    }
    Json(json!({ "data": safe_serialize(&commands.last().unwrap()) }))
}

#[derive(Deserialize)]
pub struct UpdateCommandRequest {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub description: Option<String>,
}

async fn update_command_handler(
    Json(req): Json<UpdateCommandRequest>,
) -> axum::response::Json<Value> {
    let mut commands = ai_mgmt::load_commands();
    if let Some(cmd) = commands.iter_mut().find(|c| c.id == req.id) {
        cmd.name = req.name;
        cmd.command = req.command;
        cmd.description = req.description;
    } else {
        return Json(json!({ "error": "Command not found" }));
    }
    if let Err(e) = ai_mgmt::save_commands(&commands) {
        return Json(json!({ "error": e }));
    }
    Json(json!({ "data": safe_serialize(&commands.iter().find(|c| c.id == req.id).unwrap()) }))
}

async fn delete_command_handler(Json(req): Json<serde_json::Value>) -> axum::response::Json<Value> {
    let id = req.get("id").and_then(|v| v.as_str()).map(String::from);
    if let Some(id) = id {
        let mut commands = ai_mgmt::load_commands();
        commands.retain(|c| c.id != id);
        if let Err(e) = ai_mgmt::save_commands(&commands) {
            return Json(json!({ "error": e }));
        }
    }
    Json(json!({ "success": true }))
}

async fn terminal_input_handler(Json(req): Json<serde_json::Value>) -> axum::response::Json<Value> {
    let pts = req
        .get("pts")
        .and_then(|v| v.as_str())
        .unwrap_or("/dev/ptmx0");
    let input = req.get("input").and_then(|v| v.as_str()).unwrap_or("");
    match ai_mgmt::write_terminal_input(pts, input) {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn terminal_output_handler(
    query: axum::extract::Query<ai_mgmt::TerminalOutputQuery>,
) -> axum::response::Json<Value> {
    let pts = query.pts.as_str();
    match ai_mgmt::read_terminal_output(pts, query.offset.unwrap_or(0)) {
        Ok(resp) => Json(json!({ "data": safe_serialize(&resp), "success": true })),
        Err(e) => Json(json!({ "error": e, "success": false })),
    }
}

async fn terminal_resize_handler(
    Json(req): Json<serde_json::Value>,
) -> axum::response::Json<Value> {
    let pts = req
        .get("pts")
        .and_then(|v| v.as_str())
        .unwrap_or("/dev/ptmx0");
    let rows = req
        .get("rows")
        .and_then(|v| v.as_u64())
        .map(|r| r as u16)
        .unwrap_or(24);
    let cols = req
        .get("cols")
        .and_then(|v| v.as_u64())
        .map(|c| c as u16)
        .unwrap_or(80);
    match ai_mgmt::resize_terminal(pts, rows, cols) {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn terminal_kill_handler(Json(req): Json<serde_json::Value>) -> axum::response::Json<Value> {
    let pts = req
        .get("pts")
        .and_then(|v| v.as_str())
        .unwrap_or("/dev/ptmx0");
    match ai_mgmt::kill_terminal(pts) {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn terminal_ws_handler(
    ws: axum::extract::WebSocketUpgrade,
    axum::extract::Path(pts_name): axum::extract::Path<String>,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_terminal_ws(socket, pts_name))
}

async fn handle_terminal_ws(socket: WebSocket, pts_name: String) {
    let (mut sender, mut receiver) = socket.split();

    // Attach this viewer to the terminal's broadcast channel and get scrollback buffer
    let (rx, scrollback) = match ai_mgmt::attach_terminal_viewer(&pts_name) {
        Ok((rx, sb)) => (rx, sb),
        Err(_) => return,
    };

    // Replay scrollback history before streaming live output
    let history: Vec<String> = scrollback.lock().map(|sb| sb.clone()).unwrap_or_default();
    for chunk in history.iter() {
        if sender
            .send(Message::Text(axum::extract::ws::Utf8Bytes::from(
                chunk.clone(),
            )))
            .await
            .is_err()
        {
            break;
        }
    }

    // Task to receive messages from frontend and send to PTY
    let input_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                // Check for resize command before writing to PTY
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let (Some("resize"), Some(rows), Some(cols)) = (
                        json.get("type").and_then(|v| v.as_str()),
                        json.get("rows").and_then(|v| v.as_u64()).map(|r| r as u16),
                        json.get("cols").and_then(|v| v.as_u64()).map(|c| c as u16),
                    ) {
                        if let Err(_) = ai_mgmt::resize_terminal(&pts_name, rows, cols) {}
                        continue;
                    }
                }
                if let Err(_) = ai_mgmt::write_terminal_input(&pts_name, &text) {}
            } else if let Message::Binary(data) = msg {
                if let Err(_) =
                    ai_mgmt::write_terminal_input(&pts_name, &String::from_utf8_lossy(&data))
                {
                }
            }
        }
    });

    // Task to broadcast terminal output to frontend
    let output_task = tokio::spawn(async move {
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(text) => {
                    if sender
                        .send(Message::Text(axum::extract::ws::Utf8Bytes::from(text)))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // Skip ahead - terminal output is append-only so we can just continue
                }
                Err(_) => break,
            }
        }
    });

    // Wait for either task to complete (connection closed), then abort the
    // other. Without this, the loser keeps running as an orphaned background
    // task forever — in particular output_task holds the broadcast::Receiver
    // open even after the client disconnects (it never attempts a send that
    // would fail, since rx.recv().await doesn't notice the socket is gone),
    // so receiver_count() never drops and idle-terminal detection breaks.
    let mut input_task = input_task;
    let mut output_task = output_task;
    tokio::select! {
        _ = &mut input_task => { output_task.abort(); },
        _ = &mut output_task => { input_task.abort(); },
    }
}

async fn terminal_history_handler(
    axum::extract::Path(pts_name): axum::extract::Path<String>,
) -> axum::response::Json<Value> {
    match ai_mgmt::get_terminal_history(&pts_name) {
        Ok(history) => Json(json!({ "data": safe_serialize(&history), "success": true })),
        Err(e) => Json(json!({ "error": e, "success": false })),
    }
}
