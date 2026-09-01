//! AI metrics collector for llama-server, `OpenWebUI`, and `OpenCode` monitoring.

use crate::collectors::alerts::CollectorStatus;
use crate::models::ai::{ProcessMetrics, AiHistoryPoint, LlamaMetrics, LlamaProps, AiServiceStatus, AiModelItem, AiComfyUiInfo, AiMetrics, AiTokenUsage, AiKvCacheStats};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

const HISTORY_RETENTION_SECONDS: u64 = 120;

/// Previous (`proc_ticks`, `sys_ticks`, `process_starttime_ticks`) sample per pid,
/// used to compute CPU% from a DELTA between two polls — the only correct
/// way to derive "current" usage from /proc's cumulative counters (every
/// real tool — top, ps — requires two samples for exactly this reason).
/// The OLD formula divided the process's cumulative ticks since ITS start
/// by the system's cumulative ticks since BOOT — two different-length time
/// windows. On a session with a fresh process (minutes old) on a long-lived
/// system (hours/days up), that mismatch produced numbers with no physical
/// meaning: 82.2%, 3.4%, and 1238.0% were all observed for the SAME process
/// across one session, direction and magnitude both arbitrary — the
/// signature of two mismatched clocks, not a real percentage.
/// `process_starttime_ticks` guards against pid reuse: if a NEW process
/// inherits an old pid, its /proc starttime differs from whatever was
/// cached, so the stale sample is discarded instead of computing a
/// delta across two unrelated processes.
/// pid -> (`process_ticks`, `system_ticks`, `process_starttime_ticks`).
type PrevCpuSamples = HashMap<u32, (u64, u64, u64)>;

static PREV_CPU_SAMPLE: LazyLock<Mutex<PrevCpuSamples>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Pure CPU% from two ticks samples of the same process and system, taken
/// some real interval apart. No I/O, no global state — testable with plain
/// numbers. Returns 0.0 if the deltas can't produce a meaningful ratio
/// (e.g. the very first sample for a pid, or a zero/negative system delta,
/// which would otherwise divide by zero or go negative).
#[allow(clippy::cast_precision_loss)]
fn cpu_percent_from_deltas(
    prev_proc_ticks: u64,
    curr_proc_ticks: u64,
    prev_sys_ticks: u64,
    curr_sys_ticks: u64,
    num_cpus: f64,
) -> f64 {
    let proc_delta = curr_proc_ticks.saturating_sub(prev_proc_ticks) as f64;
    let sys_delta = curr_sys_ticks.saturating_sub(prev_sys_ticks) as f64;
    if sys_delta <= 0.0 || num_cpus <= 0.0 {
        return 0.0;
    }
    // CONVENTION: percent of TOTAL MACHINE capacity (0–100), not top-style
    // per-core percent (where each saturated thread adds 100%). The
    // original delta fix used top convention — mathematically correct,
    // but llama-server with `-t 14` then reads a rock-steady ~1400.8%
    // (14 saturated threads x 100%), which (a) looks broken to anyone
    // not thinking in top's units, (b) blows out the footer sparkline's
    // fixed 0–100 domain, and (c) is inconsistent with how this same
    // footer shows RAM (percent of machine total, user-ruled). sys_delta
    // is already the sum across ALL cpus for the interval, so the plain
    // ratio proc/sys IS the fraction of the whole machine — num_cpus is
    // no longer needed as a factor, only retained as a guard against a
    // nonsensical zero-cpu input. 14 busy threads of 32 now reads ~43.8%,
    // matching System Monitor's divided-by-cpu-count mode (the 40.73%
    // the user compared against).
    ((proc_delta / sys_delta) * 100.0).max(0.0)
}

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
                && exe_name.contains(name_pattern)
            {
                pids.push(pid);
                continue;
            }

            if let Ok(cmdline) = std::fs::read_to_string(path.join("cmdline"))
                && cmdline.replace('\0', " ").contains(name_pattern)
            {
                pids.push(pid);
            }
        }
    }
    pids
}

/// Find llama-server's PID by matching its configured --port, not by
/// scanning every process on the system for a name substring.
///
/// `find_process_pids("llama")` — used as the fallback below — matches
/// ANYTHING whose exe or cmdline merely CONTAINS "llama" anywhere on the
/// system, with no ordering guarantee, and `collect_process_metrics` took
/// whichever match came first. On a session that had already cycled
/// through five different llama-server PIDs (model restarts), an
/// orphaned process from an earlier run that never fully exited could
/// silently be the one whose stats get reported instead of the current
/// one — user-reported: System Monitor showed the real, current process
/// at 40.73% CPU / 8.8GB RAM while the dashboard showed 1202.0% / 14.34GB
/// for the SAME moment, a gap too large to be explained by Step O's
/// formula fix alone.
///
/// This is the SAME matching logic already proven correct elsewhere in
/// this codebase (`api::launcher::find_llama_server_pid_by_port`, used by
/// the RUN MODELS table's own VRAM lookup, confirmed against nvidia-smi's
/// real output) — reimplemented here against raw /proc rather than
/// threading a `sysinfo::System` into this file's hot polling path, which
/// would add a full process-table refresh cost to every single poll.
///
/// Deliberately NOT applied to `find_process_pids`/`collect_process_metrics`
/// generically: `OpenWebUI` is a python/uvicorn process whose `exe` symlink
/// doesn't reflect the meaningful name at all (see this file's own doc
/// comment on `find_process_pids`), so a port-based llama-server-specific
/// matcher is not a safe drop-in replacement for the generic scan used by
/// the other three services.
fn find_llama_pid_by_port(port: u16) -> Option<u32> {
    let port_str = port.to_string();
    let entries = std::fs::read_dir("/proc").ok()?;
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

        let is_llama_server = std::fs::read_link(path.join("exe"))
            .ok()
            .and_then(|exe| exe.file_name().and_then(|n| n.to_str()).map(String::from))
            .is_some_and(|name| name.contains("llama-server"));
        if !is_llama_server {
            continue;
        }

        if let Ok(cmdline) = std::fs::read_to_string(path.join("cmdline")) {
            let args: Vec<&str> = cmdline.split('\0').filter(|s| !s.is_empty()).collect();
            let has_matching_port = args
                .windows(2)
                .any(|w| w[0] == "--port" && w[1] == port_str);
            if has_matching_port {
                return Some(pid);
            }
        }
    }
    None
}

