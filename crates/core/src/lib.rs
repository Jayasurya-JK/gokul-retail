//! Gokul Retail core. All business rules and database access live here.
//! No Tauri dependency, so everything is testable with `cargo test`.

#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

pub mod api;
pub mod app;
pub mod audit;
pub mod auth;
pub mod clock;
pub mod db;
pub mod error;
pub mod info;
pub mod migrations;
pub mod nav;
pub mod paths;
pub mod pin;
pub mod recovery;
pub mod session;
pub mod settings;
pub mod stock;

pub use api::{AppError, ErrorCode};
pub use app::AppContext;
pub use audit::AppKind;
pub use db::Db;
pub use error::{Error, FieldError, Result};
pub use info::AppInfo;
pub use pin::Pin;
pub use stock::{post_stock, Movement, Reason};

#[cfg(test)]
pub(crate) mod testutil;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod login_tests;
