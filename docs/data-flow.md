# Data Flow

## Backend Data Collection Flow

### CPU Metrics (collectors/cpu.rs)
```
/proc/stat (CPU times) ──┐
                          ├──> compute_cpu_usage() ──> CpuMetrics
/proc/cpuinfo ───────────┘    (utilization delta)
/proc/loadavg ─────────────────────────────────────> load averages
/proc/stat (temperature) ──────────────────────────> temperature_celsius
```
- Polling interval: 500ms
- CPU utilization computed from delta between consecutive `stat` reads
- Sleep 500ms between polls to ensure meaningful delta

### Memory Metrics (collectors/memory.rs)
```
/proc/meminfo ──> MemoryMetrics
  - total_gb
  - used_gb
  - utilization_percent
  - swap_used_gb
  - swap_total_gb
```
- Direct read of `/proc/meminfo` on each API request
- No delta computation needed

### GPU Metrics (collectors/gpu.rs)
```
nvml-wrapper ──> GpuMetrics (primary)
  - utilization_percent
  - temperature_celsius
  - vram_used_gb
  - vram_total_gb
  - power_usage_watts
  - power_limit_watts

Fallback: nvidia-smi CLI ──> GpuMetrics (if nvml-wrapper unavailable)
```
- Polling interval: 500ms
- Array of GPU devices (supports multi-GPU)

### Storage Metrics (collectors/storage.rs)
```
/proc/diskstats ──> StorageMetrics (per device)
  - StorageHistoryState (per-device baselines)
  - LAST_SNAPSHOT: BTreeMap<String, DiskStatsSnapshot>
  
/proc/mounts ──> DeviceStorageInfo
  - mount points
  - filesystem type
  - capacity / used / available
  - utilization_percent
```

#### I/O Stats Computation
```
/proc/diskstats (current) ──┐
                             │
                             ├──> compute_io_stats()
/proc/diskstats (prev) ──────┘    (from LAST_SNAPSHOT)
    │
    ├── elapsed_ms = current_time - prev_time
    │
    ├── reads_delta = current_read_sectors - prev_read_sectors
    ├── writes_delta = current_write_sectors - prev_write_sectors
    ├── weighted_ms_delta = current_weighted_ms - prev_weighted_ms
    │
    └── IOPS = (reads_delta + writes_delta) / elapsed_ms * 1000
        read_IOPS = reads_delta / elapsed_ms * 1000
        write_IOPS = writes_delta / elapsed_ms * 1000
        utilization = weighted_ms_delta / elapsed_ms * 1000
```
- Per-device baselines prevent cross-device interference
- nvme0n1 shows 0.0 IOPS when idle (correct behavior)
- nvme1n1 shows non-zero IOPS from actual partition activity

### Storage History (collectors/storage.rs)
```
GET /api/metrics/storage-history/{device}
    │
    └── Returns last 60 data points:
        - timestamp
        - read_throughput_bytes
        - write_throughput_bytes
        - read_iops
        - write_iops
        - io_utilization_percent
```

## Frontend Data Flow

### MetricsPolling Flow
```
App.tsx
  └── MetricsProvider
        ├── useMultiMetrics('/cpu')
        │     └── fetch(/api/metrics/cpu) @ 1000ms
        │           └── extractors:
        │               - utilization_percent (tracked)
        │               - temperature_celsius
        │               - frequency_mhz
        │               - physical_cores
        │               - threads
        │               - load_1m
        │               - load_5m
        │               - load_15m
        │
        ├── useMultiMetrics('/memory')
        │     └── fetch(/api/metrics/memory) @ 1000ms
        │           └── extractors:
        │               - utilization_percent (tracked)
        │               - used_gb
        │               - total_gb
        │               - swap_used_gb
        │               - swap_total_gb
        │
        ├── useMultiMetrics('/gpu')
        │     └── fetch(/api/metrics/gpu) @ 1000ms
        │           └── extractors (with array handling):
        │               - utilization_percent (tracked)
        │               - temperature_celsius
        │               - vram_used_gb
        │               - vram_total_gb
        │               - power_usage_watts
        │               - power_limit_watts
        │
        └── useStorageMetrics()
              └── fetch(/api/metrics/storage) @ 1000ms
                    └── per-device:
                        - StorageMetrics (capacity)
                        - DiskIOStats (IOPS)
                        - DeviceStorageInfo (mount points)
```