/// Process memory in kB from a /proc/[pid]/status document, using the same
/// semantics GNOME System Monitor's "Memory" column uses: PRIVATE resident
/// memory (`RssAnon`), not raw `VmRSS`.
///
/// User-reported: the footer showed 13.11 GB while System Monitor showed
/// 7.1 GB for the same llama-server at the same moment. Both numbers are
/// "real" — `VmRSS` = `RssAnon` + `RssFile` + `RssShmem`, and for a CUDA process
/// the file/shared components include ~6 GB of driver and device mappings
/// that aren't memory the process meaningfully owns (System Monitor
/// subtracts them: resident − shared). Reporting `RssAnon` makes the
/// dashboard agree with the tool the user checks against, and better
/// answers the question the tile is actually asking ("how much RAM is
/// this model using"). Falls back to `VmRSS` only if `RssAnon` is absent
/// (pre-4.5 kernels — not this project's machines, but free robustness).
pub(crate) fn process_mem_kb_from_status(status_content: &str) -> f64 {
    let field = |name: &str| -> Option<f64> {
        status_content
            .lines()
            .find(|l| l.starts_with(name))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|v| v.parse::<f64>().ok())
    };
    field("RssAnon:").or_else(|| field("VmRSS:")).unwrap_or(0.0)
}

/// Read CPU and memory usage for a given PID from /proc/[pid]/stat and /proc/[pid]/status
#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn read_process_metrics(pid: u32) -> Option<ProcessMetrics> {
    // Read /proc/[pid]/stat
    let stat_path = format!("/proc/{pid}/stat");
    let stat_content = std::fs::read_to_string(&stat_path).ok()?;
    let fields: Vec<&str> = stat_content.split_whitespace().collect();
    if fields.len() < 36 {
        return None;
    }

    // Parse utime and stime (fields 14 and 15, 0-indexed)
    let utime: f64 = fields[13].parse().ok()?;
    let stime: f64 = fields[14].parse().ok()?;
    let total_time = utime + stime;

    // Read /proc/[pid]/status for process memory — RssAnon semantics, see
    // process_mem_kb_from_status's doc comment for why (matches System
    // Monitor; raw VmRSS overstated a CUDA process by ~6 GB of driver
    // mappings).
    let status_path = format!("/proc/{pid}/status");
    let status_content = std::fs::read_to_string(&status_path).ok()?;
    let vmem_rss_kb: f64 = process_mem_kb_from_status(&status_content);

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

    // Get number of CPUs for normalization by counting cpuN lines in /proc/stat
    let num_cpus = sys_stat
        .lines()
        .filter(|l| {
            l.len() > 3
                && l.starts_with("cpu")
                && l.as_bytes().get(3).is_some_and(u8::is_ascii_digit)
        })
        .count()
        .max(1) as f64;

    // Get process start time (field 22, 1-indexed / fields[21] 0-indexed) —
    // read here (moved up from below) because it's now also used as the
    // pid-reuse guard for the CPU delta cache: a NEW process that happens
    // to inherit an old pid will have a DIFFERENT starttime, so a stale
    // cached sample from the previous occupant of this pid gets discarded
    // instead of producing a nonsense delta across two unrelated processes.
    let starttime: u64 = fields[21].parse().ok()?;

    // CPU% via DELTA between this poll and the previous one for this pid —
    // see PREV_CPU_SAMPLE's doc comment for why: a single point-in-time
    // read of cumulative /proc counters cannot yield "current" usage.
    let cpu_percent = {
        // Safety valve against unbounded growth: this map is only ever
        // populated by the 4 named services this file tracks (llama,
        // OpenWebUI, OpenCode, ComfyUI), so it should never realistically
        // hold more than a handful of entries — one per service, growing
        // only across process restarts. In a backend meant to run
        // indefinitely, a permanent entry-per-restart-ever IS a genuine
        // (if very slow) unbounded leak with no natural eviction otherwise
        // (a pid, once inserted, is never removed just because that
        // process exited). Rather than track process liveness explicitly
        // (extra filesystem calls on the hot polling path for a
        // slow-growing, low-stakes map), a coarse ceiling far above any
        // realistic size is a cheap, honest correctness net: if it's ever
        // exceeded, something is wrong (e.g. this cache being fed
        // unexpected/unbounded pids), and clearing it just means one
        // extra 0.0 reading while it refills — the same harmless
        // first-poll state every entry already goes through normally.
        const MAX_TRACKED_PIDS: usize = 64;
        let mut cache = PREV_CPU_SAMPLE.lock().unwrap();
        if cache.len() > MAX_TRACKED_PIDS {
            cache.clear();
        }
        let prev = cache.get(&pid).copied();
        let curr_proc_ticks = total_time as u64;
        // Always store the current sample for the NEXT poll to diff
        // against, regardless of whether this poll could itself produce
        // a percentage.
        cache.insert(pid, (curr_proc_ticks, total_sys_time as u64, starttime));
        match prev {
            Some((prev_proc, prev_sys, prev_starttime)) if prev_starttime == starttime => {
                cpu_percent_from_deltas(
                    prev_proc,
                    curr_proc_ticks,
                    prev_sys,
                    total_sys_time as u64,
                    num_cpus,
                )
            }
            // First poll ever seen for this pid, OR the pid was reused by
            // a different process since the last sample (starttime
            // mismatch) — report 0.0 rather than a wrong number; the next
            // poll (a few seconds away) will have a real delta to work with.
            _ => 0.0,
        }
    };
    let clk_tck = unsafe { libc::sysconf(libc::_SC_CLK_TCK) as u64 };
    let uptime_seconds = read_uptime_seconds();
    let process_start_sec = starttime as f64 / clk_tck as f64;
    let process_uptime = if uptime_seconds > process_start_sec {
        uptime_seconds - process_start_sec
    } else {
        0.0
    };

    let (vram_mb, gpu_util_percent) = crate::collectors::gpu::query_process_gpu_stats(pid);

    Some(ProcessMetrics {
        pid,
        cpu_percent: (cpu_percent * 10.0).round() / 10.0,
        memory_kb: vmem_rss_kb as u64,
        uptime_seconds: process_uptime.round(),
        vram_mb,
        gpu_util_percent,
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

static AI_HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("failed to build AI HTTP client")
});

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
            "llamacpp:spec_decode_num_draft_tokens_total" => m.spec_draft_tokens_total = value,
            "llamacpp:spec_decode_num_accepted_tokens_total" => m.spec_accepted_tokens_total = value,
            "llamacpp:prompt_tokens_cached_total" => m.prompt_tokens_cached_total = value,
            _ => {}
        }
    }
    m
}

