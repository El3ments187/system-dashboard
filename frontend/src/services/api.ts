import { CpuMetrics, MemoryMetrics, GpuMetrics, StorageMetrics, DeviceStorageInfo, SystemMetrics, AiMetrics, AiHistoryEntry, AiSettings, TestConnectionResult, DirectoryEntry, SavedCommand, TerminalSpawnResponse, DirectoryInfo, RepoInfo } from '../types/metrics';

const BASE_URL = '/api';

async function fetchMetrics<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as T;
}

export async function getCpuMetrics(): Promise<CpuMetrics> {
  return fetchMetrics<CpuMetrics>('/metrics/cpu');
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  return fetchMetrics<MemoryMetrics>('/metrics/memory');
}

export async function getGpuMetrics(): Promise<GpuMetrics> {
  return fetchMetrics<GpuMetrics>('/metrics/gpu');
}

export async function getStorageMetrics(): Promise<StorageMetrics[]> {
  return fetchMetrics<StorageMetrics[]>('/metrics/storage');
}

export async function getStorageDevices(): Promise<DeviceStorageInfo[]> {
  return fetchMetrics<DeviceStorageInfo[]>('/metrics/storage/devices');
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return fetchMetrics<SystemMetrics>('/metrics/system');
}

export async function checkHealth(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}

export async function getAiMetrics(): Promise<AiMetrics> {
  return fetchMetrics<AiMetrics>('/ai/metrics');
}

export async function getAiHistory(): Promise<AiHistoryEntry[]> {
  return fetchMetrics<AiHistoryEntry[]>('/ai/history');
}

export async function getAiSettings(): Promise<AiSettings> {
  const res = await fetch(`${BASE_URL}/ai/settings`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as AiSettings;
}

export async function updateAiSettings(settings: AiSettings): Promise<AiSettings> {
  const res = await fetch(`${BASE_URL}/ai/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as AiSettings;
}

export async function testConnection(url: string): Promise<TestConnectionResult> {
  const res = await fetch(`${BASE_URL}/ai/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as TestConnectionResult;
}

export async function browseDirectory(path: string): Promise<DirectoryEntry[]> {
  const res = await fetch(`${BASE_URL}/ai/browse?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as DirectoryEntry[];
}

export async function getDirectoryInfo(path: string): Promise<DirectoryInfo> {
  const res = await fetch(`${BASE_URL}/ai/directory-info?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as DirectoryInfo;
}

export async function getRepoInfo(path: string, githubRepo?: string, tagPrefix?: string): Promise<RepoInfo> {
  const params = new URLSearchParams({ path });
  if (githubRepo) params.set('github_repo', githubRepo);
  if (tagPrefix) params.set('tag_prefix', tagPrefix);
  const res = await fetch(`${BASE_URL}/ai/repo-info?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as RepoInfo;
}

export async function spawnTerminal(dir: string): Promise<TerminalSpawnResponse> {
  const res = await fetch(`${BASE_URL}/ai/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as TerminalSpawnResponse;
}

export async function listCommands(): Promise<SavedCommand[]> {
  const res = await fetch(`${BASE_URL}/ai/commands`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand[];
}

export async function createCommand(cmd: Omit<SavedCommand, 'id'>): Promise<SavedCommand> {
  const res = await fetch(`${BASE_URL}/ai/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand;
}

export async function updateCommand(cmd: SavedCommand): Promise<SavedCommand> {
  const res = await fetch(`${BASE_URL}/ai/commands`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as SavedCommand;
}

export async function deleteCommand(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/ai/commands`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

// ─── PTY Terminal API Methods ──────────────────────────────────────

export async function ptySpawnTerminal(dir: string): Promise<TerminalSpawnResponse> {
  const res = await fetch(`${BASE_URL}/ai/terminal/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as TerminalSpawnResponse;
}

export async function ptyReadOutput(ptsName: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/ai/terminal/output?pts=${encodeURIComponent(ptsName)}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return (await res.json()).data as string;
}

export async function ptyWriteInput(ptsName: string, input: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/ai/terminal/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pts: ptsName, input }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

export async function ptyResizeTerminal(ptsName: string, rows: number, cols: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/ai/terminal/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pts: ptsName, rows, cols }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}

export async function ptyKillTerminal(ptsName: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/ai/terminal/kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pts: ptsName }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
}
