import {
  CpuMetrics,
  MemoryMetrics,
  GpuMetrics,
  StorageMetrics,
  DeviceStorageInfo,
  SystemMetrics,
  AiMetrics,
  AiHistoryEntry,
  AiSettings,
  TestConnectionResult,
  DirectoryEntry,
  SavedCommand,
  TerminalSpawnResponse,
  DirectoryInfo,
  RepoInfo,
  ProfileResponse,
} from "../types/metrics";

const BASE_URL = "/api";

/**
 * fetch with a hard deadline. Mirrors the backend HTTP client's stall
 * protection (2s reqwest timeout): without a deadline, a stalled backend
 * stacks 2Hz polls behind the browser's per-host connection limit without
 * bound. Hot-path polls use 1500ms; one-shot calls use 8000ms.
 */
export function fetchWithTimeout(
  input: RequestInfo,
  ms: number,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function fetchMetrics<T>(endpoint: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE_URL}${endpoint}`, 8000);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as T;
}

export async function getCpuMetrics(): Promise<CpuMetrics> {
  return fetchMetrics<CpuMetrics>("/metrics/cpu");
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  return fetchMetrics<MemoryMetrics>("/metrics/memory");
}

export async function getGpuMetrics(): Promise<GpuMetrics> {
  return fetchMetrics<GpuMetrics>("/metrics/gpu");
}

export async function getStorageMetrics(): Promise<StorageMetrics[]> {
  return fetchMetrics<StorageMetrics[]>("/metrics/storage");
}

export async function getStorageDevices(): Promise<DeviceStorageInfo[]> {
  return fetchMetrics<DeviceStorageInfo[]>("/metrics/storage/devices");
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return fetchMetrics<SystemMetrics>("/metrics/system");
}

export async function checkHealth(): Promise<boolean> {
  const res = await fetchWithTimeout(`${BASE_URL}/health`, 8000);
  return res.ok;
}

export async function getAiMetrics(): Promise<AiMetrics> {
  return fetchMetrics<AiMetrics>("/ai/metrics");
}

export async function getAiHistory(): Promise<AiHistoryEntry[]> {
  return fetchMetrics<AiHistoryEntry[]>("/ai/history");
}

export async function getAiSettings(): Promise<AiSettings> {
  const res = await fetchWithTimeout(`${BASE_URL}/ai/settings`, 8000);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as AiSettings;
}

export async function updateAiSettings(
  settings: AiSettings,
): Promise<AiSettings> {
  const res = await fetchWithTimeout(`${BASE_URL}/ai/settings`, 8000, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as AiSettings;
}

export async function testConnection(
  url: string,
): Promise<TestConnectionResult> {
  const res = await fetchWithTimeout(`${BASE_URL}/ai/test-connection`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as TestConnectionResult;
}

export async function browseDirectory(path: string): Promise<DirectoryEntry[]> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/llama/browse?path=${encodeURIComponent(path)}`,
    8000,
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as DirectoryEntry[];
}

export async function getDirectoryInfo(path: string): Promise<DirectoryInfo> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/llama/directory-info?path=${encodeURIComponent(path)}`,
    8000,
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as DirectoryInfo;
}

export async function getRepoInfo(
  path: string,
  localCmd?: string,
  latestCmd?: string,
): Promise<RepoInfo> {
  const params = new URLSearchParams({ path });
  if (localCmd) params.set("local_cmd", localCmd);
  if (latestCmd) params.set("latest_cmd", latestCmd);
  const res = await fetchWithTimeout(
    `${BASE_URL}/llama/repo-info?${params.toString()}`,
    8000,
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as RepoInfo;
}

export async function spawnTerminal(
  dir: string,
): Promise<TerminalSpawnResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/terminal`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as TerminalSpawnResponse;
}

export async function listCommands(): Promise<SavedCommand[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/commands`, 8000);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand[];
}

export async function createCommand(
  cmd: Omit<SavedCommand, "id">,
): Promise<SavedCommand> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/commands`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand;
}

export async function updateCommand(cmd: SavedCommand): Promise<SavedCommand> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/commands`, 8000, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand;
}

export async function deleteCommand(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/commands`, 8000, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

// ─── PTY Terminal API Methods ──────────────────────────────────────

export async function ptySpawnTerminal(
  dir: string,
): Promise<TerminalSpawnResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/terminal/spawn`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as TerminalSpawnResponse;
}

export async function ptyReadOutput(
  ptsName: string,
  offset = 0,
): Promise<{ text: string; nextOffset: number }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/llama/terminal/output?pts=${encodeURIComponent(ptsName)}&offset=${offset}`,
    8000,
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  const data = (await res.json()).data as { text: string; next_offset: number };
  return { text: data.text, nextOffset: data.next_offset };
}

export async function ptyWriteInput(
  ptsName: string,
  input: string,
): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/llama/terminal/input`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pts: ptsName, input }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

export async function ptyResizeTerminal(
  ptsName: string,
  rows: number,
  cols: number,
): Promise<void> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/llama/terminal/resize`,
    8000,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pts: ptsName, rows, cols }),
    },
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

export function ptyKillTerminal(ptsName: string): void {
  fetch(`${BASE_URL}/llama/terminal/kill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pts: ptsName }),
    keepalive: true,
  }).catch(() => {});
}

// ─── Launcher API Methods ──────────────────────────────────────────

export async function getLaunchProfiles(): Promise<ProfileResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/launch/profiles`, 8000);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as ProfileResponse;
}

export async function launchProfile(
  profileId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetchWithTimeout(`${BASE_URL}/launch/launch`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id: profileId }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as { success: boolean; error?: string };
}

export async function stopProfile(
  profileId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetchWithTimeout(`${BASE_URL}/launch/stop`, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id: profileId }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as { success: boolean; error?: string };
}

export async function getLaunchMetrics(scriptPath: string): Promise<{
  status: string;
  pid?: number | null;
  cpu_percent?: number;
  memory_kb?: number;
  peak_vram_mb?: number | null;
  current_tps?: number | null;
  model_path?: string | null;
  context_size?: number | null;
}> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/launch/metrics/${encodeURIComponent(scriptPath)}`,
    8000,
  );
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as any;
}

export async function getLaunchMetadata(): Promise<
  Record<
    string,
    {
      script_path: string;
      model_path?: string | null;
      peak_vram_mb?: number | null;
      peak_ram_mb?: number | null;
      avg_gen_tps?: number | null;
      peak_gen_tps?: number | null;
      last_context_size?: number | null;
      last_run_date?: string | null;
      run_count: number;
      last_startup_time_ms?: number | null;
    }
  >
> {
  const res = await fetchWithTimeout(`${BASE_URL}/launch/profiles`, 8000);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data.metadata as any;
}