/// Parse JSON /props endpoint from llama-server.
///
/// Generation defaults (`temperature/top_k/top_p/repeat_penalty`) and `n_ctx` are nested
/// under `default_generation_settings.params` / `default_generation_settings.n_ctx`,
/// and modality flags are nested under `modalities`. Fields are read independently so a
/// missing/renamed field doesn't blank out the whole response.
#[allow(clippy::cast_possible_truncation)]
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
            .and_then(serde_json::Value::as_u64)
            .and_then(|v| u32::try_from(v).ok()),
        total_slots: val
            .get("total_slots")
            .and_then(serde_json::Value::as_u64)
            .and_then(|v| u32::try_from(v).ok()),
        build_info: val
            .get("build_info")
            .and_then(|v| v.as_str())
            .map(String::from),
        endpoint_metrics: val.get("endpoint_metrics").and_then(serde_json::Value::as_bool),
        webui: val
            .get("webui")
            .or_else(|| val.get("ui"))
            .and_then(serde_json::Value::as_bool),
        vision: val
            .get("vision")
            .or_else(|| modalities.and_then(|m| m.get("vision")))
            .and_then(serde_json::Value::as_bool),
        video: val
            .get("video")
            .or_else(|| modalities.and_then(|m| m.get("video")))
            .and_then(serde_json::Value::as_bool),
        audio: val
            .get("audio")
            .or_else(|| modalities.and_then(|m| m.get("audio")))
            .and_then(serde_json::Value::as_bool),
        temperature: val
            .get("temperature")
            .or_else(|| params.and_then(|p| p.get("temperature")))
            .and_then(serde_json::Value::as_f64),
        top_k: val
            .get("top_k")
            .or_else(|| params.and_then(|p| p.get("top_k")))
            .and_then(serde_json::Value::as_i64)
            .map(|v| v as i32),
        top_p: val
            .get("top_p")
            .or_else(|| params.and_then(|p| p.get("top_p")))
            .and_then(serde_json::Value::as_f64),
        repeat_penalty: val
            .get("repeat_penalty")
            .or_else(|| params.and_then(|p| p.get("repeat_penalty")))
            .and_then(serde_json::Value::as_f64),
        frequency_penalty: params
            .and_then(|p| p.get("frequency_penalty"))
            .and_then(serde_json::Value::as_f64),
        repeat_last_n: params
            .and_then(|p| p.get("repeat_last_n"))
            .and_then(serde_json::Value::as_i64)
            .map(|v| v as i32),
        seed: params.and_then(|p| p.get("seed")).and_then(serde_json::Value::as_u64),
        reasoning_format: params
            .and_then(|p| p.get("reasoning_format"))
            .and_then(|v| v.as_str())
            .map(String::from),
        samplers: params
            .and_then(|p| p.get("samplers"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            }),
        speculative: None,
        context_tokens: None,
        chat_template_caps: {
            let caps = val.get("chat_template_caps");
            caps.map(|c| crate::models::ai::ChatTemplateCapsRaw {
                supports_reasoning_effort: c
                    .get("supports_reasoning_effort")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                supports_preserve_reasoning: c
                    .get("supports_preserve_reasoning")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                supports_tools: c
                    .get("supports_tools")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
            })
        },
        n_ctx_train: None,
    })
}

