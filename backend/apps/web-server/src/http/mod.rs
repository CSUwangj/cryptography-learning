//! Thin Axum adapters over the bootstrapped [`Application`](crate::bootstrap::Application).

mod router;

pub use router::app_router;