### Storage History Flow
```
StorageHistoryChart.tsx
  └── For each device in storageDevices:
        fetch(/api/metrics/storage-history/{device})
          └── DeviceHistoryBuffer (60 slots)
                │
                ├── slot (0-59)
                ├── timestamp
                ├── throughput (read + write combined)
                ├── read_throughput_bytes
                ├── write_throughput_bytes
                ├── iops (read + write combined)
                ├── read_iops
                ├── write_iops
                └── io_utilization_percent
```

### Buffer Management
```
BUFFER_SIZE = 60
Slot assignment:
  - Slot 0 = newest (current)
  - Slot 59 = oldest (60 seconds ago)

Insertion:
  1. Remove oldest (slot 59)
  2. Insert new at slot 0
  3. Reassign all slots (slice + push + map)

First data point:
  - Prefill entire buffer with initial value
  - timestamp = Date.now()
  - slot = 0..59
```

### Chart Rendering Flow
```
StorageHistoryChart.tsx
  ├── For each device:
  │     └── buffer[slot].name = format(timestamp)
  │
  ├── read series (solid line):
  │     └── buffer[slot].read_throughput_bytes
  │
  ├── write series (dashed line):
  │     └── buffer[slot].write_throughput_bytes
  │
  ├── Throughput tab (bytes/s):
  │     └── X: timestamp (category), Y: bytes/s
  │
  ├── IOPS tab:
  │     └── X: timestamp (category), Y: IOPS
  │
  ├── Utilization tab (percentage):
  │     └── X: timestamp (category), Y: io_utilization_percent
  │
  ├── Combined toggle:
  │     - Toggle between per-drive and combined view
  │
  └── X-axis domain:
        └── [0, 59] (oldest → newest, left to right)
```

### Theme Data Flow
```
localStorage
  ├── dashboard-accent → accent state
  │     └── document.documentElement.dataset.accent
  │
  └── dashboard-bg → bg state
        └── document.documentElement.dataset.bg

App.tsx
  └── MetricsProvider
        └── All components receive accent via props
```

## Error Handling Flow

### Backend
```
API request
  └── Result<T, AppError>
        ├── StorageError variants:
        │     - InvalidDeviceName
        │     - MissingProcFile
        │     - ParseError
        │     - IoError
        │     - Unknown
        └── HTTP 500 with error JSON
```

### Frontend
```
fetch()
  └── try/catch
        ├── response.ok check → HTTP error
        ├── JSON parse → ParseError
        └── catch → NetworkError

usePanelWithErrorHandling
  └── classifyError()
        ├── network: fetch failed, timeout
        ├── http: non-200 status
        ├── parse: JSON error
        ├── data: unexpected values
        ├── runtime: undefined access
        └── unknown: everything else

  └── getFriendlyMessage()
        └── Human-readable message based on error type
```

## Polling Intervals

| Component | Interval | Source |
|-----------|----------|--------|
| Backend CPU | 500ms | `tokio::time::sleep(Duration::from_millis(500))` |
| Backend GPU | 500ms | `tokio::time::sleep(Duration::from_millis(500))` |
| Frontend CPU | 1000ms | `setInterval(fetchData, 1000)` |
| Frontend Memory | 1000ms | `setInterval(fetchData, 1000)` |
| Frontend GPU | 1000ms | `setInterval(fetchData, 1000)` |
| Frontend Storage | 1000ms | `setInterval(fetchData, 1000)` |
| Health check | 10000ms | `refetchInterval: 10000` |

## Key Data Structures

### Backend
- `CpuMetrics` — single CPU summary
- `MemoryMetrics` — single memory summary
- `GpuMetrics` — single GPU device (array of these)
- `StorageMetrics` — per-device capacity
- `DiskIOStats` — per-device I/O statistics
- `DeviceStorageInfo` — per-device mount info
- `StorageHistoryPoint` — per-device history point
- `DeviceStorageInfo` — per-device mount info
- `StorageHistoryPoint` — per-device history point
- `DiskStatsSnapshot` — per-device baseline for delta computation
- `LAST_SNAPSHOT: BTreeMap<String, DiskStatsSnapshot>` — per-device baselines

### Frontend
- `MetricHistoryPoint` — { slot, timestamp, value }
- `StorageHistoryPoint` — { slot, timestamp, throughput, read/write, IOPS, utilization }
- `DeviceHistoryBuffer` — 60-slot circular buffer per device
- `MetricsContextValue` — aggregated metrics from all hooks
- `PanelErrorInfo` — classified error with metadata
- `ACCENT_COLORS` — { color, glow } per accent key
- `PRESETS` / `BG_PRESETS` — theme color options
