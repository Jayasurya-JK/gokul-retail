//! Gokul Retail core. All business rules and database access live here.
//! No Tauri dependency, so everything is testable with `cargo test`.

#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

pub mod db;
pub mod error;
pub mod info;
pub mod migrations;
pub mod paths;
pub mod stock;

pub use db::Db;
pub use error::{Error, Result};
pub use info::AppInfo;
pub use stock::{post_stock, Movement, Reason};

#[cfg(test)]
pub(crate) mod testutil;

#[cfg(test)]
mod tests;
