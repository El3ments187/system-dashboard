# Technical Debt

## Overview

This document identifies technical debt in the Model Deck codebase, categorized by severity and area.

## Critical Debt

### 1. Unused Hook (HIGH)
**File**: `frontend/src/hooks/useMetrics.ts`

**Issue**: `useMetrics` hook exists but is never imported or used anywhere in the codebase.

**Impact**: Dead code, maintenance burden.

**Recommendation**: Remove `useMetrics` or document its intended use.

### 2. Empty Handlers Directory (HIGH)
**File**: `backend/src/api/{handlers}/`

**Issue**: Directory `{handlers}` exists but is empty. The curly braces suggest a copy-paste error from shell glob syntax.

**Impact**: Confusion for future developers, potential deployment issues.

**Recommendation**: Remove the directory or document its purpose.

### 3. Missing Error Types (MEDIUM)
**File**: `backend/src/error.rs`

**Issue**: `AppError` enum has `StorageError` variant with sub-errors, but no `CpuError`, `MemoryError`, or `GpuError` types.

**Impact**: Inconsistent error handling across collectors.

**Recommendation**: Add error types for all collectors or unify error handling.

## High Debt

### 4. No Type Safety in Context (MEDIUM)
**File**: `frontend/src/context/MetricsContext.tsx`

**Issue**: Uses `Array<any>` for `cpuCurrentValues`, `memoryCurrentValues`, `gpuCurrentValues`, and `cpuHistories`, `memoryHistories`, `gpuHistories`.

**Impact**: Loss of type safety, potential runtime errors.

**Recommendation**: Define proper types for metric arrays.

### 5. Hardcoded Polling Interval (MEDIUM)
**File**: `frontend/src/hooks/useMultiMetrics.ts`

**Issue**: Polling interval is hardcoded to `1000` in `setInterval(fetchData, 1000)`.

**Impact**: Cannot configure polling interval without code changes.

**Recommendation**: Make interval configurable via props or environment variable.

### 6. No Retry Logic for Storage (MEDIUM)
**File**: `frontend/src/hooks/useStorageMetrics.ts`

**Issue**: Storage metrics use a simple `setInterval` without exponential backoff or retry logic.

**Impact**: Rapid retry on network failure, server overload.

**Recommendation**: Add exponential backoff or use a retry library.

### 7. Inconsistent Data Types in Context (MEDIUM)
**File**: `frontend/src/context/MetricsContext.tsx`

**Issue**: `storageHistories` is `Map<string, StorageHistoryPoint[]>` but storage devices are `Array<any>`.

**Impact**: Inconsistent data structure, potential runtime errors.

**Recommendation**: Define proper types for all context values.

## Medium Debt

### 8. No Unit Tests (HIGH)
**Issue**: No test files found in the codebase.

**Impact**: No regression protection, difficult to refactor safely.

**Recommendation**: Add unit tests for collectors, models, and utilities.

### 9. No Integration Tests (MEDIUM)
**Issue**: No end-to-end tests for API endpoints.

**Impact**: API changes may break without detection.

**Recommendation**: Add integration tests for health and metrics endpoints.

### 10. No TypeScript Strict Mode (MEDIUM)
**Issue**: `any` types used throughout (context, hooks, components).

**Impact**: Loss of type safety, potential runtime errors.

**Recommendation**: Enable strict TypeScript mode and replace `any` types.

### 11. No API Documentation (MEDIUM)
**Issue**: No OpenAPI/Swagger documentation for the API.

**Impact**: Developers must read source code to understand API.

**Recommendation**: Add OpenAPI documentation.

### 12. No Logging Framework (MEDIUM)
**File**: `backend/src/collectors/cpu.rs`, `backend/src/collectors/gpu.rs`

**Issue**: Uses `console.log` instead of a proper logging framework.

**Impact**: No log levels, no structured logging, no log rotation.

**Recommendation**: Add `tracing` or `log` crate with proper log levels.

## Low Debt

### 13. No CI/CD Pipeline (MEDIUM)
**Issue**: No GitHub Actions or other CI/CD configuration.

**Impact**: No automated testing, building, or deployment.

**Recommendation**: Add CI/CD pipeline with Rust and TypeScript checks.

### 14. No Docker Configuration (LOW)
**Issue**: No Dockerfile or docker-compose.yml.

**Impact**: Difficult to deploy or run locally.

**Recommendation**: Add Docker configuration.

### 15. No Environment Variables (LOW)
**Issue**: No `.env` file or environment variable handling.

**Impact**: Port numbers, API keys, etc. are hardcoded.

**Recommendation**: Add environment variable support.

### 16. No Changelog (LOW)
**Issue**: No CHANGELOG.md or version history.

**Impact**: Difficult to track changes.

**Recommendation**: Add CHANGELOG.md or use Git tags.

### 17. No README (LOW)
**Issue**: No README.md in the project root.

**Impact**: Difficult for new developers to understand the project.

**Recommendation**: Add README.md with setup instructions.

## Code Quality Issues

### 18. No ESLint Configuration (MEDIUM)
**File**: `frontend/`

**Issue**: No `.eslintrc` or ESLint configuration found.

**Impact**: Inconsistent code style, potential bugs.

**Recommendation**: Add ESLint with React and TypeScript rules.

### 19. No Prettier Configuration (LOW)
**File**: `frontend/`

**Issue**: No `.prettierrc` or Prettier configuration found.

**Impact**: Inconsistent code formatting.

**Recommendation**: Add Prettier configuration.

### 20. No TypeScript Config Strictness (MEDIUM)
**File**: `frontend/tsconfig.json`

**Issue**: May not have strict mode enabled.

**Impact**: Loss of type safety.

**Recommendation**: Enable strict mode in tsconfig.json.

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Critical | 3 | HIGH |
| High | 4 | MEDIUM |
| Medium | 9 | MEDIUM |
| Low | 6 | LOW |
| **Total** | **22** | |

## Prioritized Fixes

1. Remove unused `useMetrics` hook
2. Clean up empty `{handlers}` directory
3. Add proper error types for all collectors
4. Replace `any` types with proper types in context
5. Add unit tests for collectors
6. Add integration tests for API endpoints
7. Enable strict TypeScript mode
8. Add API documentation
9. Add logging framework
10. Add CI/CD pipeline
