# Recommendations

## Overview

This document provides prioritized recommendations for the System Dashboard project, organized by severity and area of impact.

## Priority 1: Critical Fixes

### 1.1 Add Request Caching for CPU Metrics
**Severity**: HIGH
**Area**: Backend
**Effort**: Low

**Problem**: CPU utilization requires 500ms sleep for delta computation. Each API request triggers fresh computation.

**Recommendation**: Add 500ms TTL cache for CPU metrics.

```rust
// In collectors/cpu.rs
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct CachedMetrics<T> {
    data: Option<T>,
    expires: Instant,
}

static CPU_CACHE: Mutex<CachedMetrics<CpuMetrics>> = Mutex::new(CachedMetrics(None, Instant::ZERO));

pub async fn collect_cpu_metrics() -> CpuMetrics {
    let cache = CPU_CACHE.lock().unwrap();
    if let Some(cached) = cache.data {
        if cached.expires > Instant::now() {
            return cached.data;
        }
    }
    
    // Compute fresh metrics...
    let metrics = compute_cpu_metrics();
    
    // Update cache
    CPU_CACHE.lock().unwrap().data = Some(CachedMetrics {
        data: metrics,
        expires: Instant::now() + Duration::from_millis(500),
    });
    
    metrics
}
```

**Impact**: Reduces `/proc/stat` reads by 50%, improves API response time.

### 1.2 Standardize Error Handling Across Cards
**Severity**: HIGH
**Area**: Frontend
**Effort**: Medium

**Problem**: Inconsistent error display across metric cards.

**Recommendation**: Create `ErrorBoundary` component and use it in all cards.

```typescript
// frontend/src/components/ErrorBoundary.tsx
export function ErrorBoundary({ children, title }: { children: React.ReactNode, title: string }) {
  const [error, setError] = useState<Error | null>(null);
  
  if (error) {
    return (
      <div className="error-card">
        <h3>{title} Error</h3>
        <p>{error.message}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }
  
  return <>{children}</>;
}

// Usage in all cards
<ErrorBoundary title="CPU">
  <CpuCard accent={accent} />
</ErrorBoundary>
```

**Impact**: Consistent error UX, easier maintenance.

### 1.3 Remove Unused Code
**Severity**: HIGH
**Area**: Code Quality
**Effort**: Low

**Problem**: Unused `useMetrics` hook and empty `{handlers}` directory.

**Recommendation**: 
1. Remove `frontend/src/hooks/useMetrics.ts`
2. Remove `backend/src/api/{handlers}/` directory

**Impact**: Cleaner codebase, easier maintenance.

## Priority 2: High-Impact Improvements

### 2.1 Add Type Safety to Context
**Severity**: MEDIUM
**Area**: Frontend
**Effort**: Medium

**Problem**: `any` types in `MetricsContext` lose type safety.

**Recommendation**: Define proper types for all context values.

```typescript
// frontend/src/types/metrics.ts
export interface CpuMetricsContext {
  currentValues: Array<number | null>;
  histories: Array<MetricHistoryPoint[] | null>;
  loading: boolean;
  error: string | null;
}

export interface MemoryMetricsContext {
  currentValues: Array<number | null>;
  histories: Array<MetricHistoryPoint[] | null>;
  loading: boolean;
  error: string | null;
}

export interface GpuMetricsContext {
  currentValues: Array<number | null>;
  histories: Array<MetricHistoryPoint[] | null>;
  loading: boolean;
  error: string | null;
}

export interface StorageMetricsContext {
  storageDevices: Array<StorageDevice>;
  storageHistories: Map<string, StorageHistoryPoint[]>;
  loading: boolean;
  error: string | null;
}

export interface MetricsContextValue {
  cpu: CpuMetricsContext;
  memory: MemoryMetricsContext;
  gpu: GpuMetricsContext;
  storage: StorageMetricsContext;
  retryCpu: () => void;
  retryMemory: () => void;
  retryGpu: () => void;
  retryStorage: () => void;
}
```

**Impact**: Compile-time error detection, better IDE support.

### 2.2 Add Unit Tests
**Severity**: HIGH
**Area**: Testing
**Effort**: Medium

**Problem**: No test files in the codebase.

**Recommendation**: Add unit tests for collectors, models, and utilities.

