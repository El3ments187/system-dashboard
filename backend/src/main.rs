//! Main entry point for the System Dashboard backend.
//!
// Starts an Axum HTTP server on port 3001 that serves REST API endpoints
// for real-time system metrics polling.

use axum::serve;
use std::net::Ipv4Addr;
use system_dashboard::api::routes::create_router;

#[tokio::main]
async fn main() {
    let app = create_router();
    let addr = Ipv4Addr::UNSPECIFIED;
    let port = 3001;
    let url = format!("http://{addr}:{port}");

    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await.unwrap();

    println!("System Dashboard API");
    println!("====================");
    println!("  Server running at {url}");
    println!("  API endpoints:");
    println!("    GET {url}/api/health");
    println!("    GET {url}/api/metrics/cpu");
    println!("    GET {url}/api/metrics/memory");
    println!("    GET {url}/api/metrics/gpu");
    println!("    GET {url}/api/metrics/storage");
    println!("    GET {url}/api/metrics/system");
    println!("    GET {url}/api/status");
    println!();
    println!("Press Ctrl+C to stop.");

    serve(listener, app).await.unwrap();
}
