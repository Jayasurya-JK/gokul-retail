//! gokul-core: all Gokul Retail business rules and the SQLite database. No Tauri dependency.

pub mod analysis;
pub mod authz;
pub mod backup;
pub mod barrels;
pub mod bills;
pub mod billops;
pub mod catalog;
pub mod crm;
pub mod dash;
pub mod db;
pub mod dispatch;
pub mod error;
pub mod expenses;
pub mod godown;
pub mod gst;
pub mod gstr;
pub mod hsn;
pub mod invoice;
pub mod labels;
pub mod live_setup;
pub mod loyalty;
pub mod lots;
pub mod points;
pub mod mill;
pub mod money;
pub mod native;
pub mod posreports;
pub mod printing;
pub mod purchasing;
pub mod reports;
pub mod seed_demo; // DEMO DATA: remove this line (and the file) when the demo shop is no longer wanted
pub mod shift;
pub mod store;
pub mod sync;
pub mod types;

pub use db::Db;
pub use authz::Session;
pub use dispatch::{dispatch, dispatch_session, METHODS};
pub use error::{ApiError, Result};
pub use seed_demo::seed_demo_if_empty;