/// Poll llama-server for health, /metrics, and /props data.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
async fn poll_llama_server(
    base_url: &str,
) -> (
    AiServiceStatus,
    Option<LlamaMetrics>,
    Option<LlamaProps>,
    Option<Vec<crate::models::ai::LlamaSlot>>,
    Option<f64>,
) {
    let client = &*AI_HTTP_CLIENT;

    // Check health endpoint with latency measurement
    let health_url = format!("{base_url}/health");
    let start = std::time::Instant::now();
    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

            // Fetch /metrics endpoint for Prometheus data
            let metrics_url = format!("{base_url}/metrics");
            let metrics = match client.get(&metrics_url).send().await {
                Ok(mresp) if mresp.status().is_success() => match mresp.text().await {
                    Ok(body) => Some(parse_prometheus_metrics(&body)),
                    Err(_) => None,
                },
                _ => None,
            };

            // Fetch /props endpoint for model and server info
            let props_url = format!("{base_url}/props");
            let mut props = match client.get(&props_url).send().await {
                Ok(presp) if presp.status().is_success() => match presp.text().await {
                    Ok(body) => parse_props(&body),
                    Err(_) => None,
                },
                _ => None,
            };

            // Fetch /slots for speculative decoding status and per-slot state
            let mut slot_list: Vec<crate::models::ai::LlamaSlot> = Vec::new();
            if let Some(ref mut p) = props {
                let slots_url = format!("{base_url}/slots");
                if let Ok(sresp) = client.get(&slots_url).send().await
                    && sresp.status().is_success()
                    && let Ok(body) = sresp.text().await
                    && let Ok(slots_val) = serde_json::from_str::<serde_json::Value>(&body)
                {
                    p.speculative = slots_val
                        .as_array()
                        .and_then(|arr| arr.first())
                        .and_then(|slot| slot.get("speculative"))
                        .and_then(serde_json::Value::as_bool);
                    p.context_tokens = slots_val.as_array().map(|arr| {
                        arr.iter()
                            .filter_map(|slot| slot.get("n_prompt_tokens").and_then(serde_json::Value::as_u64))
                            .sum::<u64>() as u32
                    });

                    // Parse per-slot fields for frontend bindings using real /slots keys
                    if let Some(arr) = slots_val.as_array() {
                        for (idx, slot) in arr.iter().enumerate() {
                            let id = idx as u32;
                            let n_ctx =
                                slot.get("n_ctx").and_then(serde_json::Value::as_u64).map(|v| v as u32);
                            let n_prompt_tokens = slot
                                .get("n_prompt_tokens")
                                .and_then(serde_json::Value::as_u64)
                                .map(|v| v as u32);
                            let is_processing = slot.get("is_processing").and_then(serde_json::Value::as_bool);
                            // n_decoded/n_remain live in next_token[0]; n_predict in params
                            let next_tok = slot
                                .get("next_token")
                                .and_then(|v| v.as_array())
                                .and_then(|a| a.first());
                            let n_decoded = next_tok
                                .and_then(|t| t.get("n_decoded"))
                                .and_then(serde_json::Value::as_u64)
                                .map(|v| v as u32);
                            let n_remain = next_tok
                                .and_then(|t| t.get("n_remain"))
                                .and_then(serde_json::Value::as_i64)
                                .map(|v| v as i32);
                            let n_prompt_tokens_cache =
                                slot.get("n_prompt_tokens_cache").and_then(serde_json::Value::as_u64);
                            let n_predict = slot
                                .get("params")
                                .and_then(|p| p.get("n_predict"))
                                .and_then(serde_json::Value::as_i64)
                                .map(|v| if v > 0 { v as u32 } else { 0 });

                            if n_prompt_tokens.is_some() || is_processing.is_some() {
                                slot_list.push(crate::models::ai::LlamaSlot {
                                    id,
                                    n_ctx,
                                    n_prompt_tokens,
                                    is_processing,
                                    n_decoded,
                                    n_remain,
                                    n_prompt_tokens_cache,
                                    n_predict,
                                });
                            }
                        }
                    }
                }
            }

            // Fetch /v1/models for n_ctx_train (not available on /props).
            if let Some(ref mut p) = props {
                let models_url = format!("{base_url}/v1/models");
                if let Ok(mresp) = client.get(&models_url).send().await
                    && mresp.status().is_success()
                    && let Ok(body) = mresp.text().await
                    && let Ok(val) = serde_json::from_str::<serde_json::Value>(&body)
                {
                    p.n_ctx_train = val
                        .get("data")
                        .and_then(|d| d.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|m| m.get("meta"))
                        .and_then(|meta| meta.get("n_ctx_train"))
                        .and_then(serde_json::Value::as_u64)
                        .map(|v| v as u32);
                }
            }

            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: true,
                error_message: None,
            };

            (status, metrics, props, Some(slot_list), Some(latency_ms))
        }
        Ok(resp) => {
            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
            (status, None, None, None, None)
        }
        Err(e) => {
            let status = AiServiceStatus {
                name: "llama-server".to_string(),
                endpoint: base_url.to_string(),
                available: false,
                error_message: Some(format!("Connection failed: {e}")),
            };
            (status, None, None, None, None)
        }
    }
}

