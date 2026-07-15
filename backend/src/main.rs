//! Main entry point for the Model Deck backend.
//!
// Starts an Axum HTTP server on port 3001 that serves REST API endpoints
// for real-time system metrics polling.

use axum::serve;
use std::net::Ipv4Addr;
use model_deck::api::routes::create_router;

#[tokio::main]
async fn main() {
    // Initialize launcher state and start metrics updater
    let _profiles = model_deck::api::launcher::scan_profiles();
    model_deck::api::launcher::start_metrics_updater();

    let app = create_router();
    let addr = Ipv4Addr::UNSPECIFIED;
    let port = 3001;
    let url = format!("http://{addr}:{port}");

    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await.unwrap();

    println!("Model Deck API");
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
