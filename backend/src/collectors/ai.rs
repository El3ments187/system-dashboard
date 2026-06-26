//! AI metrics collector for llama-server, OpenWebUI, and OpenCode monitoring.

use crate::collectors::alerts::CollectorStatus;
use crate::models::ai::*;
use std::sync::{LazyLock, Mutex};

const HISTORY_RETENTION_SECONDS: u64 = 120;

/// Find PIDs of processes matching a name pattern by scanning /proc.
///
/// Matches against the `/proc/[pid]/exe` symlink target first. That symlink can't be
/// resolved across UIDs without ptrace privileges (e.g. a root-owned process viewed by a
/// non-root collector), and processes started via an interpreter (e.g. `python3 -m
/// uvicorn open_webui.main:app`) won't have the target name in `exe` at all — so it also
/// falls back to matching against `/proc/[pid]/cmdline`, which remains world-readable.
fn find_process_pids(name_pattern: &str) -> Vec<u32> {
    let mut pids = Vec::new();
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(pid_str) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let Ok(pid) = pid_str.parse::<u32>() else {
                continue;
            };

            if let Some(exe_name) = std::fs::read_link(path.join("exe"))
                .ok()
                .and_then(|exe| exe.file_name().and_then(|n| n.to_str()).map(String::from))
            {
                if exe_name.contains(name_pattern) {
                    pids.push(pid);
                    continue;
                }
            }

            if let Ok(cmdline) = std::fs::read_to_string(path.join("cmdline")) {
                if cmdline.replace('\0', " ").contains(name_pattern) {
                    pids.push(pid);
                }
            }
        }
    }
    pids
}

/// Read CPU and memory usage for a given PID from /proc/[pid]/stat and /proc/[pid]/status
fn read_process_metrics(pid: u32) -> Option<ProcessMetrics> {
    // Read /proc/[pid]/stat
    let stat_path = format!("/proc/{}/stat", pid);
    let stat_content = std::fs::read_to_string(&stat_path).ok()?;
    let fields: Vec<&str> = stat_content.split_whitespace().collect();
    if fields.len() < 36 {
        return None;
    }

    // Parse utime and stime (fields 14 and 15, 0-indexed)
    let utime: f64 = fields[13].parse().ok()?;
    let stime: f64 = fields[14].parse().ok()?;
    let total_time = utime + stime;

    // Read /proc/[pid]/status for VmRSS (memory)
    let status_path = format!("/proc/{}/status", pid);
    let status_content = std::fs::read_to_string(&status_path).ok()?;
    let vmem_rss_kb: f64 = status_content
        .lines()
        .find(|l| l.starts_with("VmRSS:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);

    // Get total system CPU time from /proc/stat for utilization calculation
    let sys_stat = std::fs::read_to_string("/proc/stat").ok()?;
    let sys_fields: Vec<f64> = sys_stat
        .lines()
        .find(|l| l.starts_with("cpu "))
        .and_then(|l| {
            l.split_whitespace()
                .skip(1)
                .map(|v| v.parse::<f64>().ok())
                .collect::<Option<Vec<f64>>>()
        })?;
    let total_sys_time: f64 = sys_fields.iter().sum();

    // Get number of CPUs for normalization
    let num_cpus = if sys_fields.len() > 0 {
        (sys_fields.len() - 1) as f64
    } else {
        1.0
    };

    // Calculate CPU utilization (instantaneous based on total time since process start)
    // We use a simple approach: total_time / (total_sys_time / num_cpus) * 100
    let cpu_percent = if total_sys_time > 0.0 && num_cpus > 0.0 {
        (total_time / (total_sys_time / num_cpus)) * 100.0
    } else {
        0.0
    };

    // Get process start time and calculate uptime
    let starttime: u64 = fields[21].parse().ok()?;
    let clk_tck = unsafe { libc::sysconf(libc::_SC_CLK_TCK) as u64 };
    let uptime_seconds = read_uptime_seconds();
    let process_start_sec = starttime as f64 / clk_tck as f64;
    let process_uptime = if uptime_seconds > process_start_sec {
        uptime_seconds - process_start_sec
    } else {
        0.0
    };

    Some(ProcessMetrics {
        pid,
        cpu_percent: (cpu_percent * 10.0).round() / 10.0,
        memory_kb: vmem_rss_kb as u64,
        uptime_seconds: process_uptime.round(),
    })
}

/// Read system uptime in seconds from /proc/uptime
fn read_uptime_seconds() -> f64 {
    std::fs::read_to_string("/proc/uptime")
        .ok()
        .and_then(|s| s.split_whitespace().next().map(String::from))
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0)
}

/// Collect process metrics for a given name pattern
fn collect_process_metrics(name_pattern: &str) -> Option<ProcessMetrics> {
    let pids = find_process_pids(name_pattern);
    if pids.is_empty() {
        return None;
    }
    // Return the first matching process (most likely the one we want)
    for pid in pids {
        if let Some(metrics) = read_process_metrics(pid) {
            return Some(metrics);
        }
    }
    None
}

/// Internal history entry with insertion time for pruning
#[derive(Clone)]
struct AiHistoryEntry {
    point: AiHistoryPoint,
    inserted_at: std::time::Instant,
}

static AI_HISTORY: LazyLock<Mutex<Vec<AiHistoryEntry>>> = LazyLock::new(|| Mutex::new(Vec::new()));

/// Parse Prometheus text-format metrics from llama-server /metrics endpoint.
fn parse_prometheus_metrics(body: &str) -> LlamaMetrics {
    let mut m = LlamaMetrics::default();
    for line in body.lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0];
        let value: f64 = parts[1].parse().unwrap_or(f64::NAN);
        match name {
            "llamacpp:prompt_tokens_total" => m.prompt_tokens_total = value,
            "llamacpp:prompt_seconds_total" => m.prompt_seconds_total = value,
            "llamacpp:tokens_predicted_total" => m.tokens_predicted_total = value,
            "llamacpp:tokens_predicted_seconds_total" => m.tokens_predicted_seconds_total = value,
            "llamacpp:n_decode_total" => m.n_decode_total = value,
            "llamacpp:n_tokens_max" => m.n_tokens_max = value,
            "llamacpp:prompt_tokens_seconds" => m.prompt_tokens_per_second = value,
            "llamacpp:predicted_tokens_seconds" => m.predicted_tokens_per_second = value,
            "llamacpp:requests_processing" => m.requests_processing = value,
            "llamacpp:requests_deferred" => m.requests_deferred = value,
            "llamacpp:n_busy_slots_per_decode" => m.n_busy_slots_per_decode = value,
            _ => {}
        }
    }
    m
}