/// Compute derived metrics from raw Prometheus data and /props info.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
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
        tokens_cached: None,
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
        context_tokens: None,
        max_context: props.and_then(|p| p.n_ctx),
        n_tokens_max: if prom.n_tokens_max > 0.0 {
            Some(prom.n_tokens_max as i64)
        } else {
            None
        },
        spec_draft_tokens: if prom.spec_draft_tokens_total > 0.0 {
            Some(prom.spec_draft_tokens_total as i64)
        } else {
            None
        },
        spec_accepted_tokens: if prom.spec_accepted_tokens_total > 0.0 {
            Some(prom.spec_accepted_tokens_total as i64)
        } else {
            None
        },
        prompt_tokens_cached: if prom.prompt_tokens_cached_total > 0.0 {
            Some(prom.prompt_tokens_cached_total as i64)
        } else {
            None
        },
        n_decode_total: if prom.n_decode_total > 0.0 {
            Some(prom.n_decode_total as i64)
        } else {
            None
        },
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
    n_tokens_max: Option<i64>,
    spec_draft_tokens: Option<i64>,
    spec_accepted_tokens: Option<i64>,
    prompt_tokens_cached: Option<i64>,
    n_decode_total: Option<i64>,
}

/// Poll `OpenWebUI` for chat history count and models list.
async fn poll_openwebui(
    base_url: &str,
) -> (AiServiceStatus, Option<usize>, Option<Vec<AiModelItem>>) {
    let client = &*AI_HTTP_CLIENT;

    // Check health endpoint first
    let health_url = format!("{base_url}/api/health");
    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let chat_history_count = None;
            let mut models_list = None;

            // Try to get models list
            let models_url = format!("{base_url}/api/v1/models");
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
                error_message: Some(format!("Connection failed: {e}")),
            };
            (status, None, None)
        }
    }
}

/// Poll `ComfyUI` for health check and workflow info.
async fn poll_comfyui(base_url: &str) -> (AiServiceStatus, Option<AiComfyUiInfo>) {
    let client = &*AI_HTTP_CLIENT;

    // Check root endpoint (ComfyUI serves web UI at root)
    match client.get(base_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let queue_size = None;
            let mut history_size = None;

            // Try to get queue info from /history/list
            let history_url = format!("{base_url}/history/list");
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
                error_message: Some(format!("Connection failed: {e}")),
            };
            (status, None)
        }
    }
}

/// Poll `OpenCode` for health check.
async fn poll_opencode(base_url: &str) -> AiServiceStatus {
    let client = &*AI_HTTP_CLIENT;

    // Try common health endpoints
    let urls = [
        format!("{base_url}/api/health"),
        format!("{base_url}/health"),
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
            _ => {}
        }
    }

    // If no health endpoint works but we got a response, check if it's just not found
    let fallback_url = format!("{base_url}/");
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
            error_message: Some(format!("Connection failed: {e}")),
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

