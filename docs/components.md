# Components

## Frontend Component Hierarchy

### App (App.tsx)
- **Role**: Root component, layout orchestration
- **Props**: none (theme state managed internally)
- **Features**:
  - Loading screen (800ms delay)
  - `MetricsProvider` wrapper
  - Dashboard grid layout (4 rows)
  - Accent color from `localStorage`
  - Background preset from `localStorage`

### MetricsProvider (context/MetricsContext.tsx)
- **Role**: Global metrics state provider
- **Hooks**: `useMultiMetrics` (CPU, Memory, GPU), `useStorageMetrics` (Storage)
- **Provides**:
  - `cpuCurrentValues`: Array<number | null>
  - `memoryCurrentValues`: Array<number | null>
  - `gpuCurrentValues`: Array<number | null>
  - `cpuHistories`: Array<MetricHistoryPoint[] | null>
  - `memoryHistories`: Array<MetricHistoryPoint[] | null>
  - `gpuHistories`: Array<MetricHistoryPoint[] | null>
  - `cpuHistory`, `memoryHistory`, `gpuHistory`: First tracked history
  - `storageDevices`: Array of device info
  - `storageHistories`: Map<device, StorageHistoryPoint[]>
  - `storageLoading`, `storageError`
  - `retryCpu`, `retryMemory`, `retryGpu`, `retryStorage`

### Header (components/Header.tsx)
- **Role**: Top navigation bar
- **Props**: `accent`, `showThemePanel`, `onToggleThemePanel`, `healthOk`
- **Features**:
  - Health indicator (online/offline)
  - Theme panel toggle
  - Dashboard title

### ThemePanel (components/ThemePanel.tsx)
- **Role**: Accent and background color selector
- **Props**: `open`, `onClose`, `accent`, `onAccentChange`, `bg`, `onBgChange`, `current`
- **Features**:
  - 6 accent colors (blue, cyan, green, purple, orange, red)
  - 5 background presets (dark, midnight, light, ocean, forest)
  - localStorage persistence

### CpuCard (components/cards/CpuCard.tsx)
- **Role**: CPU summary display
- **Props**: `accent`
- **Displays**:
  - utilization_percent (tracked)
  - temperature_celsius
  - frequency_mhz
  - physical_cores
  - threads
  - load_1m, load_5m, load_15m
- **Error handling**: Retry button on error

### CpuChart (charts/CpuChart.tsx)
- **Role**: CPU metrics history chart
- **Props**: `accent`
- **Data**: `cpuHistories[0]` (tracked history)
- **Series**: utilization_percent (line)
- **X-axis**: timestamp (category)
- **Y-axis**: percent (0-100)

### MemoryCard (components/cards/MemoryCard.tsx)
- **Role**: Memory summary display
- **Props**: `accent`
- **Displays**:
  - utilization_percent (tracked)
  - used_gb
  - total_gb
  - swap_used_gb
  - swap_total_gb
- **Error handling**: Retry button on error

### MemoryChart (charts/MemoryChart.tsx)
- **Role**: Memory metrics history chart
- **Props**: `accent`
- **Data**: `memoryHistories[0]` (tracked history)
- **Series**: utilization_percent (line)
- **X-axis**: timestamp (category)
- **Y-axis**: percent (0-100)

### GpuCard (components/cards/GpuCard.tsx)
- **Role**: GPU summary display
- **Props**: `accent`
- **Displays**:
  - utilization_percent (tracked, first GPU)
  - temperature_celsius (first GPU)
  - vram_used_gb / vram_total_gb (first GPU)
  - power_usage_watts / power_limit_watts (first GPU)
- **Error handling**: Retry button on error

### GpuChart (charts/GpuChart.tsx)
- **Role**: GPU metrics history chart
- **Props**: `accent`
- **Data**: `gpuHistories[0]` (tracked history)
- **Series**: utilization_percent (line)
- **X-axis**: timestamp (category)
- **Y-axis**: percent (0-100)

### StorageCard (components/cards/StorageCard.tsx)
- **Role**: Storage capacity summary
- **Props**: `accent`
- **Displays**: Per-device capacity bars with utilization
- **Data**: `storageDevices` from context

### StoragePerformanceCard (components/cards/StoragePerformanceCard.tsx)
- **Role**: Storage performance monitoring
- **Props**: `accent`
- **Features**:
  - Tab navigation: Throughput, IOPS, Utilization
  - Combined toggle button
  - Per-device chart rendering
- **Data**: `storageHistories` from context

### StorageHistoryChart (charts/StorageHistoryChart.tsx)
- **Role**: Reusable storage history chart
- **Props**: `devices`, `title`, `accent`, `type` (throughput/iops/utilization)
- **Features**:
  - Per-device read (solid) and write (dashed) series
  - Combined toggle
  - X-axis: timestamp (category, [0, 59] domain)
  - Tooltip: per-device read/write throughput, IOPS, utilization
  - min-width: 360px
- **Data**: `DeviceHistoryBuffer` (60 slots per device)

## Component Props Summary

| Component | Props |
|-----------|-------|
| App | none |
| MetricsProvider | children |
| Header | accent, showThemePanel, onToggleThemePanel, healthOk |
| ThemePanel | open, onClose, accent, onAccentChange, bg, onBgChange, current |
| CpuCard | accent |
| CpuChart | accent |
| MemoryCard | accent |
| MemoryChart | accent |
| GpuCard | accent |
| GpuChart | accent |
| StorageCard | accent |
| StoragePerformanceCard | accent |
| StorageHistoryChart | devices, title, accent, type |

## Component Dependencies

```
App
├── MetricsProvider (context)
│   ├── useMultiMetrics (hook)
│   │   ├── fetchData (fetch)
│   │   └── createEmptyHistory (utility)
│   ├── useStorageMetrics (hook)
│   │   ├── fetchData (fetch)
│   │   └── DeviceHistoryBuffer (utility)
│   └── useMetrics (hook, unused)
│       └── fetchData (fetch)
├── Header (component)
│   └── checkHealth (service)
├── ThemePanel (component)
│   └── useTheme (hook)
├── CpuCard (component)
│   └── useMetricsContext (hook)
├── CpuChart (component)
│   └── useMetricsContext (hook)
├── MemoryCard (component)
│   └── useMetricsContext (hook)
├── MemoryChart (component)
│   └── useMetricsContext (hook)
├── GpuCard (component)
│   └── useMetricsContext (hook)
├── GpuChart (component)
│   └── useMetricsContext (hook)
├── StorageCard (component)
│   └── useMetricsContext (hook)
├── StoragePerformanceCard (component)
│   └── useMetricsContext (hook)
│       └── StorageHistoryChart (component)
│           └── Recharts components
└── Loading screen (inline)
    └── CSS animation
```