/// Parse JSON /props endpoint from llama-server.
///
/// Generation defaults (temperature/top_k/top_p/repeat_penalty) and n_ctx are nested
/// under `default_generation_settings.params` / `default_generation_settings.n_ctx`,
/// and modality flags are nested under `modalities`. Fields are read independently so a
/// missing/renamed field doesn't blank out the whole response.
fn parse_props(body: &str) -> Option<LlamaProps> {
    let val: serde_json::Value = serde_json::from_str(body).ok()?;

    let gen_settings = val.get("default_generation_settings");
    let params = gen_settings.and_then(|g| g.get("params"));
    let modalities = val.get("modalities");

    Some(LlamaProps {
        model_alias: val
            .get("model_alias")
            .and_then(|v| v.as_str())
            .map(String::from),
        model_path: val
            .get("model_path")
            .and_then(|v| v.as_str())
            .map(String::from),
        n_ctx: val
            .get("n_ctx")
            .or_else(|| gen_settings.and_then(|g| g.get("n_ctx")))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        total_slots: val
            .get("total_slots")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        build_info: val
            .get("build_info")
            .and_then(|v| v.as_str())
            .map(String::from),
        endpoint_metrics: val.get("endpoint_metrics").and_then(|v| v.as_bool()),
        webui: val
            .get("webui")
            .or_else(|| val.get("ui"))
            .and_then(|v| v.as_bool()),
        vision: val
            .get("vision")
            .or_else(|| modalities.and_then(|m| m.get("vision")))
            .and_then(|v| v.as_bool()),
        video: val
            .get("video")
            .or_else(|| modalities.and_then(|m| m.get("video")))
            .and_then(|v| v.as_bool()),
        audio: val
            .get("audio")
            .or_else(|| modalities.and_then(|m| m.get("audio")))
            .and_then(|v| v.as_bool()),
        temperature: val
            .get("temperature")
            .or_else(|| params.and_then(|p| p.get("temperature")))
            .and_then(|v| v.as_f64()),
        top_k: val
            .get("top_k")
            .or_else(|| params.and_then(|p| p.get("top_k")))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32),
        top_p: val
            .get("top_p")
            .or_else(|| params.and_then(|p| p.get("top_p")))
            .and_then(|v| v.as_f64()),
        repeat_penalty: val
            .get("repeat_penalty")
            .or_else(|| params.and_then(|p| p.get("repeat_penalty")))
            .and_then(|v| v.as_f64()),
    })
}