```rust
// backend/src/collectors/test_cpu.rs
#[test]
fn test_compute_cpu_usage() {
    let prev = CpuStats { user: 100, system: 50, idle: 850 };
    let curr = CpuStats { user: 150, system: 75, idle: 775 };
    
    let usage = compute_cpu_usage(prev, curr);
    assert_eq!(usage, 25.0); // 25% usage
}

#[test]
fn test_compute_io_stats() {
    let prev = DiskStatsSnapshot { read_sectors: 1000, write_sectors: 500, time_ms: 1000 };
    let curr = DiskStatsSnapshot { read_sectors: 1500, write_sectors: 750, time_ms: 2000 };
    
    let stats = compute_io_stats(&prev, &curr);
    assert_eq!(stats.read_iops, 500.0); // 500 IOPS
    assert_eq!(stats.write_iops, 250.0); // 250 IOPS
}
```

**Impact**: Regression protection, safer refactoring.

### 2.3 Add Loading Indicators for Charts
**Severity**: MEDIUM
**Area**: Frontend
**Effort**: Low

**Problem**: Charts show empty state during data fetch.

**Recommendation**: Add loading skeletons for all charts.

```typescript
// frontend/src/charts/LoadingSkeleton.tsx
export function LoadingSkeleton({ width = '100%', height = '200px' }: { width?: string, height?: string }) {
  return (
    <div className="loading-skeleton" style={{ width, height }}>
      <div className="skeleton-bar" />
      <div className="skeleton-bar" />
      <div className="skeleton-bar" />
    </div>
  );
}

// Usage in all charts
{loading ? <LoadingSkeleton /> : <RechartsChart data={data} />}
```

**Impact**: Better UX during data fetch.

### 2.4 Add Keyboard Navigation Support
**Severity**: MEDIUM
**Area**: Accessibility
**Effort**: Medium

**Problem**: Theme panel does not support keyboard navigation.

**Recommendation**: Add keyboard navigation to ThemePanel.

```typescript
// frontend/src/components/ThemePanel.tsx
export function ThemePanel({ open, onClose, ... }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
  
  return (
    <div ref={panelRef} className="theme-panel" role="dialog" aria-label="Theme settings">
      {/* ... */}
    </div>
  );
}
```

**Impact**: Accessibility compliance, better UX for keyboard users.

### 2.5 Add Responsive Breakpoints
**Severity**: MEDIUM
**Area**: Frontend
**Effort**: Medium

**Problem**: No responsive design for mobile/tablet.

**Recommendation**: Add CSS media queries for responsive layout.

```css
/* frontend/src/styles/theme.css */
@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  
  .dashboard-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard-grid {
    padding: 8px;
  }
  
  .card {
    padding: 12px;
  }
}
```

**Impact**: Mobile/tablet support.

## Priority 3: Medium-Impact Improvements

### 3.1 Add API Documentation
**Severity**: MEDIUM
**Area**: Documentation
**Effort**: Medium

**Problem**: No OpenAPI/Swagger documentation.

**Recommendation**: Add OpenAPI documentation for all endpoints.

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: System Dashboard API
  version: 1.0.0
paths:
  /api/health:
    get:
      summary: Health check
      responses:
        200:
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
  /api/metrics/cpu:
    get:
      summary: CPU metrics
      responses:
        200:
          description: CPU metrics
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CpuMetricsResponse'
```

**Impact**: Easier API integration, better developer experience.

### 3.2 Add Logging Framework
**Severity**: MEDIUM
**Area**: Backend
**Effort**: Medium

**Problem**: Uses `console.log` instead of proper logging.

**Recommendation**: Add `tracing` crate with proper log levels.

```rust
// backend/src/main.rs
use tracing::{info, error, warn};

pub async fn main() {
    tracing_subscriber::init();
    
    info!("Starting dashboard server");
    
    // In collectors
    match collect_cpu_metrics() {
        Ok(metrics) => info!("CPU metrics collected", { "utilization": metrics.utilization_percent }),
        Err(e) => error!("Failed to collect CPU metrics", { "error": e }),
    }
}
```

**Impact**: Better debugging, production monitoring.

### 3.3 Add CI/CD Pipeline
**Severity**: MEDIUM
**Area**: DevOps
**Effort**: Medium

**Problem**: No automated testing or deployment.

**Recommendation**: Add GitHub Actions workflow.

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Run tests
        run: cd backend && cargo test
      - name: Setup Node
        uses: actions/setup-node@v4
      - name: Run tests
        run: cd frontend && npm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint Rust
        run: cd backend && cargo clippy
      - name: Lint TypeScript
        run: cd frontend && npm run lint
```

**Impact**: Automated testing, code quality enforcement.

