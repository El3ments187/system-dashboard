# Performance Audit

## Overview

This audit identifies performance issues in the System Dashboard codebase, categorized by severity.

## Critical Issues

### 1. CPU Utilization Delta Computation (HIGH)
**File**: `backend/src/collectors/cpu.rs`

**Issue**: CPU utilization is computed from `/proc/stat` delta with a fixed 500ms sleep. This creates a minimum 500ms delay before first data point is available.

**Impact**: 500ms latency on initial CPU metric availability.

**Code**:
```rust
pub fn collect_cpu_metrics() -> CpuMetrics {
    let start_time = Instant::now();
    let prev = LAST_COMPUTE_DONE.swap(true, Ordering::SeqCst);
    
    if !prev {
        // First compute — sleep to get meaningful delta
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    
    let cpu_stats = read_cpu_stats();
    let elapsed = start_time.elapsed().as_secs_f64();
    
    // Compute delta...
}
```

### 2. Storage I/O Stats Per-Request Overhead (MEDIUM)
**File**: `backend/src/collectors/storage.rs`

**Issue**: `/proc/diskstats` is read and parsed on every API request, including storage history which reads it twice (current + previous snapshot).

**Impact**: Increased latency on `/api/metrics/storage-history/{device}` endpoint.

**Code**:
```rust
pub async fn collect_storage_history(device: &str) -> Result<Vec<StorageHistoryPoint>> {
    let prev_snapshot = LAST_SNAPSHOT.get(device);
    let current_stats = read_disk_stats().unwrap_or_default();
    // ... compute delta
}
```

### 3. Inefficient Buffer Management (LOW)
**File**: `frontend/src/hooks/useMultiMetrics.ts`

**Issue**: History buffer update creates new arrays on every poll (slice + push + map).

**Impact**: Garbage collection pressure at 1Hz per metric type.

**Code**:
```typescript
const updateHistory = (h: MetricHistoryPoint[] | null, i: number) => {
  if (!h || !trackHistoryRef.current?.[i]) return h;
  const newValue = values[i];
  if (newValue === null) return h;
  
  if (h.length === 0) {
    return createEmptyHistory(newValue);
  }
  
  const trimmed = h.slice(1);  // Creates new array
  trimmed.push({ slot: 0, timestamp: new Date(), value: newValue });
  return trimmed.map((p, i) => ({ ...p, slot: i }));  // Creates new array
};
```

## Medium Issues

### 4. No Request Caching (MEDIUM)
**File**: `backend/src/api/routes.rs`

**Issue**: Each API request triggers fresh data collection. No caching of results.

**Impact**: Unnecessary `/proc` reads on rapid successive requests.

### 5. GPU Query Fallback Overhead (LOW)
**File**: `backend/src/collectors/gpu.rs`

**Issue**: GPU collection tries `nvml-wrapper` first, then falls back to `nvidia-smi` CLI. No caching of capability detection.

**Impact**: First few GPU queries may be slower.

### 6. Storage History Endpoint No Pagination (LOW)
**File**: `backend/src/collectors/storage.rs`

**Issue**: `collect_storage_history` returns all data points without pagination. Currently limited to 60 points but no enforcement.

**Impact**: Could grow unbounded if buffer size increases.

## Low Issues

### 7. Memory Metrics Direct Read (LOW)
**File**: `backend/src/collectors/memory.rs`

**Issue**: `/proc/meminfo` read on every request. This is acceptable for memory but could be cached.

**Impact**: Minimal — `/proc/meminfo` is fast.

### 8. System Info No Caching (LOW)
**File**: `backend/src/collectors/system.rs`

**Issue**: System info (hostname, uptime, kernel, OS) collected on every request despite being static.

**Impact**: Negligible — but unnecessary I/O.

### 9. Console Logging in Production (LOW)
**File**: `backend/src/collectors/cpu.rs`, `backend/src/collectors/gpu.rs`

**Issue**: Console logging in collector functions.

**Impact**: Minor I/O overhead in production.

## Frontend Performance

### 10. Chart Re-rendering on Every Poll (MEDIUM)
**File**: `frontend/src/charts/StorageHistoryChart.tsx`

**Issue**: Chart re-renders on every data update (1Hz). Recharts does not memoize between renders.

**Impact**: Potential frame drops during high CPU usage.

### 11. Multiple Context Re-renders (LOW)
**File**: `frontend/src/context/MetricsContext.tsx`

**Issue**: `MetricsContext` value object is recreated on every state change, causing all consumers to re-render.

**Impact**: Unnecessary re-renders of all cards and charts.

### 12. No Virtualization in Storage Cards (LOW)
**File**: `frontend/src/components/cards/StorageCard.tsx`

**Issue**: All device cards rendered even with many devices. No virtualization.

**Impact**: Performance degradation with many storage devices.

## Backend Performance Summary

| Issue | Severity | Impact | Fix Complexity |
|-------|----------|--------|----------------|
| CPU delta sleep | HIGH | 500ms latency | Low |
| Storage I/O per-request | MEDIUM | Increased latency | Medium |
| No request caching | MEDIUM | Unnecessary I/O | Low |
| GPU fallback overhead | LOW | First query delay | Low |
| Storage history no pagination | LOW | Unbounded growth | Low |
| Memory no caching | LOW | Negligible | Low |
| System info no caching | LOW | Negligible | Low |
| Console logging | LOW | Minor I/O | Low |

## Frontend Performance Summary

| Issue | Severity | Impact | Fix Complexity |
|-------|----------|--------|----------------|
| Chart re-rendering | MEDIUM | Frame drops | Medium |
| Context re-renders | LOW | Unnecessary renders | Medium |
| No virtualization | LOW | Many devices | Low |
| Buffer array allocation | LOW | GC pressure | Low |

## Recommendations

1. **Add request caching** for CPU metrics (500ms TTL) to avoid duplicate delta computation
2. **Memoize context value** to prevent unnecessary re-renders
3. **Virtualize storage device lists** for systems with many devices
4. **Optimize buffer management** to avoid array allocations on every poll
5. **Add performance monitoring** to track endpoint latency
6. **Consider WebSockets** for real-time metrics instead of polling