/// Poll llama-server for health, /metrics, and /props data.
async fn poll_llama_server(
    base_url: &str,
) -> (
    AiServiceStatus,
    Option<LlamaMetrics>,
    Option<LlamaProps>,
    Option<f64>,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // Check health endpoint with latency measurement
    let health_url = format!("{}/health", base_url);
    let start = std::time::Instant::now();
    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

            // Fetch /metrics endpoint for Prometheus data
            let metrics_url = format!("{}/metrics", base_url);
            let metrics = match client.get(&metrics_url).send().await {
                Ok(mresp) if mresp.status().is_success() => match mresp.text().await {
                    Ok(body) => Some(parse_prometheus_metrics(&body)),
                    Err(_) => None,
                },
                _ => None,
            };

            // Fetch /props endpoint for model and server info
            let props_url = format!("{}/props", base_url);
            let props = match client.get(&props_url).send().await {
                Ok(presp) if presp.status().is_success() => match presp.text().await {
                    Ok(body) => parse_props(&body),
                    Err(_) => None,
                },
                _ => None,
            };

            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: true,
                error_message: None,
            };

            (status, metrics, props, Some(latency_ms))
        }
        Ok(resp) => {
            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
            (status, None, None, None)
        }
        Err(e) => {
            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("Connection failed: {}", e)),
            };
            (status, None, None, None)
        }
    }
}

/// Compute derived metrics from raw Prometheus data and /props info.
fn compute_derived_metrics(prom: &LlamaMetrics, props: Option<&LlamaProps>) -> AiDerivedMetrics {
    let prompt_tokens = prom.prompt_tokens_total as i64;
    let completion_tokens = prom.tokens_predicted_total as i64;
    let total_tokens = prompt_tokens + completion_tokens;

    // LLM utilization from busy slots (approximate: busy slots / decode calls)
    let llm_utilization = if prom.n_decode_total > 0.0 {
        (prom.n_busy_slots_per_decode / prom.n_decode_total * 100.0).min(100.0)
    } else {
        0.0
    };

    // KV cache usage from n_tokens_max vs context window (approximate)
    let kv_cache_usage = if prom.n_tokens_max > 0.0 {
        (prom.n_busy_slots_per_decode / prom.n_tokens_max * 100.0).min(100.0)
    } else {
        0.0
    };

    // Prompt buffer usage from requests in queue
    let prompt_buffer_usage = if prom.requests_processing > 0.0 || prom.requests_deferred > 0.0 {
        (prom.requests_deferred / (prom.requests_processing + prom.requests_deferred + 1.0) * 100.0)
            .min(100.0)
    } else {
        0.0
    };

    // Server time from total processing time
    let server_time_ms = (prom.prompt_seconds_total + prom.tokens_predicted_seconds_total) * 1000.0;

    AiDerivedMetrics {
        llm_utilization_percent: if llm_utilization.is_finite() {
            Some(llm_utilization)
        } else {
            None
        },
        kv_cache_usage_percent: if kv_cache_usage.is_finite() {
            Some(kv_cache_usage)
        } else {
            None
        },
        prompt_buffer_usage_percent: if prompt_buffer_usage.is_finite() {
            Some(prompt_buffer_usage)
        } else {
            None
        },
        tokens_cached: Some(prom.n_tokens_max as i64),
        total_tokens_sent: if total_tokens >= 0 {
            Some(total_tokens)
        } else {
            None
        },
        server_time_ms: if server_time_ms.is_finite() {
            Some(server_time_ms)
        } else {
            None
        },
        prompt_queue_size: if prom.requests_deferred > 0.0 {
            Some(prom.requests_deferred as i64)
        } else {
            Some(0)
        },
        running_prompts: Some(prom.requests_processing as i64),
        swap_pending_slots: if prom.requests_deferred > 0.0 {
            Some(prom.requests_deferred as i64)
        } else {
            None
        },
        prompt_tokens,
        completion_tokens,
        total_tokens,

        // Operational metrics from /metrics endpoint
        gen_tps: if prom.predicted_tokens_per_second.is_finite()
            && prom.predicted_tokens_per_second > 0.0
        {
            Some(prom.predicted_tokens_per_second)
        } else {
            None
        },
        prompt_tps: if prom.prompt_tokens_per_second.is_finite()
            && prom.prompt_tokens_per_second > 0.0
        {
            Some(prom.prompt_tokens_per_second)
        } else {
            None
        },
        active_requests: Some(prom.requests_processing as u32),
        queued_requests: Some(prom.requests_deferred as u32),
        busy_slots: if prom.n_busy_slots_per_decode.is_finite()
            && prom.n_busy_slots_per_decode > 0.0
        {
            Some(prom.n_busy_slots_per_decode as u32)
        } else {
            None
        },
        context_tokens: Some(prom.n_tokens_max as u32),
        max_context: props.and_then(|p| p.n_ctx),
    }
}

