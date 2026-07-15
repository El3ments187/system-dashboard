# Architecture

## Overview

Model Deck is a full-stack real-time metrics monitoring application consisting of:

- **Backend**: Rust (Axum) API server on port 3001
- **Frontend**: React 18 + Vite + Recharts on port 5173

## Component Hierarchy

```
App (App.tsx)
├── MetricsProvider (context/MetricsContext.tsx)
│   ├── useMultiMetrics('/cpu') — CPU metrics
│   ├── useMultiMetrics('/memory') — Memory metrics
│   ├── useMultiMetrics('/gpu') — GPU metrics
│   └── useStorageMetrics() — Storage metrics
├── Header
├── ThemePanel
├── DashboardGrid
│   ├── GPU row (GpuCard + GpuChart)
│   ├── CPU row (CpuCard + CpuChart)
│   ├── Memory row (MemoryCard + MemoryChart)
│   └── Storage row (StorageCard + StoragePerformanceCard)
│       └── StorageHistoryChart
```

## Data Flow

1. **Backend** polls `/proc` files (cpuinfo, diskstats, meminfo, mounts, stat) at 500ms intervals
2. **Backend** queries GPU via `nvml-wrapper` (with nvidia-smi fallback) at 500ms intervals
3. **Frontend** polls `/api/metrics/{cpu,memory,gpu,storage}` at 1000ms intervals via `useMultiMetrics` / `useStorageMetrics` hooks
4. **Frontend** stores data in rolling 60-point buffers (1-second granularity)
5. **Charts** render history from buffers using Recharts

## State Management

### Context (React Context)
- `MetricsContext` provides all metrics data to the component tree
- Created by `MetricsProvider` which aggregates hooks
- Provides: `cpuCurrentValues`, `memoryCurrentValues`, `gpuCurrentValues`, `storageDevices`, `storageHistories`

### Hooks
- `useMultiMetrics` — single fetch, multiple value extraction, per-value history tracking
- `useStorageMetrics` — per-device storage polling with `DeviceHistoryBuffer`
- `useTheme` — accent color and background persistence via localStorage

### LocalStorage
- `dashboard-accent` — accent color key (blue, cyan, green, purple, orange, red)
- `dashboard-bg` — background preset (dark, midnight, light, ocean, forest)

## Service Architecture

### Backend Services

```
main.rs (entry point)
├── api/routes.rs — HTTP route definitions
│   ├── GET /api/health
│   ├── GET /api/metrics/cpu
│   ├── GET /api/metrics/memory
│   ├── GET /api/metrics/gpu
│   ├── GET /api/metrics/storage
│   └── GET /api/metrics/storage-history/{device}
├── collectors/
│   ├── cpu.rs — CPU metrics (utilization, temperature, frequency, cores, threads, load)
│   ├── memory.rs — Memory metrics (used, total, swap, utilization)
│   ├── gpu.rs — GPU metrics (utilization, temperature, VRAM, power) via nvml-wrapper
│   ├── storage.rs — Storage metrics (capacity, I/O stats, history) via /proc/diskstats
│   └── system.rs — System info (hostname, uptime, kernel, OS)
├── models/
│   ├── metrics.rs — Shared metric types (CpuMetrics, MemoryMetrics, GpuMetrics, SystemMetrics)
│   └── storage.rs — Storage types (StorageMetrics, DiskIOStats, DeviceStorageInfo)
├── error.rs — Custom AppError types
└── api/mod.rs — Module exports
```

### Frontend Services

```
App.tsx
├── services/
│   └── api.ts — API client functions (checkHealth, fetchStorageHistory)
├── hooks/
│   ├── useMultiMetrics.ts — Multi-value metrics polling hook
│   ├── useStorageMetrics.ts — Per-device storage polling hook
│   ├── usePanelWithErrorHandling.ts — Error classification and handling
│   └── useTheme.ts — Theme state management
├── context/
│   └── MetricsContext.tsx — Global metrics context provider
├── charts/
│   ├── CpuChart.tsx — CPU line chart (Recharts)
│   ├── MemoryChart.tsx — Memory line chart
│   ├── GpuChart.tsx — GPU line chart
│   └── StorageHistoryChart.tsx — Per-device storage history (throughput, IOPS, utilization)
├── components/
│   ├── Header.tsx — Top bar with health indicator
│   ├── ThemePanel.tsx — Accent/background color selector
│   └── cards/
│       ├── CpuCard.tsx — CPU summary card
│       ├── MemoryCard.tsx — Memory summary card
│       ├── GpuCard.tsx — GPU summary card
│       ├── StorageCard.tsx — Storage summary card
│       └── StoragePerformanceCard.tsx — Storage performance card (tabs, charts)
├── types/
│   └── metrics.ts — TypeScript type definitions
├── utils/
│   ├── formatting.ts — Number and unit formatting
│   └── colors.ts — Color utilities
└── styles/
    └── theme.css — CSS custom properties for theming
```

## Key Architectural Patterns

1. **Polling over WebSockets** — All metrics use HTTP polling (1s frontend, 500ms backend)
2. **Rolling Buffers** — 60-point circular buffers for chart data
3. **Per-Device Baselines** — Storage I/O stats use per-device snapshot tracking (`LAST_SNAPSHOT` as `BTreeMap<String, DiskStatsSnapshot>`)
4. **Context Aggregation** — `MetricsContext` aggregates all hooks into a single context
5. **Error Classification** — `usePanelWithErrorHandling` classifies errors (network, HTTP, parse, data, runtime, unknown)
6. **Multi-Value Extraction** — `useMultiMetrics` fetches once and extracts multiple values per API call
7. **Theme Persistence** — Accent and background saved to localStorage, applied via CSS custom properties

## Technology Stack

| Layer | Technology |
|-------|-------------|
| Backend Language | Rust |
| Backend Framework | Axum |
| Frontend Framework | React 18 |
| Build Tool | Vite |
| Charting | Recharts |
| State Management | React Context |
| Data Fetching | Manual fetch (no React Query) |
| Styling | CSS custom properties (theme.css) |
| GPU Query | nvml-wrapper + nvidia-smi CLI fallback |
| System Data | /proc filesystem (diskstats, meminfo, cpuinfo, stat, mounts) |