/// Collect all AI metrics from llama-server, `OpenWebUI`, `OpenCode`, and `ComfyUI`.
#[allow(clippy::cast_precision_loss)]
pub async fn collect_ai_metrics(
    llama_server_url: &str,
    openwebui_url: &str,
    opencode_url: &str,
    comfyui_url: &str,
) -> (AiMetrics, CollectorStatus) {
    let (llama_status, prom_metrics, props, slot_list, latency_ms) =
        poll_llama_server(llama_server_url).await;
    let (openwebui_status, chat_history_count, models_list) = poll_openwebui(openwebui_url).await;
    let opencode_status = poll_opencode(opencode_url).await;
    let (comfyui_status, comfyui_info) = poll_comfyui(comfyui_url).await;

    let running_script = crate::api::launcher::get_running_script();

    let gpu_offload = running_script
        .as_deref()
        .and_then(crate::api::gpu_offload_parser::get_info);

    let gguf_size_gib = props
        .as_ref()
        .and_then(|p| p.model_path.as_ref())
        .and_then(|path| std::fs::metadata(path).ok())
        .map(|m| m.len() as f64 / (1024.0 * 1024.0 * 1024.0));

    let (model_load_time_ms, kv_cache_reserved_mib) = running_script
        .as_ref()
        .map_or((None, None), |script| {
            (
                crate::api::startup_info::get_load_time_ms(script),
                crate::api::startup_info::get_kv_reserved_mib(script),
            )
        });

    // Collect per-process metrics for llama-server, OpenCode, and ComfyUI
    // llama-server: resolve by the port it was actually launched with, not
    // by scanning every process on the system for a name substring (see
    // find_llama_pid_by_port's doc comment for why — user-reported wrong
    // CPU/RAM/VRAM readings traced to this). Falls back to the old
    // generic scan only if no running profile/port is currently known
    // (e.g. between polls right at startup) — preserves existing behavior
    // for that edge case rather than silently going blank.
    let llama_process = running_script
        .as_deref()
        .and_then(crate::api::launcher::get_profile_parsed_args)
        .and_then(|args| args.port)
        .and_then(find_llama_pid_by_port)
        .and_then(read_process_metrics)
        .or_else(|| collect_process_metrics("llama"));
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
            context_tokens: props.as_ref().and_then(|p| p.context_tokens),
            max_context: None,
            n_tokens_max: None,
            spec_draft_tokens: None,
            spec_accepted_tokens: None,
            prompt_tokens_cached: None,
            n_decode_total: None,
        }
    };
    if derived.max_context.is_none() {
        derived.max_context = props.as_ref().and_then(|p| p.n_ctx);
    }
    if derived.context_tokens.is_none() {
        derived.context_tokens = props.as_ref().and_then(|p| p.context_tokens);
    }

    // The `/metrics` gauges report 0 until a request *completes*, so both rate
    // tiles read blank for the whole of a long generation. llama-server's log
    // carries live rates throughout — `tg` every ~3s once 100 tokens are in,
    // and `pp` for any prompt taking 3s or more — so prefer those and keep the
    // gauge as the between-requests fallback. Same precedence TPS in Run Models
    // uses, via the same `prefer_log_rate`.
    //
    // Placed here, not in compute_derived_metrics: the rates are keyed by
    // script_path, which that function has no access to. `derived` is built
    // once above and feeds both the history buffer and the API response, so
    // this is the one site that covers both.
    if let Some(script) = running_script.as_deref() {
        let mgr = crate::api::log_manager::get_log_manager();
        derived.gen_tps =
            crate::api::log_manager::prefer_log_rate(derived.gen_tps, mgr.get_live_tg(script));
        derived.prompt_tps =
            crate::api::log_manager::prefer_log_rate(derived.prompt_tps, mgr.get_live_pp(script));
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
        n_tokens_max: derived.n_tokens_max,
        spec_draft_tokens: derived.spec_draft_tokens,
        spec_accepted_tokens: derived.spec_accepted_tokens,
        prompt_tokens_cached: derived.prompt_tokens_cached,
        n_decode_total: derived.n_decode_total,
        slots: slot_list.filter(|s| !s.is_empty()),
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
        frequency_penalty: props.as_ref().and_then(|p| p.frequency_penalty),
        repeat_last_n: props.as_ref().and_then(|p| p.repeat_last_n),
        seed: props.as_ref().and_then(|p| p.seed),
        reasoning_format: props.as_ref().and_then(|p| p.reasoning_format.clone()),
        samplers: props.as_ref().and_then(|p| p.samplers.clone()),
        speculative: props.as_ref().and_then(|p| p.speculative),
        llama_server_process: llama_process,
        openwebui_process,
        opencode_process,
        comfyui_process,
        comfyui_info,
        gpu_offload,
        model_load_time_ms,
        kv_cache_reserved_mib,
        gguf_size_gib,
        running_script_path: running_script.clone(),
        n_ctx_train: props.as_ref().and_then(|p| p.n_ctx_train),
    };

    (metrics, status)
}

