// Shared TypeScript interfaces that mirror the Rust backend models.

export interface CpuCoreInfo {
  core_id: number;
  utilization_percent: number;
}

export interface CpuMetrics {
  utilization_percent: number;
  temperature_celsius: number;
  cores: CpuCoreInfo[];
  frequency_mhz: number;
}

export interface MemoryMetrics {
  total_gb: number;
  used_gb: number;
  utilization_percent: number;
  swap_total_gb: number;
  swap_used_gb: number;
}

export interface GpuMetrics {
  name: string;
  driver_version: string;
  utilization_percent: number;
  temperature_celsius: number;
  vram_used_gb: number;
  vram_total_gb: number;
  power_usage_watts: number;
  power_limit_watts: number;
}

export interface StorageMetrics {
  device: string;
  mount_point: string;
  filesystem: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  utilization_percent: number;
}

export interface DiskIOStats {
   reads: number;
   writes: number;
   read_sectors: number;
   write_sectors: number;
   read_bytes_per_sec: number;
   write_bytes_per_sec: number;
   read_iops: number;
   write_iops: number;
   utilization_percent: number;
 }

export interface DeviceStorageInfo {
  device: string;
  io_stats: DiskIOStats | null;
  mounts: StorageMetrics[];
  temperature_celsius?: number | null;
}

export interface SystemMetrics {
  hostname: string;
  uptime_seconds: number;
  uptime_human: string;
  last_update: string;
  kernel: string;
  os_name: string;
}

export interface MetricHistoryPoint {
   slot: number;
   timestamp: Date;
   value: number | null;
 }

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

export interface StorageHistoryPoint {
   device: string;
   slot: number;
   timestamp: string;
   read_bytes_per_sec: number | null;
   write_bytes_per_sec: number | null;
   utilization: number | null;
}

export enum AlertSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

export interface AiServiceStatus {
  name: string;
  endpoint: string;
  available: boolean;
  error_message?: string;
}

export interface AiTokenUsage {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
}

export interface AiKvCacheStats {
  gpu_cache_usage_pct: number;
  free_gpu_memory_mb: number;
  used_gpu_memory_mb: number;
}

export interface AiModelItem {
  id: string;
  name: string;
  description?: string;
}

export interface ProcessMetrics {
  pid: number;
  cpu_percent: number;
  memory_kb: number;
  uptime_seconds: number;
}

export type ServiceStatus = 'online' | 'offline';

export interface AiComfyUiInfo {
  queue_size?: number | null;
  history_size?: number | null;
}

export interface AiMetrics {
  llama_server: AiServiceStatus;
  openwebui: AiServiceStatus;
  opencode: AiServiceStatus;
  comfyui: AiServiceStatus;
  llama_server_status: ServiceStatus;
  openwebui_status: ServiceStatus;
  opencode_status: ServiceStatus;
  comfyui_status: ServiceStatus;
  llm_utilization_percent: number | null;
  kv_cache_usage_percent: number | null;
  prompt_buffer_usage_percent: number | null;
  tokens_cached: number | null;
  total_tokens_sent: number | null;
  server_time_ms: number | null;
  prompt_queue_size: number | null;
  running_prompts: number | null;
  swap_pending_slots: number | null;
  token_usage: AiTokenUsage | null;
  kv_cache_stats: AiKvCacheStats[] | null;
  models: AiModelItem[] | null;
  llama_server_latency_ms: number | null;
   // Operational metrics from /metrics endpoint
    gen_tps: number | null;
    prompt_tps: number | null;
    active_requests: number | null;
    queued_requests: number | null;
    busy_slots: number | null;
    context_tokens: number | null;
    max_context: number | null;

    // Props from /props endpoint
    model_alias?: string | null;
    model_path?: string | null;
    total_slots?: number | null;
    build_info?: string | null;
    endpoint_metrics?: boolean | null;
    webui?: boolean | null;
    vision?: boolean | null;
    video?: boolean | null;
    audio?: boolean | null;
    temperature?: number | null;
    top_k?: number | null;
    top_p?: number | null;
    repeat_penalty?: number | null;

    // Per-process metrics
    llama_server_process?: ProcessMetrics | null;
    opencode_process?: ProcessMetrics | null;
    openwebui_process?: ProcessMetrics | null;
    comfyui_process?: ProcessMetrics | null;
    comfyui_info?: AiComfyUiInfo | null;
}

export interface AiHistoryEntry {
  timestamp: string;
  llama_available?: boolean;
  openwebui_available?: boolean;
  opencode_available?: boolean;
  comfyui_available?: boolean;
  kv_cache_max_pct?: number;
  gen_tps?: number;
  prompt_tps?: number;
  active_requests?: number;
  queued_requests?: number;
  context_tokens?: number;
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  subsystem: string;
  message: string;
}

export interface AiSettings {
  llama_server_url: string;
  openwebui_url: string;
  opencode_url: string;
  comfyui_url: string;
}

export interface TestConnectionResult {
  url: string;
  available: boolean;
  error_message?: string;
}

export interface DirectoryEntry {
  name: string;
  is_dir: boolean;
}

export interface GitInfo {
  branch?: string;
  commit_hash?: string;
}

export interface BuildDirStatus {
  exists: boolean;
  last_modified?: string;
}

export interface ExecutableInfo {
  name: string;
  path: string;
  exists: boolean;
}

export interface SavedCommand {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface TerminalSpawnResponse {
  pid: number;
  pts_name: string;
}

export interface DirectoryInfo {
  git_info?: GitInfo | null;
  build_status: BuildDirStatus;
  executables: ExecutableInfo[];
  validation: string[];
}

export interface RepoInfo {
  readme_url?: string | null;
  version?: string | null;
  local_build_tag?: string | null;
  latest_build_tag?: string | null;
}