### 3.4 Enable Strict TypeScript Mode
**Severity**: MEDIUM
**Area**: Frontend
**Effort**: Low

**Problem**: No strict TypeScript mode.

**Recommendation**: Enable strict mode in `tsconfig.json`.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Impact**: Compile-time error detection, better code quality.

## Priority 4: Low-Impact Improvements

### 4.1 Add Docker Configuration
**Severity**: LOW
**Area**: DevOps
**Effort**: Low

**Problem**: No Docker configuration.

**Recommendation**: Add Dockerfile and docker-compose.yml.

```dockerfile
# backend/Dockerfile
FROM rust:1.75 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/dashboard /usr/local/bin/dashboard
CMD ["dashboard"]
```

```yaml
# docker-compose.yml
version: '3'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend
```

**Impact**: Easier deployment, local development.

### 4.2 Add Environment Variables
**Severity**: LOW
**Area**: Configuration
**Effort**: Low

**Problem**: Port numbers and API keys are hardcoded.

**Recommendation**: Add environment variable support.

```rust
// backend/src/main.rs
use std::env;

pub async fn main() {
    let port = env::get_var("PORT").unwrap_or("3001");
    let host = env::get_var("HOST").unwrap_or("0.0.0.0");
    
    axum::serve(&format!("{}:{}", host, port));
}
```

```bash
# .env
PORT=3001
HOST=0.0.0.0
```

**Impact**: Flexible configuration.

### 4.3 Add Changelog
**Severity**: LOW
**Area**: Documentation
**Effort**: Low

**Problem**: No CHANGELOG.md.

**Recommendation**: Add CHANGELOG.md with version history.

```markdown
# Changelog

## [Unreleased]

### Added
- Per-device baseline tracking for storage I/O stats
- Combined toggle button for storage charts
- Write series (dashed line) to storage charts
- X-axis timestamp sorting for storage charts
- Tooltips with per-device read/write throughput, IOPS, and utilization

### Fixed
- nvme0n1 io_stats null issue
- X-axis direction in storage charts
- X-axis type for proper time ordering

## [1.0.0] - 2024-01-01
- Initial release
```

**Impact**: Version tracking, release management.

### 4.4 Add README
**Severity**: LOW
**Area**: Documentation
**Effort**: Low

**Problem**: No README.md.

**Recommendation**: Add README.md with setup instructions.

```markdown
# System Dashboard

Real-time system metrics monitoring dashboard.

## Features
- CPU, Memory, GPU, and Storage metrics
- Real-time charts with 60-second rolling window
- Per-device storage I/O monitoring
- Theme customization (accent colors, backgrounds)

## Setup
1. Clone repository
2. Start backend: `cd backend && cargo run`
3. Start frontend: `cd frontend && npm run dev`
4. Open http://localhost:5173

## API
- Health: `GET /api/health`
- CPU: `GET /api/metrics/cpu`
- Memory: `GET /api/metrics/memory`
- GPU: `GET /api/metrics/gpu`
- Storage: `GET /api/metrics/storage`
- Storage History: `GET /api/metrics/storage-history/{device}`

## Configuration
- `PORT`: Backend port (default: 3001)
- `VITE_API_URL`: Frontend API URL (default: http://localhost:3001)
```

**Impact**: Easier onboarding, better documentation.

## Summary

| Priority | Count | Area | Effort |
|----------|-------|------|--------|
| 1 (Critical) | 3 | Backend, Frontend, Code Quality | Low-Medium |
| 2 (High) | 5 | Frontend, Testing, Accessibility | Medium |
| 3 (Medium) | 4 | Documentation, Backend, DevOps | Medium |
| 4 (Low) | 4 | DevOps, Documentation | Low |
| **Total** | **16** | | |

## Implementation Order

1. **Remove unused code** (5 min)
2. **Add request caching** (1 hour)
3. **Standardize error handling** (2 hours)
4. **Add type safety to context** (2 hours)
5. **Add unit tests** (4 hours)
6. **Add loading indicators** (1 hour)
7. **Add keyboard navigation** (2 hours)
8. **Add responsive breakpoints** (2 hours)
9. **Add API documentation** (2 hours)
10. **Add logging framework** (2 hours)
11. **Add CI/CD pipeline** (2 hours)
12. **Enable strict TypeScript** (30 min)
13. **Add Docker configuration** (1 hour)
14. **Add environment variables** (30 min)
15. **Add changelog** (15 min)
16. **Add README** (30 min)

**Total estimated effort**: ~20 hours
