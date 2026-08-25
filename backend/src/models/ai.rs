//! AI metrics data models for llama-server, OpenWebUI, and OpenCode monitoring.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Launch Profile Models ──────────────────────────────────────────

/// Capabilities reported by /props chat_template_caps, cached in models.json.
#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct ModelCapabilities {
    #[serde(default)]
    pub supports_reasoning_effort: bool,
    #[serde(default)]
    pub supports_preserve_reasoning: bool,
    #[serde(default)]
    pub supports_tools: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_ctx_train: Option<u32>,
}

/// A capability-detected option (no script change needed).
/// `env_var` is what gets set in the process environment (LLAMA_ARG_*).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedOption {
    pub name: String,
    pub env_var: String,
    pub values: Vec<String>,
    pub default: String,
    /// Why this option's list looks the way it does, when that needs saying.
    /// Set only where the choice list is degraded — a short list with no
    /// explanation reads as broken. Absent (and unserialised) otherwise, so a
    /// normal option gains no key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// A tunable option declared by a launch script via `# @option NAME: a|b|c`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptOption {
    pub name: String,
    pub values: Vec<String>,
    pub default: String,
}

/// Parsed arguments from a .sh launch script
#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct ParsedScriptArgs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ubatch_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parallel: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_reuse: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flash_attn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threads: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_type_k: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_type_v: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_draft_n_max: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_draft: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mmproj: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<ScriptOption>>,
}

/// Metadata parsed from the script filename
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilenameMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
}

/// A launch profile discovered from a .sh script
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LaunchProfile {
    pub id: String,
    pub name: String,
    pub script_path: String,
    pub file_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed_args: Option<ParsedScriptArgs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename_meta: Option<FilenameMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
    /// Capability-detected options (from models.json cache). Absent when the
    /// model has never been run (no cached caps yet).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_options: Option<Vec<DetectedOption>>,
}

/// Current runtime state of a profile
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llama_server_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_vram_mb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_ram_mb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_tps: Option<f64>,
}

/// Persisted metadata for a profile (keyed by script path)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileMetadata {
    pub script_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_vram_mb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_ram_mb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_gen_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_gen_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_context_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_date: Option<String>,
    #[serde(default)]
    pub run_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_startup_time_ms: Option<f64>,
}

/// Combined profile response for the frontend
#[derive(Debug, Serialize, Clone)]
pub struct ProfileResponse {
    pub profiles: Vec<LaunchProfile>,
    pub states: HashMap<String, ProfileState>,
    pub metadata: HashMap<String, ProfileMetadata>,
    pub scan_dir: String,
}

/// Request to launch a profile
#[derive(Debug, Deserialize)]
pub struct LaunchRequest {
    pub script_path: String,
}

/// Request to stop a profile
#[derive(Debug, Deserialize)]
pub struct StopRequest {
    pub script_path: String,
}

/// Status of an AI service
#[derive(Debug, Default, Serialize, Clone)]
pub struct AiServiceStatus {
    pub name: String,
    pub endpoint: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

/// Token usage for a single model in llama-server
#[derive(Debug, Serialize, Clone)]
pub struct AiTokenUsage {
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cached_tokens: i64,
}

/// KV cache statistics for a single GPU in llama-server
#[derive(Debug, Serialize, Clone)]
pub struct AiKvCacheStats {
    pub gpu_cache_usage_pct: f64,
    pub free_gpu_memory_mb: f64,
    pub used_gpu_memory_mb: f64,
}

/// KV cache stats per GPU for OpenWebUI /api/v1/chat/history
#[derive(Debug, Serialize, Clone)]
pub struct AiGpuCacheStats {
    pub gpu_id: i32,
    pub total_memory_mb: f64,
    pub used_memory_mb: f64,
    pub free_memory_mb: f64,
}

/// OpenWebUI chat history entry
#[derive(Debug, Serialize, Clone)]
pub struct AiChatHistoryEntry {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// OpenWebUI /api/v1/models response model item
#[derive(Debug, Serialize, Clone)]
pub struct AiModelItem {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// OpenWebUI /api/v1/models response
#[derive(Debug, Serialize, Clone)]
pub struct AiModelList {
    pub models: Vec<AiModelItem>,
}

/// OpenWebUI /api/v1/health response
#[derive(Debug, Serialize, Clone)]
pub struct AiOpenWebuiHealth {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// OpenCode /api/health response
#[derive(Debug, Serialize, Clone)]
pub struct AiOpencodeHealth {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// Per-process CPU and memory metrics
#[derive(Debug, Serialize, Clone)]
pub struct ProcessMetrics {
    pub pid: u32,
    pub cpu_percent: f64,
    pub memory_kb: u64,
    pub uptime_seconds: f64,
    pub vram_mb: Option<f64>,
    pub gpu_util_percent: Option<f64>,
}

/// Parsed Prometheus metrics from llama-server /metrics endpoint
#[derive(Debug, Clone, Default)]
pub struct LlamaMetrics {
    pub prompt_tokens_total: f64,
    pub prompt_seconds_total: f64,
    pub tokens_predicted_total: f64,
    pub tokens_predicted_seconds_total: f64,
    pub n_decode_total: f64,
    pub n_tokens_max: f64,
    pub prompt_tokens_per_second: f64,
    pub predicted_tokens_per_second: f64,
    pub requests_processing: f64,
    pub requests_deferred: f64,
    pub n_busy_slots_per_decode: f64,
    pub spec_draft_tokens_total: f64,
    pub spec_accepted_tokens_total: f64,
    pub prompt_tokens_cached_total: f64,
}

/// Parsed /props endpoint from llama-server
#[derive(Debug, Clone, Default)]
pub struct LlamaProps {
    pub model_alias: Option<String>,
    pub model_path: Option<String>,
    pub n_ctx: Option<u32>,
    pub total_slots: Option<u32>,
    pub build_info: Option<String>,
    pub endpoint_metrics: Option<bool>,
    pub webui: Option<bool>,
    pub vision: Option<bool>,
    pub video: Option<bool>,
    pub audio: Option<bool>,
    pub temperature: Option<f64>,
    pub top_k: Option<i32>,
    pub top_p: Option<f64>,
    pub repeat_penalty: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub repeat_last_n: Option<i32>,
    pub seed: Option<u64>,
    pub reasoning_format: Option<String>,
    pub samplers: Option<Vec<String>>,
    pub speculative: Option<bool>,
    pub context_tokens: Option<u32>,
    pub chat_template_caps: Option<ChatTemplateCapsRaw>,
    pub n_ctx_train: Option<u32>,
}

/// Raw chat_template_caps from /props (kept internal; persisted via ModelCapabilities).
#[derive(Debug, Clone, Default)]
pub struct ChatTemplateCapsRaw {
    pub supports_reasoning_effort: bool,
    pub supports_preserve_reasoning: bool,
    pub supports_tools: bool,
}

/// Per-slot state from /slots endpoint
#[derive(Debug, Clone, Default, Serialize)]
pub struct LlamaSlot {
    pub id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_ctx: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_prompt_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_processing: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_decoded: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_remain: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_prompt_tokens_cache: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_predict: Option<u32>,
}

/// GPU layer offload information parsed from llama.cpp startup logs
#[derive(Debug, Clone, Serialize)]
pub struct GpuOffloadInfo {
    pub main_loaded: u32,
    pub main_total: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_loaded: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_total: Option<u32>,
}

/// ComfyUI workflow and queue info
#[derive(Debug, Serialize, Clone)]
pub struct AiComfyUiInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_size: Option<usize>,
}

/// Complete AI metrics snapshot
#[derive(Debug, Default, Serialize, Clone)]
pub struct AiMetrics {
    /// Service status objects (for detailed view)
    pub llama_server: AiServiceStatus,
    pub openwebui: AiServiceStatus,
    pub opencode: AiServiceStatus,
    pub comfyui: AiServiceStatus,

