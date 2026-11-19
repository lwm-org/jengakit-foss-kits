use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::net::SocketAddr;

#[derive(Serialize)]
struct Status {
    status: String,
    message: String,
}

async fn health_check() -> Json<Status> {
    Json(Status {
        status: "ok".to_string(),
        message: "Rust service is running smoothly".to_string(),
    })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(health_check));
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}