/// Get the AI metrics history buffer.
pub fn collect_ai_history() -> Vec<AiHistoryPoint> {
    let history = AI_HISTORY.lock().unwrap();
    history.iter().map(|entry| entry.point.clone()).collect()
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    // ── parse_prometheus_metrics ──────────────────────────────────────────────

    #[test]
    fn test_prometheus_valid_fields() {
        let body = "llamacpp:prompt_tokens_total 1234\n\
llamacpp:tokens_predicted_total 567\n\
llamacpp:predicted_tokens_seconds 42.5\n\
llamacpp:requests_processing 2\n";
        let m = parse_prometheus_metrics(body);
        assert_eq!(m.prompt_tokens_total, 1234.0);
        assert_eq!(m.tokens_predicted_total, 567.0);
        assert_eq!(m.predicted_tokens_per_second, 42.5);
        assert_eq!(m.requests_processing, 2.0);
    }

    #[test]
    fn test_prometheus_empty_body_returns_defaults() {
        let m = parse_prometheus_metrics("");
        assert_eq!(m.prompt_tokens_total, 0.0);
        assert_eq!(m.tokens_predicted_total, 0.0);
        assert_eq!(m.requests_processing, 0.0);
    }

    #[test]
    fn test_prometheus_comment_lines_skipped() {
        let body = "# HELP llamacpp:prompt_tokens_total count\n\
# TYPE llamacpp:prompt_tokens_total counter\n";
        let m = parse_prometheus_metrics(body);
        assert_eq!(m.prompt_tokens_total, 0.0);
    }

    #[test]
    fn test_prometheus_unknown_fields_ignored() {
        let body = "unknown_metric 999\nllamacpp:prompt_tokens_total 100\n";
        let m = parse_prometheus_metrics(body);
        assert_eq!(m.prompt_tokens_total, 100.0);
    }

    #[test]
    fn test_prometheus_malformed_value_becomes_nan() {
        let body = "llamacpp:prompt_tokens_total not_a_number\n";
        let m = parse_prometheus_metrics(body);
        assert!(m.prompt_tokens_total.is_nan());
    }

    #[test]
    fn test_prometheus_all_known_fields() {
        let body = "llamacpp:prompt_tokens_total 100\n\
llamacpp:prompt_seconds_total 1.5\n\
llamacpp:tokens_predicted_total 200\n\
llamacpp:tokens_predicted_seconds_total 2.0\n\
llamacpp:n_decode_total 300\n\
llamacpp:n_tokens_max 4096\n\
llamacpp:prompt_tokens_seconds 66.7\n\
llamacpp:predicted_tokens_seconds 100.0\n\
llamacpp:requests_processing 1\n\
llamacpp:requests_deferred 0\n\
llamacpp:n_busy_slots_per_decode 0.5\n";
        let m = parse_prometheus_metrics(body);
        assert_eq!(m.prompt_tokens_total, 100.0);
        assert_eq!(m.prompt_seconds_total, 1.5);
        assert_eq!(m.tokens_predicted_total, 200.0);
        assert_eq!(m.tokens_predicted_seconds_total, 2.0);
        assert_eq!(m.n_decode_total, 300.0);
        assert_eq!(m.n_tokens_max, 4096.0);
        assert_eq!(m.prompt_tokens_per_second, 66.7);
        assert_eq!(m.predicted_tokens_per_second, 100.0);
        assert_eq!(m.requests_processing, 1.0);
        assert_eq!(m.requests_deferred, 0.0);
        assert_eq!(m.n_busy_slots_per_decode, 0.5);
    }

    // ── Slot JSON parsing (mirrors poll_llama_server logic) ───────────────────

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn parse_slot_value(slot: &serde_json::Value, id: u32) -> Option<crate::models::ai::LlamaSlot> {
        let n_prompt_tokens = slot
            .get("n_prompt_tokens")
            .and_then(serde_json::Value::as_u64)
            .map(|v| v as u32);
        let is_processing = slot.get("is_processing").and_then(serde_json::Value::as_bool);
        if n_prompt_tokens.is_some() || is_processing.is_some() {
            Some(crate::models::ai::LlamaSlot {
                id,
                n_ctx: slot.get("n_ctx").and_then(serde_json::Value::as_u64).map(|v| v as u32),
                n_prompt_tokens,
                is_processing,
                n_decoded: slot
                    .get("next_token")
                    .and_then(serde_json::Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(|t| t.get("n_decoded"))
                    .and_then(serde_json::Value::as_u64)
                    .map(|v| v as u32),
                n_remain: slot
                    .get("next_token")
                    .and_then(serde_json::Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(|t| t.get("n_remain"))
                    .and_then(serde_json::Value::as_i64)
                    .map(|v| v as i32),
                n_prompt_tokens_cache: slot
                    .get("n_prompt_tokens_cache")
                    .and_then(serde_json::Value::as_u64),
                n_predict: slot
                    .get("params")
                    .and_then(|p| p.get("n_predict"))
                    .and_then(serde_json::Value::as_i64)
                    .map(|v| if v > 0 { v as u32 } else { 0 }),
            })
        } else {
            None
        }
    }

    #[test]
    fn test_slot_idle_is_processing_false() {
        let json = serde_json::json!({
            "n_ctx": 4096,
            "n_prompt_tokens": 0,
            "is_processing": false,
            "next_token": [{"n_decoded": 0, "n_remain": -1}],
            "params": {"n_predict": -1}
        });
        let slot = parse_slot_value(&json, 0).expect("slot should parse");
        assert_eq!(slot.is_processing, Some(false));
        assert_eq!(slot.n_ctx, Some(4096));
    }

    #[test]
    fn test_slot_live_is_processing_true() {
        let json = serde_json::json!({
            "n_ctx": 8192,
            "n_prompt_tokens": 512,
            "is_processing": true,
            "next_token": [{"n_decoded": 128, "n_remain": 384}],
            "params": {"n_predict": 512}
        });
        let slot = parse_slot_value(&json, 0).expect("slot should parse");
        assert_eq!(slot.is_processing, Some(true));
        assert_eq!(slot.n_prompt_tokens, Some(512));
        assert_eq!(slot.n_decoded, Some(128));
    }

    #[test]
    fn test_slot_missing_fields_yields_none() {
        let json = serde_json::json!({});
        let slot = parse_slot_value(&json, 0);
        assert!(slot.is_none());
    }

    #[test]
    #[allow(clippy::cast_possible_truncation)]
    fn test_slot_empty_array_yields_no_slots() {
        let val: serde_json::Value = serde_json::from_str("[]").unwrap();
        let arr = val.as_array().unwrap();
        let slots: Vec<_> = arr
            .iter()
            .enumerate()
            .filter_map(|(i, s)| parse_slot_value(s, i as u32))
            .collect();
        assert!(slots.is_empty());
    }

    #[test]
    fn test_slot_malformed_json_does_not_panic() {
        let result = serde_json::from_str::<serde_json::Value>("not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_slot_negative_n_predict_clamped_to_zero() {
        let json = serde_json::json!({
            "n_prompt_tokens": 100,
            "is_processing": true,
            "params": {"n_predict": -1}
        });
        let slot = parse_slot_value(&json, 0).unwrap();
        assert_eq!(slot.n_predict, Some(0));
    }

    // ─── Step O: cpu_percent_from_deltas ───────────────────────────────
    // Pure function, no /proc access needed — these are genuinely runnable
    // via `cargo test`, unlike read_process_metrics/find_llama_pid_by_port
    // which touch the filesystem and need a live PID to exercise for real.

    #[test]
    fn one_fully_saturated_core_of_16_is_6_25_percent_of_machine() {
        // CONVENTION: percent of TOTAL machine (0-100), not top-style
        // per-core. 16 cpus; process accumulates 100 ticks while the
        // system-wide total (summed across all 16 cores) accumulates
        // 1600 ticks — one fully-busy core on an otherwise-idle machine.
        // 100 / 1600 * 100 = 6.25% of the whole machine.
        let pct = cpu_percent_from_deltas(0, 100, 0, 1600, 16.0);
        assert!((pct - 6.25).abs() < 0.001, "expected 6.25, got {pct}");
    }

    #[test]
    fn fourteen_saturated_threads_of_32_is_43_75_percent() {
        // The exact real-world case that motivated the convention change:
        // llama-server launched with `-t 14` on a 32-thread machine,
        // all 14 threads saturated for the interval. Old top-convention
        // read a "broken-looking" 1400%; correct machine-fraction is
        // 14/32 = 43.75% — matching System Monitor's divided mode
        // (the ~40.73% the user compared against live).
        let pct = cpu_percent_from_deltas(0, 1400, 0, 3200, 32.0);
        assert!((pct - 43.75).abs() < 0.001, "expected 43.75, got {pct}");
    }

    #[test]
    fn process_mem_prefers_rss_anon_over_vmrss() {
        // The exact user-reported shape: VmRSS 13.11 GB, but ~6 GB of it
        // is file/shared driver mappings; RssAnon (7.1 GB-ish) is what
        // System Monitor's Memory column shows and what we now report.
        let status = "Name:\tllama-server\nVmRSS:\t13744128 kB\nRssAnon:\t7444480 kB\nRssFile:\t6299648 kB\n";
        let kb = process_mem_kb_from_status(status);
        assert!((kb - 7_444_480.0).abs() < 0.5, "expected RssAnon, got {kb}");
    }

    #[test]
    fn process_mem_falls_back_to_vmrss_when_rss_anon_absent() {
        let status = "Name:\tx\nVmRSS:\t1024 kB\n";
        assert!((process_mem_kb_from_status(status) - 1024.0).abs() < 0.5);
    }

    #[test]
    fn process_mem_is_zero_when_neither_field_exists() {
        assert_eq!(process_mem_kb_from_status("Name:\tx\n"), 0.0);
    }

    #[test]
    fn zero_proc_delta_is_zero_percent() {
        // Process did nothing between samples -> 0%, not a divide
        // artifact or a leftover value from the previous poll.
        let pct = cpu_percent_from_deltas(500, 500, 0, 1600, 16.0);
        assert_eq!(pct, 0.0);
    }

    #[test]
    fn zero_or_negative_sys_delta_returns_zero_not_a_panic() {
        // A system-ticks delta of zero (or, from a saturating_sub, an
        // impossible negative-turned-zero) must never divide-by-zero or
        // produce infinity/NaN — the honest answer when the denominator
        // is meaningless is 0.0, not a crash.
        assert_eq!(cpu_percent_from_deltas(0, 100, 1000, 1000, 16.0), 0.0);
    }

    #[test]
    fn regression_mismatched_clock_windows_no_longer_apply() {
        // The OLD (broken) formula was total_process_ticks_since_start /
        // (total_SYSTEM_ticks_since_BOOT / num_cpus) — two different-
        // length time windows, which is what produced 82.2%, 3.4%, and
        // 1238.0% for the same real process across one session. The new
        // delta-based function never sees "since start" or "since boot"
        // at all — only two close-together samples — so a long-lived
        // system (huge cumulative sys ticks) paired with a young process
        // (small cumulative proc ticks) can no longer produce a wrong
        // number just because of how old the SYSTEM happens to be.
        // Simulate: system has been up a long time (huge prior sys
        // ticks), process is young (small prior proc ticks) — the delta
        // over one real poll interval is still correctly computed from
        // ONLY what changed, not the absolute magnitudes.
        let pct = cpu_percent_from_deltas(
            10_000,     // prev proc ticks (process has some history)
            10_100,     // curr proc ticks (+100 this interval)
            50_000_000, // prev sys ticks (system has been up a long time)
            50_001_600, // curr sys ticks (+1600 this interval, 16 cpus)
            16.0,
        );
        // Same +100 proc / +1600 sys shape as the one-core case above —
        // the huge absolute sys_ticks magnitude must NOT affect the
        // result, only the delta does. (6.25% of machine under the
        // machine-fraction convention.)
        assert!((pct - 6.25).abs() < 0.001, "expected 6.25, got {pct}");
    }
}
