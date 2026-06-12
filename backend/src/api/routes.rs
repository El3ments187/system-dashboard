//! API route handlers.

use axum::routing::get;
use axum::Json;
use serde_json::{json, Value};

use crate::collectors::cpu::collect_cpu_metrics;
use crate::collectors::memory::collect_memory_metrics;
use crate::collectors::gpu::collect_gpu_metrics;
use crate::collectors::storage::{collect_storage_by_device, collect_storage_history, collect_storage_metrics};
use crate::collectors::system::collect_system_metrics;

pub fn create_router() -> axum::Router {
    axum::Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/metrics/cpu", get(cpu_handler))
        .route("/api/metrics/memory", get(memory_handler))
        .route("/api/metrics/gpu", get(gpu_handler))
        .route("/api/metrics/storage", get(storage_handler))
        .route("/api/metrics/storage/devices", get(storage_devices_handler))
        .route("/api/metrics/storage/history", get(storage_history_handler))
        .route("/api/metrics/system", get(system_handler))
}

async fn health_handler() -> axum::response::Json<Value> {
    Json(json!({
        "status": "ok",
        "message": "System Dashboard API is running",
    }))
}

async fn cpu_handler() -> axum::response::Json<Value> {
    let metrics = collect_cpu_metrics();
    let json_data = serde_json::to_value(&metrics).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn memory_handler() -> axum::response::Json<Value> {
    let metrics = collect_memory_metrics();
    let json_data = serde_json::to_value(&metrics).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn gpu_handler() -> axum::response::Json<Value> {
    let metrics = collect_gpu_metrics();
    let json_data = serde_json::to_value(&metrics).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_handler() -> axum::response::Json<Value> {
    let metrics = collect_storage_metrics();
    let json_data = serde_json::to_value(&metrics).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_devices_handler() -> axum::response::Json<Value> {
    let devices = collect_storage_by_device();
    let json_data = serde_json::to_value(&devices).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn storage_history_handler() -> axum::response::Json<Value> {
    let history = collect_storage_history();
    let json_data = serde_json::to_value(&history).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}

async fn system_handler() -> axum::response::Json<Value> {
    let metrics = collect_system_metrics();
    let json_data = serde_json::to_value(&metrics).unwrap();
    Json(json!({
        "data": json_data,
        "timestamp": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
    }))
}
