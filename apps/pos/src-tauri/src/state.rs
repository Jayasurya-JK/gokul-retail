use gokul_core::Db;
use std::sync::Mutex;

/// Shared app state: the one database handle.
pub struct AppState {
    pub db: Mutex<Db>,
}