/// Raw computed metrics from Prometheus data
#[derive(Debug, Clone)]
struct AiDerivedMetrics {
    llm_utilization_percent: Option<f64>,
    kv_cache_usage_percent: Option<f64>,
    prompt_buffer_usage_percent: Option<f64>,
    tokens_cached: Option<i64>,
    total_tokens_sent: Option<i64>,
    server_time_ms: Option<f64>,
    prompt_queue_size: Option<i64>,
    running_prompts: Option<i64>,
    swap_pending_slots: Option<i64>,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    // Operational metrics
    gen_tps: Option<f64>,
    prompt_tps: Option<f64>,
    active_requests: Option<u32>,
    queued_requests: Option<u32>,
    busy_slots: Option<u32>,
    context_tokens: Option<u32>,
    max_context: Option<u32>,
}

/// Poll OpenWebUI for chat history count and models list.
async fn poll_openwebui(
    base_url: &str,
) -> (AiServiceStatus, Option<usize>, Option<Vec<AiModelItem>>) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // Check health endpoint first
    let health_url = format!("{}/api/health", base_url);
    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let chat_history_count = None;
            let mut models_list = None;

            // Try to get models list
            let models_url = format!("{}/api/v1/models", base_url);
            if let Ok(resp) = client.get(&models_url).send().await
                && resp.status().is_success()
                && let Ok(body) = resp.text().await
                && let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body)
                && let Some(models_val) = parsed.get("data").and_then(|m| m.as_array())
            {
                models_list = Some(
                    models_val
                        .iter()
                        .filter_map(|item| {
                            item.get("id")
                                .and_then(|i| i.as_str())
                                .map(|id| AiModelItem {
                                    id: id.to_string(),
                                    name: item
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or(id)
                                        .to_string(),
                                    description: item
                                        .get("description")
                                        .and_then(|d| d.as_str())
                                        .map(String::from),
                                })
                        })
                        .collect(),
                );
            }

            let status = AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: base_url.to_string(),
                available: true,
                error_message: None,
            };

            (status, chat_history_count, models_list)
        }
        Ok(resp) => {
            let status = AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
            (status, None, None)
        }
        Err(e) => {
            let status = AiServiceStatus {
                name: "OpenWebUI".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("Connection failed: {}", e)),
            };
            (status, None, None)
        }
    }
}

/// Poll ComfyUI for health check and workflow info.
async fn poll_comfyui(base_url: &str) -> (AiServiceStatus, Option<AiComfyUiInfo>) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // Check root endpoint (ComfyUI serves web UI at root)
    match client.get(base_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let queue_size = None;
            let mut history_size = None;

            // Try to get queue info from /history/list
            let history_url = format!("{}/history/list", base_url);
            if let Ok(hresp) = client.get(&history_url).send().await
                && hresp.status().is_success()
                && let Ok(body) = hresp.text().await
                && let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body)
                && let Some(hist) = parsed.as_object()
            {
                history_size = Some(hist.len());
            }

            let info = AiComfyUiInfo {
                queue_size,
                history_size,
            };

            let status = AiServiceStatus {
                name: "ComfyUI".to_string(),
                endpoint: base_url.to_string(),
                available: true,
                error_message: None,
            };

            (status, Some(info))
        }
        Ok(resp) => {
            let status = AiServiceStatus {
                name: "ComfyUI".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
            (status, None)
        }
        Err(e) => {
            let status = AiServiceStatus {
                name: "ComfyUI".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("Connection failed: {}", e)),
            };
            (status, None)
        }
    }
}