    /// Computed status strings (for frontend compatibility)
    #[serde(rename = "llama_server_status")]
    pub llama_server_status_str: String,
    #[serde(rename = "openwebui_status")]
    pub openwebui_status_str: String,
    #[serde(rename = "opencode_status")]
    pub opencode_status_str: String,
    #[serde(rename = "comfyui_status")]
    pub comfyui_status_str: String,

    /// Computed utilization metrics from /metrics endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llm_utilization_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kv_cache_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_buffer_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_cached: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens_sent: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_queue_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub running_prompts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap_pending_slots: Option<i64>,

    /// Raw token usage and KV cache stats (for detailed view)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<AiTokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kv_cache_stats: Option<Vec<AiKvCacheStats>>,

    /// OpenWebUI data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_history_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<AiModelItem>>,

    /// Latency from health check
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llama_server_latency_ms: Option<f64>,

    /// Operational metrics from /metrics endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gen_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_requests: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queued_requests: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub busy_slots: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_context: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_tokens_max: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_draft_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_accepted_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_cached: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_decode_total: Option<i64>,

    /// Per-slot state parsed from /slots endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slots: Option<Vec<LlamaSlot>>,

    /// Props from /props endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_slots: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_info: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint_metrics: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webui: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_last_n: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samplers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speculative: Option<bool>,

    /// Per-process metrics for llama-server
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llama_server_process: Option<ProcessMetrics>,

    /// Per-process metrics for OpenWebUI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openwebui_process: Option<ProcessMetrics>,

    /// Per-process metrics for OpenCode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opencode_process: Option<ProcessMetrics>,

    /// Per-process metrics for ComfyUI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comfyui_process: Option<ProcessMetrics>,

    /// ComfyUI workflow/queue info
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comfyui_info: Option<AiComfyUiInfo>,

    /// GPU layer offload info parsed from startup logs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_offload: Option<GpuOffloadInfo>,

    /// Model load time from launch initiation to first health check success
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_load_time_ms: Option<f64>,

    /// Total KV buffer size reserved across all GPUs (from startup logs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kv_cache_reserved_mib: Option<f64>,

    /// GGUF model file size in GiB (from filesystem stat on model path)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gguf_size_gib: Option<f64>,

    /// Script path of the currently running model (for option mismatch display).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub running_script_path: Option<String>,

    /// Maximum context the model was trained on (from /v1/models meta.n_ctx_train).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_ctx_train: Option<u32>,
}

/// Directory entry from filesystem browse
#[derive(Debug, Serialize, Clone)]
pub struct DirectoryEntry {
    pub name: String,
    pub is_dir: bool,
}

/// Git repository information
#[derive(Debug, Serialize, Clone)]
pub struct GitInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_hash: Option<String>,
}

/// Build directory status
#[derive(Debug, Serialize, Clone)]
pub struct BuildDirStatus {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
}

/// Detected llama.cpp executable info
#[derive(Debug, Serialize, Clone)]
pub struct ExecutableInfo {
    pub name: String,
    pub path: String,
    pub exists: bool,
}

/// Saved command for terminal execution
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// History point for AI metrics over time
#[derive(Debug, Default, Serialize, Clone)]
pub struct AiHistoryPoint {
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llama_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openwebui_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opencode_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comfyui_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kv_cache_max_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gen_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_requests: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queued_requests: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_tokens: Option<u32>,
}
