//! Custom error types for the monitoring API.

use axum::http::StatusCode;

#[derive(Debug, PartialEq)]
#[allow(dead_code)]
pub enum AppError {
    MetricCollectionFailed(String),
    GpuUnavailable(String),
    DiskReadError(String),
    SystemInfoError(String),
    InternalError(String),
}

#[allow(dead_code)]
impl AppError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::GpuUnavailable(_) => StatusCode::OK,
            AppError::MetricCollectionFailed(_) => StatusCode::OK,
            AppError::DiskReadError(_) => StatusCode::OK,
            AppError::SystemInfoError(_) => StatusCode::OK,
            AppError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            AppError::MetricCollectionFailed(_) => "metric_collection_failed",
            AppError::GpuUnavailable(_) => "gpu_unavailable",
            AppError::DiskReadError(_) => "disk_read_error",
            AppError::SystemInfoError(_) => "system_info_error",
            AppError::InternalError(_) => "internal_error",
        }
    }
}
