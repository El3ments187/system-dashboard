//! Model Deck backend library.
//!
//! Provides system metrics collection, API routing, and data models.
#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate,
    // Structural / opinion lints — not fixing without explicit scope
    clippy::too_many_lines,
    clippy::fn_params_excessive_bools,
    clippy::implicit_hasher,
    clippy::similar_names,
)]

pub mod api;
pub mod collectors;
pub mod error;
pub mod models;