/// Poll OpenCode for health check.
async fn poll_opencode(base_url: &str) -> AiServiceStatus {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // Try common health endpoints
    let urls = [
        format!("{}/api/health", base_url),
        format!("{}/health", base_url),
    ];

    for url in &urls {
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                return AiServiceStatus {
                    name: "OpenCode".to_string(),
                    endpoint: base_url.to_string(),
                    available: true,
                    error_message: None,
                };
            }
            _ => continue,
        }
    }

    // If no health endpoint works but we got a response, check if it's just not found
    let fallback_url = format!("{}/", base_url);
    match client.get(&fallback_url).send().await {
        Ok(resp) => AiServiceStatus {
            name: "OpenCode".to_string(),
            endpoint: base_url.to_string(),
            available: resp.status().is_success() || resp.status().as_u16() < 500,
            error_message: Some(format!("HTTP {}", resp.status())),
        },
        Err(e) => AiServiceStatus {
            name: "OpenCode".to_string(),
            endpoint: base_url.to_string(),
            available: false,
            error_message: Some(format!("Connection failed: {}", e)),
        },
    }
}

/// Build status string from service availability.
fn service_status_str(available: bool) -> String {
    if available {
        "online".to_string()
    } else {
        "offline".to_string()
    }
}

/// Collect all AI metrics from llama-server, OpenWebUI, OpenCode, and ComfyUI.
pub async fn collect_ai_metrics(
    llama_server_url: &str,
    openwebui_url: &str,
    opencode_url: &str,
    comfyui_url: &str,
) -> (AiMetrics, CollectorStatus) {
    let (llama_status, prom_metrics, props, latency_ms) = poll_llama_server(llama_server_url).await;
    let (openwebui_status, chat_history_count, models_list) = poll_openwebui(openwebui_url).await;
    let opencode_status = poll_opencode(opencode_url).await;
    let (comfyui_status, comfyui_info) = poll_comfyui(comfyui_url).await;

    // Collect per-process metrics for llama-server, OpenCode, and ComfyUI
    let llama_process = collect_process_metrics("llama");
    let openwebui_process =
        collect_process_metrics("open_webui").or_else(|| collect_process_metrics("open-webui"));
    let opencode_process = collect_process_metrics("opencode");
    let comfyui_process = collect_process_metrics("comfyui");

    // Compute derived metrics from Prometheus data and props. max_context comes from
    // /props and is available even when /metrics is unsupported by the server.
    let mut derived = if let Some(ref prom) = prom_metrics {
        compute_derived_metrics(prom, props.as_ref())
    } else {
        AiDerivedMetrics {
            llm_utilization_percent: None,
            kv_cache_usage_percent: None,
            prompt_buffer_usage_percent: None,
            tokens_cached: None,
            total_tokens_sent: None,
            server_time_ms: None,
            prompt_queue_size: None,
            running_prompts: None,
            swap_pending_slots: None,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            gen_tps: None,
            prompt_tps: None,
            active_requests: None,
            queued_requests: None,
            busy_slots: None,
            context_tokens: None,
            max_context: None,
        }
    };
    if derived.max_context.is_none() {
        derived.max_context = props.as_ref().and_then(|p| p.n_ctx);
    }

    // Build token usage from derived metrics
    let token_usage = if derived.prompt_tokens > 0 || derived.completion_tokens > 0 {
        Some(AiTokenUsage {
            total_tokens: derived.total_tokens,
            prompt_tokens: derived.prompt_tokens,
            completion_tokens: derived.completion_tokens,
            cached_tokens: derived.tokens_cached.unwrap_or(0),
        })
    } else {
        None
    };

    // Build KV cache stats from derived metrics
    let kv_cache_stats = derived.kv_cache_usage_percent.map(|kv_pct| {
        vec![AiKvCacheStats {
            gpu_cache_usage_pct: kv_pct,
            free_gpu_memory_mb: 0.0,
            used_gpu_memory_mb: 0.0,
        }]
    });

    // Record history point
    {
        let mut history = AI_HISTORY.lock().unwrap();
        let now = chrono::Utc::now()
            .format("%Y-%m-%d %H:%M:%S UTC")
            .to_string();

        let max_kv_pct = derived.kv_cache_usage_percent;

        history.push(AiHistoryEntry {
            point: AiHistoryPoint {
                timestamp: now,
                llama_available: Some(llama_status.available),
                openwebui_available: Some(openwebui_status.available),
                opencode_available: Some(opencode_status.available),
                comfyui_available: Some(comfyui_status.available),
                kv_cache_max_pct: max_kv_pct,
                gen_tps: derived.gen_tps,
                prompt_tps: derived.prompt_tps,
                active_requests: derived.active_requests,
                queued_requests: derived.queued_requests,
                context_tokens: derived.context_tokens,
            },
            inserted_at: std::time::Instant::now(),
        });

        // Prune old entries beyond retention window
        let cutoff = std::time::Instant::now()
            .checked_sub(std::time::Duration::from_secs(HISTORY_RETENTION_SECONDS))
            .unwrap_or_else(std::time::Instant::now);

        history.retain(|entry| entry.inserted_at >= cutoff);
    }

    // Determine collector status based on availability of services
    let any_available = llama_status.available
        || openwebui_status.available
        || opencode_status.available
        || comfyui_status.available;
    let status = if any_available {
        CollectorStatus::Ok
    } else {
        CollectorStatus::Partial("All AI services unavailable".to_string())
    };

    let metrics = AiMetrics {
        llama_server_status_str: service_status_str(llama_status.available),
        openwebui_status_str: service_status_str(openwebui_status.available),
        opencode_status_str: service_status_str(opencode_status.available),
        comfyui_status_str: service_status_str(comfyui_status.available),
        llama_server: llama_status,
        openwebui: openwebui_status,
        opencode: opencode_status,
        comfyui: comfyui_status,
        llm_utilization_percent: derived.llm_utilization_percent,
        kv_cache_usage_percent: derived.kv_cache_usage_percent,
        prompt_buffer_usage_percent: derived.prompt_buffer_usage_percent,
        tokens_cached: derived.tokens_cached,
        total_tokens_sent: derived.total_tokens_sent,
        server_time_ms: derived.server_time_ms,
        prompt_queue_size: derived.prompt_queue_size,
        running_prompts: derived.running_prompts,
        swap_pending_slots: derived.swap_pending_slots,
        token_usage,
        kv_cache_stats,
        chat_history_count,
        models: models_list,
        llama_server_latency_ms: latency_ms,
        gen_tps: derived.gen_tps,
        prompt_tps: derived.prompt_tps,
        active_requests: derived.active_requests,
        queued_requests: derived.queued_requests,
        busy_slots: derived.busy_slots,
        context_tokens: derived.context_tokens,
        max_context: derived.max_context,
        model_alias: props.as_ref().and_then(|p| p.model_alias.clone()),
        model_path: props.as_ref().and_then(|p| p.model_path.clone()),
        total_slots: props.as_ref().and_then(|p| p.total_slots),
        build_info: props.as_ref().and_then(|p| p.build_info.clone()),
        endpoint_metrics: props.as_ref().and_then(|p| p.endpoint_metrics),
        webui: props.as_ref().and_then(|p| p.webui),
        vision: props.as_ref().and_then(|p| p.vision),
        video: props.as_ref().and_then(|p| p.video),
        audio: props.as_ref().and_then(|p| p.audio),
        temperature: props.as_ref().and_then(|p| p.temperature),
        top_k: props.as_ref().and_then(|p| p.top_k),
        top_p: props.as_ref().and_then(|p| p.top_p),
        repeat_penalty: props.as_ref().and_then(|p| p.repeat_penalty),
        llama_server_process: llama_process,
        openwebui_process,
        opencode_process,
        comfyui_process,
        comfyui_info,
    };

    (metrics, status)
}

/// Get the AI metrics history buffer.
pub fn collect_ai_history() -> Vec<AiHistoryPoint> {
    let history = AI_HISTORY.lock().unwrap();
    history.iter().map(|entry| entry.point.clone()).collect()
}
