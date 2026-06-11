# API Architecture

## Overview

The backend exposes a REST API on port 3001 with the following endpoints:

| Method | Endpoint | Description | Data Source |
|--------|----------|-------------|-------------|
| GET | `/api/health` | Health check | N/A |
| GET | `/api/metrics/cpu` | CPU metrics | `/proc/stat`, `/proc/cpuinfo`, `/proc/loadavg` |
| GET | `/api/metrics/memory` | Memory metrics | `/proc/meminfo` |
| GET | `/api/metrics/gpu` | GPU metrics | `nvml-wrapper` + `nvidia-smi` fallback |
| GET | `/api/metrics/storage` | Storage capacity | `/proc/mounts` |
| GET | `/api/metrics/storage-history/{device}` | Storage I/O history | `/proc/diskstats` |

## Route Definitions (api/routes.rs)

```rust
pub fn register_routes(router: &mut Router) {
    // Health check
    router.get("/api/health", health);
    
    // Metrics endpoints
    router.get("/api/metrics/cpu", get_cpu_metrics);
    router.get("/api/metrics/memory", get_memory_metrics);
    router.get("/api/metrics/gpu", get_gpu_metrics);
    router.get("/api/metrics/storage", get_storage_metrics);
    router.get("/api/metrics/storage-history/:device", get_storage_history);
}
```

## Response Format

All endpoints return JSON wrapped in `ApiResponse<T>`:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

### Health Check Response
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime_seconds": 12345.67,
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "error": null
}
```

### CPU Metrics Response
```json
{
  "success": true,
  "data": {
    "utilization_percent": 45.2,
    "temperature_celsius": 65.0,
    "frequency_mhz": 3200.0,
    "physical_cores": 8,
    "threads": 16,
    "load_1m": 2.5,
    "load_5m": 1.8,
    "load_15m": 1.2
  },
  "error": null
}
```

### Memory Metrics Response
```json
{
  "success": true,
  "data": {
    "total_gb": 32.0,
    "used_gb": 18.5,
    "utilization_percent": 57.8,
    "swap_total_gb": 8.0,
    "swap_used_gb": 0.2
  },
  "error": null
}
```

### GPU Metrics Response
```json
{
  "success": true,
  "data": [
    {
      "index": 0,
      "name": "NVIDIA GeForce RTX 4090",
      "utilization_percent": 75.0,
      "temperature_celsius": 68.0,
      "vram_used_gb": 12.5,
      "vram_total_gb": 24.0,
      "power_usage_watts": 250.0,
      "power_limit_watts": 450.0
    }
  ],
  "error": null
}
```

### Storage Metrics Response
```json
{
  "success": true,
  "data": [
    {
      "device": "nvme1n1",
      "mount_point": "/",
      "filesystem_type": "ext4",
      "capacity_gb": 953.7,
      "used_gb": 250.2,
      "available_gb": 653.5,
      "utilization_percent": 26.1,
      "io_stats": {
        "read_iops": 125.5,
        "write_iops": 89.3,
        "read_throughput_bytes": 1048576,
        "write_throughput_bytes": 524288,
        "io_utilization_percent": 15.2
      }
    }
  ],
  "error": null
}
```

### Storage History Response
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-01T00:00:00Z",
      "read_throughput_bytes": 1048576,
      "write_throughput_bytes": 524288,
      "read_iops": 125.5,
      "write_iops": 89.3,
      "io_utilization_percent": 15.2
    }
  ],
  "error": null
}
```

## Error Responses

### HTTP 500 with AppError
```json
{
  "success": false,
  "data": null,
  "error": {
    "type": "storage",
    "message": "Failed to read /proc/diskstats",
    "details": null
  }
}
```

### StorageError Types
| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| `InvalidDeviceName` | 400 | Device name not in diskstats |
| `MissingProcFile` | 500 | /proc/diskstats not found |
| `ParseError` | 500 | Failed to parse /proc/diskstats |
| `IoError` | 500 | I/O error reading /proc/diskstats |
| `Unknown` | 500 | Unexpected error |

## Backend Module Structure

```
backend/src/
├── main.rs                    # Entry point, server startup
├── api/
│   ├── mod.rs                 # Module exports (pub mod routes)
│   └── routes.rs              # Route definitions and handlers
├── collectors/
│   ├── cpu.rs                 # CPU metrics collector
│   ├── memory.rs              # Memory metrics collector
│   ├── gpu.rs                 # GPU metrics collector
│   ├── storage.rs             # Storage metrics collector
│   └── system.rs              # System info collector
├── models/
│   ├── metrics.rs             # Shared metric types
│   └── storage.rs             # Storage-specific types
└── error.rs                   # Custom AppError types
```

## Data Collection Architecture

### Polling Strategy
- **Backend**: No background polling — data collected on-demand per API request
- **CPU**: Delta computation requires two reads with 500ms sleep
- **GPU**: Direct query via nvml-wrapper with nvidia-smi CLI fallback
- **Memory**: Direct read of `/proc/meminfo`
- **Storage**: Direct read of `/proc/mounts` and `/proc/diskstats`
- **Storage History**: Computes I/O stats from `/proc/diskstats` with per-device baselines

### State Management
- **CPU**: Uses `LAST_COMPUTE_DONE` flag for first-compute detection
- **GPU**: No state — direct query per request
- **Memory**: No state — direct read per request
- **Storage**: Uses `StorageHistoryState` with per-device `BTreeMap<String, DiskStatsSnapshot>` baselines
- **Storage History**: Uses `LAST_SNAPSHOT: BTreeMap<String, DiskStatsSnapshot>` for delta computation

## Frontend API Client

### services/api.ts
```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}

interface ApiError {
  type: string;
  message: string;
  details: string | null;
}

// Health check
export async function checkHealth(): Promise<boolean> {
  const res = await fetch('http://localhost:3001/api/health');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.success;
}

// Storage history
export async function fetchStorageHistory(device: string): Promise<StorageHistoryPoint[]> {
  const res = await fetch(`http://localhost:3001/api/metrics/storage-history/${device}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}
```

### Polling Pattern
```typescript
// useMultiMetrics / useStorageMetrics
const fetchData = useCallback(async () => {
  try {
    const response = await fetch(`/api/metrics${endpointRef.current}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const json = await response.json();
    // Process data...
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 1000);
  return () => clearInterval(interval);
}, [fetchData]);
```

## Health Check Usage

```typescript
// App.tsx
const { data: healthOk } = useQuery<boolean>({
  queryKey: ['health'],
  queryFn: checkHealth,
  refetchInterval: 10000,  // 10 second polling
  retry: 1,
  staleTime: Infinity,
});

// Header.tsx
<HealthIndicator online={healthOk} />
```

## Key Design Decisions

1. **On-demand collection** — Backend collects data per request (no background workers)
2. **Delta computation** — CPU utilization computed from `/proc/stat` delta (500ms sleep)
3. **Per-device baselines** — Storage I/O stats use per-device snapshot tracking
4. **Array responses for GPU** — Supports multi-GPU systems
5. **Unified response format** — All endpoints use `ApiResponse<T>` wrapper
6. **Custom error types** — `AppError` with specific error categories
7. **Polling over WebSockets** — Frontend uses HTTP polling (1s interval)
8. **No caching** — All data collected fresh per request
